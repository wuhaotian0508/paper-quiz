import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  DifficultySchema,
  parseQuestionConfiguration,
  parseSettings,
  QuizSchema,
} from "@/lib/quiz";
import { getOpenAIClientOptions, getOpenAIModel } from "@/lib/openai-config";
import { collectResponse } from "@/lib/openai-stream";
import { getQuizGenerationOptions } from "@/lib/quiz-generation";
import { parseQuizOutput } from "@/lib/quiz-output";
import { buildQuizInstructions } from "@/lib/quiz-prompt";
import { generateDistinctQuiz } from "@/lib/quiz-coverage";
import { MAX_TRANSCRIPT_CHARS, readBoundedText, validatePdfFile } from "@/lib/request-validation";
import { buildSourceFileParts, MAX_SOURCE_FILES, uploadSourceFiles } from "@/lib/source-reference";
import { del } from "@vercel/blob";
import { readStudyFiles } from "@/lib/study-upload";
import { readLocale, translate } from "@/lib/i18n";

export const maxDuration = 100;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let temporaryBlobUrls: string[] = [];
  try {
    const form = await request.formData();
    const uploaded = await readStudyFiles(form);
    const files = uploaded.files;
    temporaryBlobUrls = uploaded.temporaryBlobUrls;
    const transcriptValue = form.get("transcript");
    const transcript = transcriptValue
      ? readBoundedText(transcriptValue, MAX_TRANSCRIPT_CHARS)
      : "";
    if (typeof transcriptValue === "string" && transcriptValue.trim() && transcript === null)
      return jsonError("Lecture transcript is too long or invalid.", 400);
    const countValue = String(form.get("count") ?? "");
    const questionConfigValue = String(form.get("questions") ?? "");
    const difficultyValue = String(form.get("difficulty") ?? "");
    const locale = readLocale(form.get("locale") === null ? null : String(form.get("locale")));

    if (!files.length && !transcript) {
      return jsonError("Please upload a PDF or provide a lecture transcript.", 400);
    }
    if (files.length && transcript) {
      return jsonError("Choose either PDFs or a lecture transcript, not both.", 400);
    }
    if (files.length > MAX_SOURCE_FILES) {
      return jsonError(`Choose up to ${MAX_SOURCE_FILES} PDF files at a time.`, 400);
    }
    for (const file of files) {
      const validation = validatePdfFile(file);
      if (!validation.valid) return jsonError(validation.error, 400);
    }

    let settings: { difficulty: string; questions: ReturnType<typeof parseQuestionConfiguration> };
    try {
      if (questionConfigValue) {
        const difficulty = DifficultySchema.parse(difficultyValue);
        settings = { difficulty, questions: parseQuestionConfiguration(questionConfigValue) };
      } else {
        const legacy = parseSettings(countValue, difficultyValue);
        settings = {
          difficulty: legacy.difficulty,
          questions: [{ type: "multiple_choice", count: legacy.count }],
        };
      }
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Quiz settings are invalid.", 400);
    }

    const clientOptions = getOpenAIClientOptions();
    if (!clientOptions) {
      return jsonError("The server has not been configured with an OpenAI API key.", 503);
    }

    const client = new OpenAI(clientOptions);
    const totalQuestions = settings.questions.reduce((sum, item) => sum + item.count, 0);
    const generationOptions = getQuizGenerationOptions(getOpenAIModel(), totalQuestions);
    // Upload each PDF once. Later grading and tutor chat reuse all issued ids rather
    // than re-sending a combined document on every request.
    const sourceFileIds = files.length ? await uploadSourceFiles(client, files) : [];
    const sourceNames = files.map((file) => file.name).join(", ");
    const sourceParts = files.length
      ? await buildSourceFileParts({ fileIds: sourceFileIds, files })
      : [];
    const generateOnce = async (correction?: string) => {
      const instructions = files.length
        ? `${buildQuizInstructions({ ...settings, locale })}\n\nUse all selected PDFs as one study set. In every sourceNote, name the supporting source file and page or section when available. Selected files: ${sourceNames}.`
        : `${buildQuizInstructions({ ...settings, locale })}\n\n<lecture_transcript>\n${transcript}\n</lecture_transcript>`;
      const stream = await client.responses.create({
        ...generationOptions,
        input: [
          {
            role: "user",
            content: [
              ...sourceParts,
              {
                type: "input_text" as const,
                text: `${instructions}${correction ? `\n\n${correction}` : ""}`,
              },
            ],
          },
        ],
        text: { format: zodTextFormat(QuizSchema, "quiz") },
      });
      const { text: outputText, stoppedEarlyBecause, usage } = await collectResponse(stream);
      if (stoppedEarlyBecause === "max_output_tokens")
        throw new Error(
          "The quiz was cut off before it finished. Ask for fewer questions and try again.",
        );
      if (stoppedEarlyBecause) throw new Error("Quiz generation stopped early. Please try again.");
      if (!outputText) throw new Error("AI did not return a usable quiz. Please try again.");
      return parseQuizOutput(
        outputText,
        files.length
          ? files.map((file) => file.name).join(" + ")
          : translate(locale, "transcript.label"),
      );
    };

    const quiz = await generateDistinctQuiz(generateOnce);
    return Response.json({
      ...quiz,
      sourceFileId: sourceFileIds[0] ?? null,
      sourceFileIds,
    });
  } catch (error) {
    console.error(
      "Quiz generation failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return jsonError("Quiz generation failed. Please try again later.", 502);
  } finally {
    await Promise.all(
      temporaryBlobUrls.map(async (url) => {
        try {
          await del(url);
        } catch (cause) {
          console.error(
            "Temporary study upload cleanup failed",
            cause instanceof Error ? cause.message : "unknown error",
          );
        }
      }),
    );
  }
}

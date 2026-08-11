import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  DEFAULT_DIFFICULTY,
  assertQuizMatchesQuestionConfiguration,
  DifficultySchema,
  parseQuestionConfiguration,
  parseSettings,
  QuizSchema,
} from "@/lib/quiz";
import { getOpenAIClientOptions, getOpenAIModel } from "@/lib/openai-config";
import { collectResponse, type ResponseUsage } from "@/lib/openai-stream";
import { mergeUsage } from "@/lib/usage-meter";
import { getQuizGenerationOptions } from "@/lib/quiz-generation";
import { parseQuizOutput } from "@/lib/quiz-output";
import { buildQuizInstructions, buildQuizPreferencePrompt } from "@/lib/quiz-prompt";
import { generateDistinctQuiz } from "@/lib/quiz-coverage";
import { LearnerFacingError, learnerFacingMessage } from "@/lib/learner-error";
import {
  MAX_TRANSCRIPT_CHARS,
  parseGenerationBrief,
  readBoundedText,
  validatePdfFile,
} from "@/lib/request-validation";
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
    const brief = parseGenerationBrief(form.get("brief"));

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
        // The difficulty picker is gone from the UI, so the field arrives only from a
        // browser still on the previous bundle. Absent means the default level, not a
        // malformed request; a supplied value is still honoured and still validated.
        const difficulty = difficultyValue
          ? DifficultySchema.parse(difficultyValue)
          : DEFAULT_DIFFICULTY;
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
    let totalUsage: ResponseUsage | null = null;
    const generateOnce = async (correction?: string) => {
      const instructions = [
        buildQuizInstructions({ ...settings, locale }),
        files.length
          ? `Use all selected PDFs as one study set. In every sourceNote, name the supporting source file and page or section when available. Selected files: ${sourceNames}.`
          : "The lecture transcript in the user input is the sole study material.",
      ].join("\n\n");
      const inputText = [
        // Keep the authoritative prompt in the user content as well as `instructions`.
        // The configured OpenAI-compatible gateway has historically dropped the latter,
        // leaving the model with only the PDF and learner brief and causing prose/invalid JSON.
        instructions,
        buildQuizPreferencePrompt(brief),
        transcript ? `<lecture_transcript>\n${transcript}\n</lecture_transcript>` : "",
        correction ?? "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const stream = await client.responses.create({
        ...generationOptions,
        instructions,
        input: [
          {
            role: "user",
            content: [
              ...sourceParts,
              ...(inputText ? [{ type: "input_text" as const, text: inputText }] : []),
            ],
          },
        ],
        text: { format: zodTextFormat(QuizSchema, "quiz") },
      });
      const { text: outputText, stoppedEarlyBecause, usage } = await collectResponse(stream);
      // Accumulated across attempts: a repeated-question retry is billed twice.
      totalUsage = mergeUsage(totalUsage, usage);
      if (stoppedEarlyBecause === "max_output_tokens")
        throw new LearnerFacingError(
          "The quiz was cut off before it finished. Ask for fewer questions and try again.",
        );
      if (stoppedEarlyBecause)
        throw new LearnerFacingError("Quiz generation stopped early. Please try again.");
      if (!outputText)
        throw new LearnerFacingError("AI did not return a usable quiz. Please try again.");
      const quiz = parseQuizOutput(
        outputText,
        files.length
          ? files.map((file) => file.name).join(" + ")
          : translate(locale, "transcript.label"),
      );
      assertQuizMatchesQuestionConfiguration(quiz, settings.questions);
      return quiz;
    };

    const quiz = await generateDistinctQuiz(generateOnce);
    return Response.json({
      ...quiz,
      sourceFileId: sourceFileIds[0] ?? null,
      sourceFileIds,
      usage: totalUsage,
    });
  } catch (error) {
    console.error(
      "Quiz generation failed",
      error instanceof Error ? error.message : "unknown error",
    );
    // A learner-facing message survives; anything else stays the generic sentence so a
    // provider or parsing failure never leaks its internals into the response.
    return jsonError(
      learnerFacingMessage(error, "Quiz generation failed. Please try again later."),
      502,
    );
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

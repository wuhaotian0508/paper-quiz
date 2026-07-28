import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  DifficultySchema,
  parseQuestionConfiguration,
  parseSettings,
  QuizSchema,
} from "@/lib/quiz";
import { getOpenAIClientOptions, getOpenAIModel } from "@/lib/openai-config";
import { collectResponseText } from "@/lib/openai-stream";
import { getQuizGenerationOptions } from "@/lib/quiz-generation";
import { parseQuizOutput } from "@/lib/quiz-output";
import { buildQuizInstructions } from "@/lib/quiz-prompt";
import { MAX_TRANSCRIPT_CHARS, readBoundedText, validatePdfFile } from "@/lib/request-validation";
import { requestRateLimit } from "@/lib/rate-limit";
import { buildSourceFileParts, uploadSourceFile } from "@/lib/source-reference";

export const maxDuration = 60;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const rate = await requestRateLimit(request);
    if (!rate.allowed)
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      );
    const form = await request.formData();
    const file = form.get("file");
    const transcriptValue = form.get("transcript");
    const transcript = transcriptValue
      ? readBoundedText(transcriptValue, MAX_TRANSCRIPT_CHARS)
      : "";
    if (typeof transcriptValue === "string" && transcriptValue.trim() && transcript === null)
      return jsonError("Lecture transcript is too long or invalid.", 400);
    const countValue = String(form.get("count") ?? "");
    const questionConfigValue = String(form.get("questions") ?? "");
    const difficultyValue = String(form.get("difficulty") ?? "");

    if (!(file instanceof File) && !transcript) {
      return jsonError("Please upload a PDF or provide a lecture transcript.", 400);
    }
    if (file instanceof File && transcript) {
      return jsonError("Choose either a PDF or a lecture transcript, not both.", 400);
    }
    if (file instanceof File) {
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
    const generationOptions = getQuizGenerationOptions(getOpenAIModel());
    // Upload the PDF once and reference it by id from here on. Grading and tutor chat
    // reuse the same id instead of re-sending the whole document per request.
    const sourceFileId = file instanceof File ? await uploadSourceFile(client, file) : null;
    const sourceContent =
      file instanceof File
        ? [
            ...(await buildSourceFileParts({ fileId: sourceFileId, file })),
            {
              type: "input_text" as const,
              text: buildQuizInstructions(settings),
            },
          ]
        : [
            {
              type: "input_text" as const,
              text: `${buildQuizInstructions(settings)}\n\n<lecture_transcript>\n${transcript}\n</lecture_transcript>`,
            },
          ];
    const stream = await client.responses.create({
      ...generationOptions,
      input: [
        {
          role: "user",
          content: sourceContent,
        },
      ],
      text: { format: zodTextFormat(QuizSchema, "quiz") },
    });

    const outputText = await collectResponseText(stream);
    if (!outputText) {
      return jsonError("AI did not return a usable quiz. Please try again.", 502);
    }

    try {
      const quiz = parseQuizOutput(
        outputText,
        file instanceof File ? file.name : "Lecture transcript",
      );
      return Response.json({ ...quiz, sourceFileId });
    } catch {
      return jsonError("AI returned an incomplete quiz format. Please try again.", 502);
    }
  } catch (error) {
    console.error(
      "Quiz generation failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return jsonError("Quiz generation failed. Please try again later.", 502);
  }
}

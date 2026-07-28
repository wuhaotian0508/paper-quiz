import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { GradeResultSchema, QuestionSchema } from "@/lib/quiz";
import { getOpenAIClientOptions, getOpenAIModel } from "@/lib/openai-config";
import { collectResponseText } from "@/lib/openai-stream";
import {
  MAX_ANSWER_CHARS,
  MAX_QUESTION_CHARS,
  MAX_TRANSCRIPT_CHARS,
  readBoundedText,
  validatePdfFile,
} from "@/lib/request-validation";
import { requestRateLimit } from "@/lib/rate-limit";
import { buildSourceFileParts, parseSourceFileId } from "@/lib/source-reference";

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const rate = await requestRateLimit(request);
    if (!rate.allowed)
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      );
    const form = await request.formData();
    const answer = readBoundedText(form.get("answer"), MAX_ANSWER_CHARS);
    const transcript = readBoundedText(form.get("transcript"), MAX_TRANSCRIPT_CHARS) || "";
    const file = form.get("file");
    const fileId = parseSourceFileId(form.get("fileId"));
    const rawQuestion = readBoundedText(form.get("question"), MAX_QUESTION_CHARS) || "";
    if (form.has("fileId") && !fileId)
      return error("The study material reference is invalid.", 400);
    if (
      !answer ||
      !rawQuestion ||
      (form.has("transcript") && transcript === "") ||
      (!transcript && !fileId && !(file instanceof File))
    )
      return error("Please provide an answer, question, and study material.", 400);
    let parsedQuestion: unknown;
    try {
      parsedQuestion = JSON.parse(rawQuestion);
    } catch {
      return error("The current question is invalid.", 400);
    }
    const question = QuestionSchema.safeParse(parsedQuestion);
    if (!question.success || question.data.type === "multiple_choice")
      return error("This question cannot be graded as a written answer.", 400);
    const options = getOpenAIClientOptions();
    if (!options) return error("The server has not been configured with an OpenAI API key.", 503);
    if (!fileId && file instanceof File) {
      const validation = validatePdfFile(file);
      if (!validation.valid) return error(validation.error, 400);
    }
    const sourceFileParts = await buildSourceFileParts({
      fileId,
      file: file instanceof File ? file : null,
    });
    const stream = await new OpenAI(options).responses.create({
      model: getOpenAIModel(),
      stream: true,
      max_output_tokens: 900,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text" as const,
              text: [
                "Grade the student's answer only against the supplied lecture transcript and question.",
                "Return correct, partial, or incorrect; score must be 0 to 1. Do not invent facts.",
                `QUESTION: ${JSON.stringify(question.data)}`,
                `STUDENT ANSWER: ${answer}`,
                ...(transcript ? [`LECTURE TRANSCRIPT: ${transcript}`] : []),
              ].join("\n\n"),
            },
            ...sourceFileParts,
          ],
        },
      ],
      text: { format: zodTextFormat(GradeResultSchema, "grade") },
    });
    const output = await collectResponseText(stream);
    return Response.json(GradeResultSchema.parse(JSON.parse(output)));
  } catch (cause) {
    console.error(
      "Answer grading failed",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return error("Answer grading failed. Please try again later.", 502);
  }
}

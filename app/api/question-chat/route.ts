import OpenAI from "openai";
import { getOpenAIClientOptions, getOpenAIModel } from "@/lib/openai-config";
import { QuestionSchema } from "@/lib/quiz";
import { collectResponseText } from "@/lib/openai-stream";
import {
  MAX_MESSAGE_CHARS,
  MAX_QUESTION_CHARS,
  MAX_TRANSCRIPT_CHARS,
  parseChatHistory,
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
    const message = readBoundedText(form.get("message"), MAX_MESSAGE_CHARS);
    const transcript = readBoundedText(form.get("transcript"), MAX_TRANSCRIPT_CHARS) || "";
    const rawQuestion = readBoundedText(form.get("question"), MAX_QUESTION_CHARS) || "";
    const rawHistory = String(form.get("history") ?? "[]");
    const file = form.get("file");
    const fileId = parseSourceFileId(form.get("fileId"));
    if (form.has("fileId") && !fileId)
      return error("The study material reference is invalid.", 400);
    if (form.has("transcript") && transcript === "")
      return error("Lecture transcript is too long or invalid.", 400);
    if (!message || !rawQuestion || (!transcript && !fileId && !(file instanceof File)))
      return error("Please provide a question, message, and study material.", 400);
    let parsedQuestion: unknown;
    try {
      parsedQuestion = JSON.parse(rawQuestion);
    } catch {
      return error("The current question is invalid.", 400);
    }
    const question = QuestionSchema.safeParse(parsedQuestion);
    if (!question.success) return error("The current question is invalid.", 400);
    const historyResult = parseChatHistory(rawHistory);
    if (!historyResult.ok) return error(historyResult.error, 400);
    if (!fileId && file instanceof File) {
      const validation = validatePdfFile(file);
      if (!validation.valid) return error(validation.error, 400);
    }
    const options = getOpenAIClientOptions();
    if (!options) return error("The server has not been configured with an OpenAI API key.", 503);
    const content = [
      {
        type: "input_text" as const,
        text: [
          "You are a study tutor. Answer only from the supplied study material and current question.",
          "If the material does not support an answer, say so plainly. Do not invent facts.",
          `CURRENT QUESTION: ${JSON.stringify(question.data)}`,
          `CONVERSATION: ${JSON.stringify(historyResult.value)}`,
          `STUDENT: ${message}`,
          ...(transcript ? [`LECTURE TRANSCRIPT: ${transcript}`] : []),
        ].join("\n\n"),
      },
      ...(await buildSourceFileParts({ fileId, file: file instanceof File ? file : null })),
    ];
    const stream = await new OpenAI(options).responses.create({
      model: getOpenAIModel(),
      stream: true,
      max_output_tokens: 1200,
      input: [{ role: "user", content }],
    });
    const reply = await collectResponseText(stream);
    if (!reply) return error("The tutor did not return a response. Please try again.", 502);
    return Response.json({ reply });
  } catch (cause) {
    console.error("Question chat failed", cause instanceof Error ? cause.message : "unknown error");
    return error("Question chat failed. Please try again later.", 502);
  }
}

import OpenAI from "openai";
import { getOpenAIClientOptions, getOpenAIModel } from "@/lib/openai-config";
import { QuestionSchema } from "@/lib/quiz";
import { collectResponse } from "@/lib/openai-stream";
import {
  MAX_MESSAGE_CHARS,
  MAX_QUESTION_CHARS,
  MAX_TRANSCRIPT_CHARS,
  parseChatHistory,
  readBoundedText,
  validatePdfFile,
} from "@/lib/request-validation";
import {
  buildSourceFileParts,
  parseSourceFileId,
  parseSourceFileIds,
} from "@/lib/source-reference";
import { generationLanguage, readLocale } from "@/lib/i18n";

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const message = readBoundedText(form.get("message"), MAX_MESSAGE_CHARS);
    const transcript = readBoundedText(form.get("transcript"), MAX_TRANSCRIPT_CHARS) || "";
    const rawQuestion = readBoundedText(form.get("question"), MAX_QUESTION_CHARS) || "";
    const rawHistory = String(form.get("history") ?? "[]");
    const locale = readLocale(form.get("locale") === null ? null : String(form.get("locale")));
    const directFiles = form.getAll("files").filter((value): value is File => value instanceof File);
    const legacyFile = form.get("file");
    const files = directFiles.length
      ? directFiles
      : legacyFile instanceof File
        ? [legacyFile]
        : [];
    const fileId = parseSourceFileId(form.get("fileId"));
    const fileIds = parseSourceFileIds(form.get("fileIds")) || [];
    if (form.has("fileId") && !fileId)
      return error("The study material reference is invalid.", 400);
    if (form.has("fileIds") && !fileIds.length)
      return error("The study material reference is invalid.", 400);
    if (form.has("transcript") && transcript === "")
      return error("Lecture transcript is too long or invalid.", 400);
    if (!message || !rawQuestion || (!transcript && !fileId && !fileIds.length && !files.length))
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
    for (const file of files) {
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
          `Reply in ${generationLanguage(locale)}.`,
          `CURRENT QUESTION: ${JSON.stringify(question.data)}`,
          `CONVERSATION: ${JSON.stringify(historyResult.value)}`,
          `STUDENT: ${message}`,
          ...(transcript ? [`LECTURE TRANSCRIPT: ${transcript}`] : []),
        ].join("\n\n"),
      },
      ...(await buildSourceFileParts({ fileId, fileIds, files })),
    ];
    const stream = await new OpenAI(options).responses.create({
      model: getOpenAIModel(),
      stream: true,
      max_output_tokens: 1200,
      input: [{ role: "user", content }],
    });
    const { text: reply, stoppedEarlyBecause } = await collectResponse(stream);
    if (stoppedEarlyBecause === "max_output_tokens" && reply) {
      // A cut-off explanation is still useful, unlike cut-off JSON.
      const notice = "[Reply was cut short at the length limit.]";
      return Response.json({ reply: [reply, notice].join("\n\n") });
    }
    if (!reply) return error("The tutor did not return a response. Please try again.", 502);
    return Response.json({ reply });
  } catch (cause) {
    console.error("Question chat failed", cause instanceof Error ? cause.message : "unknown error");
    return error("Question chat failed. Please try again later.", 502);
  }
}

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { GradeResultSchema, QuestionSchema } from "@/lib/quiz";
import { getOpenAIClientOptions, getOpenAIModel } from "@/lib/openai-config";
import { collectResponse } from "@/lib/openai-stream";
import {
  MAX_ANSWER_CHARS,
  MAX_QUESTION_CHARS,
  MAX_TRANSCRIPT_CHARS,
  readBoundedText,
  validatePdfFile,
} from "@/lib/request-validation";
import {
  buildSourceFileParts,
  parseSourceFileId,
  parseSourceFileIds,
} from "@/lib/source-reference";

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const answer = readBoundedText(form.get("answer"), MAX_ANSWER_CHARS);
    const transcript = readBoundedText(form.get("transcript"), MAX_TRANSCRIPT_CHARS) || "";
    const directFiles = form.getAll("files").filter((value): value is File => value instanceof File);
    const legacyFile = form.get("file");
    const files = directFiles.length
      ? directFiles
      : legacyFile instanceof File
        ? [legacyFile]
        : [];
    const fileId = parseSourceFileId(form.get("fileId"));
    const fileIds = parseSourceFileIds(form.get("fileIds")) || [];
    const rawQuestion = readBoundedText(form.get("question"), MAX_QUESTION_CHARS) || "";
    if (form.has("fileId") && !fileId)
      return error("The study material reference is invalid.", 400);
    if (form.has("fileIds") && !fileIds.length)
      return error("The study material reference is invalid.", 400);
    if (
      !answer ||
      !rawQuestion ||
      (form.has("transcript") && transcript === "") ||
       (!transcript && !fileId && !fileIds.length && !files.length)
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
    for (const file of files) {
      const validation = validatePdfFile(file);
      if (!validation.valid) return error(validation.error, 400);
    }
    const sourceFileParts = await buildSourceFileParts({
      fileId,
      fileIds,
      files,
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
    const { text: output, stoppedEarlyBecause } = await collectResponse(stream);
    if (stoppedEarlyBecause) {
      console.error("Answer grading stopped early", { reason: stoppedEarlyBecause });
      return error("Grading was cut off before it finished. Please try again.", 502);
    }
    return Response.json(GradeResultSchema.parse(JSON.parse(output)));
  } catch (cause) {
    console.error(
      "Answer grading failed",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return error("Answer grading failed. Please try again later.", 502);
  }
}

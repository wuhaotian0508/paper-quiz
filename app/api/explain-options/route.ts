import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { QuestionSchema } from "@/lib/quiz";
import {
  buildOptionExplanationInstructions,
  OptionExplanationsSchema,
  parseOptionExplanationsOutput,
} from "@/lib/option-explanations";
import { getOpenAIClientOptions, getOpenAIModel } from "@/lib/openai-config";
import { collectResponse } from "@/lib/openai-stream";
import {
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
import { generationLanguage, readLocale } from "@/lib/i18n";

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const transcript = readBoundedText(form.get("transcript"), MAX_TRANSCRIPT_CHARS) || "";
    const directFiles = form
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    const legacyFile = form.get("file");
    const files = directFiles.length ? directFiles : legacyFile instanceof File ? [legacyFile] : [];
    const fileId = parseSourceFileId(form.get("fileId"));
    const fileIds = parseSourceFileIds(form.get("fileIds")) || [];
    const rawQuestion = readBoundedText(form.get("question"), MAX_QUESTION_CHARS) || "";
    const locale = readLocale(form.get("locale") === null ? null : String(form.get("locale")));
    if (form.has("fileId") && !fileId)
      return error("The study material reference is invalid.", 400);
    if (form.has("fileIds") && !fileIds.length)
      return error("The study material reference is invalid.", 400);
    if (!rawQuestion) return error("Please provide a question to explain.", 400);

    let parsedQuestion: unknown;
    try {
      parsedQuestion = JSON.parse(rawQuestion);
    } catch {
      return error("The current question is invalid.", 400);
    }
    const question = QuestionSchema.safeParse(parsedQuestion);
    if (!question.success || question.data.type !== "multiple_choice")
      return error("Only multiple-choice questions have per-option analysis.", 400);

    const options = getOpenAIClientOptions();
    if (!options) return error("The server has not been configured with an OpenAI API key.", 503);
    for (const file of files) {
      const validation = validatePdfFile(file);
      if (!validation.valid) return error(validation.error, 400);
    }
    const sourceFileParts = await buildSourceFileParts({ fileId, fileIds, files });
    // Unlike grading, missing study material is not fatal here. Questions reaching this route
    // come from the mistake book, whose older entries were saved before source tracking and
    // whose uploaded PDFs expire after a week; refusing them would leave exactly the
    // questions this backfill exists for permanently blank.
    const grounded = sourceFileParts.length > 0 || Boolean(transcript);

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
                buildOptionExplanationInstructions(generationLanguage(locale), grounded),
                `QUESTION: ${JSON.stringify(question.data)}`,
                ...(transcript ? [`LECTURE TRANSCRIPT: ${transcript}`] : []),
              ].join("\n\n"),
            },
            ...sourceFileParts,
          ],
        },
      ],
      text: { format: zodTextFormat(OptionExplanationsSchema, "option_explanations") },
    });
    const { text: output, stoppedEarlyBecause } = await collectResponse(stream);
    if (stoppedEarlyBecause) {
      console.error("Option analysis stopped early", { reason: stoppedEarlyBecause });
      return error("Option analysis was cut off before it finished. Please try again.", 502);
    }
    return Response.json(parseOptionExplanationsOutput(output));
  } catch (cause) {
    console.error(
      "Option analysis failed",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return error("Option analysis failed. Please try again later.", 502);
  }
}

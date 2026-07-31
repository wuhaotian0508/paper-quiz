import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ExamReviewSheetSchema, buildExamReviewInstructions } from "@/lib/exam-review";
import { getOpenAIClientOptions, getOpenAIModel } from "@/lib/openai-config";
import { collectResponse } from "@/lib/openai-stream";
import { MAX_TRANSCRIPT_CHARS, readBoundedText } from "@/lib/request-validation";
import { buildSourceFileParts, parseSourceFileIds } from "@/lib/source-reference";

export const maxDuration = 60;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const rawFileIds = form.get("fileIds");
    const fileIds = parseSourceFileIds(rawFileIds) || [];
    const transcriptValue = form.get("transcript");
    const transcript = transcriptValue
      ? readBoundedText(transcriptValue, MAX_TRANSCRIPT_CHARS)
      : "";

    if (!fileIds.length && !transcript)
      return jsonError("A saved PDF source or lecture transcript is required.", 400);
    if (fileIds.length && transcript)
      return jsonError("Choose either saved PDFs or a lecture transcript, not both.", 400);
    if (typeof transcriptValue === "string" && transcriptValue.trim() && !transcript)
      return jsonError("Lecture transcript is too long or invalid.", 400);

    const clientOptions = getOpenAIClientOptions();
    if (!clientOptions)
      return jsonError("The server has not been configured with an OpenAI API key.", 503);

    const client = new OpenAI(clientOptions);
    const sourceParts = fileIds.length ? await buildSourceFileParts({ fileIds }) : [];
    const sourceContent = [
      ...sourceParts,
      {
        type: "input_text" as const,
        text: transcript
          ? `${buildExamReviewInstructions()}\n\n<lecture_transcript>\n${transcript}\n</lecture_transcript>`
          : `${buildExamReviewInstructions()}\n\nCreate the review from all saved PDF sources.`,
      },
    ];
    const stream = await client.responses.create({
      model: getOpenAIModel(),
      stream: true,
      max_output_tokens: 4_500,
      reasoning: { effort: "low" },
      input: [{ role: "user", content: sourceContent }],
      text: { format: zodTextFormat(ExamReviewSheetSchema, "exam_review") },
    });
    const { text, stoppedEarlyBecause } = await collectResponse(stream);
    if (stoppedEarlyBecause === "max_output_tokens")
      return jsonError("The exam review was cut off before it finished. Please try again.", 502);
    if (stoppedEarlyBecause || !text)
      return jsonError("AI did not return a usable exam review. Please try again.", 502);

    return Response.json(ExamReviewSheetSchema.parse(JSON.parse(text)));
  } catch (error) {
    console.error(
      "Exam review generation failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return jsonError("Exam review generation failed. Please try again later.", 502);
  }
}

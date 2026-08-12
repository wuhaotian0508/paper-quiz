import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { parseQuestionReport, type QuestionReport } from "@/lib/question-report";
import {
  buildVerdictInstructions,
  parseVerdict,
  QuestionVerdictSchema,
  shouldVerify,
  type QuestionVerdict,
} from "@/lib/question-verdict";
import { QuestionSchema } from "@/lib/quiz";
import { getOpenAIClientOptions, getOpenAIModel } from "@/lib/openai-config";
import { collectResponse } from "@/lib/openai-stream";
import { readFailureText } from "@/lib/model-failure";
import {
  MAX_QUESTION_CHARS,
  MAX_TRANSCRIPT_CHARS,
  readBoundedText,
} from "@/lib/request-validation";
import {
  buildSourceFileParts,
  parseSourceFileId,
  parseSourceFileIds,
} from "@/lib/source-reference";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Long enough for a check that reads the source PDF, matching tutor chat rather than the
// 30s a bare insert needed.
export const maxDuration = 60;

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * Writes the report to the reports table, attributed to the reporter when they are signed
 * in and anonymous when they are not. Returning `"log"` rather than throwing is deliberate:
 * the server log above is written first and is the channel that survives Supabase being
 * unconfigured, so a storage failure costs triage convenience, not the report itself.
 */
async function storeReport(
  report: QuestionReport,
  verdict: QuestionVerdict | null,
): Promise<"database" | "log"> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("paper_quiz_question_reports").insert({
      reporter_id: data.user?.id ?? null,
      reason: report.reason,
      note: report.note || null,
      question_key: report.questionKey,
      question: {
        type: report.questionType,
        prompt: report.prompt,
        correctAnswer: report.correctAnswer,
        sourceNote: report.sourceNote,
        quizTitle: report.quizTitle,
        materialName: report.materialName,
      },
      locale: report.locale,
      // Triage reads these to find the reports worth acting on globally. A learning applies
      // to one browser until somebody promotes it from here.
      verdict: verdict?.verdict ?? null,
      severity: verdict?.severity ?? null,
      learning_rule: verdict?.rule ?? null,
      learning_scope: verdict?.scope || null,
    });
    if (insertError) throw new Error(insertError.message);
    return "database";
  } catch (cause) {
    console.error(
      "Question report could not be stored",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return "log";
  }
}

/**
 * Re-reads the study material to decide whether the complaint holds.
 *
 * Returns null for every reason it cannot answer well — no source to check against, no API
 * key, an unusable response — rather than guessing. A report whose verdict is null is still
 * a stored report; it just does not get to teach anything or promise the learner a finding.
 */
async function verifyAgainstSource(
  report: QuestionReport,
  question: unknown,
  source: { fileId: string | null; fileIds: string[]; transcript: string },
): Promise<QuestionVerdict | null> {
  if (!shouldVerify(report.reason)) return null;
  if (!source.fileId && !source.fileIds.length && !source.transcript) return null;
  const parsedQuestion = QuestionSchema.safeParse(question);
  if (!parsedQuestion.success) return null;
  const options = getOpenAIClientOptions();
  if (!options) return null;

  try {
    const instructions = buildVerdictInstructions(
      parsedQuestion.data,
      report.reason,
      report.note,
      report.locale,
    );
    const stream = await new OpenAI(options).responses.create({
      model: getOpenAIModel(),
      stream: true,
      // A verdict is six short fields; anything longer is the model writing an essay.
      max_output_tokens: 800,
      instructions,
      input: [
        {
          role: "user",
          content: [
            ...(await buildSourceFileParts({
              fileId: source.fileId,
              fileIds: source.fileIds,
            })),
            {
              type: "input_text" as const,
              text: source.transcript
                ? `${instructions}\n\n<lecture_transcript>\n${source.transcript}\n</lecture_transcript>`
                : instructions,
            },
          ],
        },
      ],
      text: { format: zodTextFormat(QuestionVerdictSchema, "verdict") },
    });
    const { text, stoppedEarlyBecause } = await collectResponse(stream);
    if (stoppedEarlyBecause || !text) return null;
    const parsed = parseVerdict(text);
    return parsed.ok ? parsed.value : null;
  } catch (cause) {
    // A failed check must never fail the report: the learner told us something either way.
    console.error("Question report check failed", readFailureText(cause) || "unknown error");
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    // Source material and the full question travel beside the report, not inside it: the
    // stored shape is the complaint, and these exist only to check it.
    const {
      fileId: rawFileId,
      fileIds: rawFileIds,
      transcript: rawTranscript,
      question,
      ...fields
    } = Object.fromEntries(form);
    const parsed = parseQuestionReport(fields);
    if (!parsed.ok) return error(parsed.error, 400);

    // Logged before anything can fail, so a report is never lost to a storage outage.
    console.warn("Question reported", JSON.stringify(parsed.value));

    const verdict = await verifyAgainstSource(parsed.value, readQuestion(question), {
      fileId: parseSourceFileId(rawFileId),
      fileIds: parseSourceFileIds(rawFileIds) || [],
      transcript: readBoundedText(rawTranscript, MAX_TRANSCRIPT_CHARS) || "",
    });
    if (verdict) console.warn("Question report verdict", JSON.stringify(verdict));

    return Response.json({
      ok: true,
      stored: await storeReport(parsed.value, verdict),
      verdict,
    });
  } catch (cause) {
    console.error(
      "Question report failed",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return error("The report could not be sent. Please try again.", 502);
  }
}

function readQuestion(value: unknown): unknown {
  const text = readBoundedText(value, MAX_QUESTION_CHARS);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

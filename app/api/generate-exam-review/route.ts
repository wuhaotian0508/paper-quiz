import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  ExamReviewSheetSchema,
  ReviewLanguagePreferenceSchema,
  buildExamReviewInstructions,
  buildExamReviewLanguageResolutionInstructions,
  buildExamReviewPreferencePrompt,
  reviewUsesResolvedOutputLanguage,
  type ReviewLanguagePreference,
} from "@/lib/exam-review";
import { parseExamReviewOutput } from "@/lib/exam-review-output";
import { getOpenAIClientOptions, getOpenAIModel } from "@/lib/openai-config";
import { collectResponse } from "@/lib/openai-stream";
import {
  MAX_TRANSCRIPT_CHARS,
  MAX_QUESTION_CHARS,
  parseGenerationBrief,
  parseReviewMistakeContext,
  readBoundedText,
  validatePdfFile,
} from "@/lib/request-validation";
import { buildSourceFileParts, parseSourceFileIds } from "@/lib/source-reference";
import { readLocale } from "@/lib/i18n";

// The same ceiling as quiz generation: a review sheet reads the whole source too, and can
// spend a second pass correcting the output language, so 60s was timing out on the large
// PDFs that reviewers actually study from.
export const maxDuration = 100;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

const interfaceDefaultLanguagePreference: ReviewLanguagePreference = {
  outputLanguage: "interface-default",
  languageName: "",
};

/**
 * Language is intentionally resolved by a structured model response instead of application
 * text matching. This lets a short request such as 请用中文 override an English UI default
 * without making the UI language itself a competing instruction.
 */
async function resolveReviewLanguagePreference(client: OpenAI, brief: string) {
  if (!brief.trim()) return interfaceDefaultLanguagePreference;

  try {
    const response = await client.responses.create({
      model: getOpenAIModel(),
      max_output_tokens: 200,
      reasoning: { effort: "low" },
      instructions: buildExamReviewLanguageResolutionInstructions(),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `<learner_preferences>\n${brief}\n</learner_preferences>`,
            },
          ],
        },
      ],
      text: { format: zodTextFormat(ReviewLanguagePreferenceSchema, "review_language") },
    });
    return ReviewLanguagePreferenceSchema.parse(JSON.parse(response.output_text));
  } catch (error) {
    // The generation prompt still receives the raw preference below. Falling back keeps a
    // transient classifier failure from blocking a legitimate review request.
    console.warn(
      "Review language preference resolution failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return interfaceDefaultLanguagePreference;
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const rawFileIds = form.get("fileIds");
    const fileIds = parseSourceFileIds(rawFileIds) || [];
    const attachedFile = form.get("file");
    const attachedPdf = attachedFile instanceof File ? attachedFile : null;
    const transcriptValue = form.get("transcript");
    const transcript = transcriptValue
      ? readBoundedText(transcriptValue, MAX_TRANSCRIPT_CHARS)
      : "";
    const questionContextValue = form.get("questionContext");
    const questionContext = questionContextValue
      ? readBoundedText(questionContextValue, MAX_QUESTION_CHARS)
      : "";
    const locale = readLocale(form.get("locale") === null ? null : String(form.get("locale")));
    const brief = parseGenerationBrief(form.get("brief"));
    const rawMistakes = form.get("mistakes");
    const parsedMistakes =
      rawMistakes === null
        ? { ok: true as const, value: [] }
        : parseReviewMistakeContext(rawMistakes);

    if (attachedPdf) {
      const validation = validatePdfFile(attachedPdf);
      if (!validation.valid) return jsonError(validation.error, 400);
    }
    if (!fileIds.length && !attachedPdf && !transcript && !questionContext)
      return jsonError("A saved PDF source or lecture transcript is required.", 400);
    if ((fileIds.length || attachedPdf) && transcript)
      return jsonError("Choose either saved PDFs or a lecture transcript, not both.", 400);
    if (fileIds.length && attachedPdf)
      return jsonError("Choose either saved PDFs or a reattached PDF, not both.", 400);
    if (typeof transcriptValue === "string" && transcriptValue.trim() && !transcript)
      return jsonError("Lecture transcript is too long or invalid.", 400);
    if (typeof questionContextValue === "string" && questionContextValue.trim() && !questionContext)
      return jsonError("Saved question context is too long or invalid.", 400);
    if (!parsedMistakes.ok) return jsonError(parsedMistakes.error, 400);

    const clientOptions = getOpenAIClientOptions();
    if (!clientOptions)
      return jsonError("The server has not been configured with an OpenAI API key.", 503);

    const client = new OpenAI(clientOptions);
    const languagePreference = await resolveReviewLanguagePreference(client, brief);
    const reviewInstructions = buildExamReviewInstructions(locale, languagePreference);
    // A reattached PDF must work even when an OpenAI-compatible gateway accepts Files
    // uploads but cannot subsequently resolve their IDs in the Responses API. Inline
    // it for this one review request; persisted source IDs still serve normal quizzes.
    const sourceParts = attachedPdf
      ? await buildSourceFileParts({ files: [attachedPdf] })
      : fileIds.length
        ? await buildSourceFileParts({ fileIds })
        : [];
    const mistakeContext = parsedMistakes.value.length
      ? `\n\n<learner_mistakes>\n${JSON.stringify(parsedMistakes.value)}\n</learner_mistakes>`
      : "\n\n<learner_mistakes>[]</learner_mistakes>";
    const inputText = [
      // Keep the authoritative schema and source rules in user content too. The configured
      // OpenAI-compatible gateway can drop the top-level `instructions` field, which otherwise
      // leaves the model with only the learner brief and produces an empty/invalid review.
      reviewInstructions,
      buildExamReviewPreferencePrompt(brief),
      transcript
        ? `<lecture_transcript>\n${transcript}\n</lecture_transcript>`
        : questionContext
          ? `<saved_quiz_questions>\n${questionContext}\n</saved_quiz_questions>`
          : "Create the review from all attached PDF sources.",
      mistakeContext.trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
    const sourceContent = [
      ...sourceParts,
      {
        type: "input_text" as const,
        text: inputText,
      },
    ];
    const createReviewStream = (correctingLanguage = false) =>
      client.responses.create({
        model: getOpenAIModel(),
        stream: true,
        max_output_tokens: 4_500,
        reasoning: { effort: "low" },
        instructions: [
          reviewInstructions,
          ...(correctingLanguage
            ? [
                "The preceding attempt failed the required output-language check. Regenerate the entire review in the resolved output language; do not retain English user-visible text when Simplified Chinese was requested.",
              ]
            : []),
        ].join("\n\n"),
        input: [{ role: "user", content: sourceContent }],
        text: { format: zodTextFormat(ExamReviewSheetSchema, "exam_review") },
      });

    const firstStream = await createReviewStream();
    let { text, stoppedEarlyBecause, usage } = await collectResponse(firstStream);
    if (stoppedEarlyBecause === "max_output_tokens")
      return jsonError("The exam review was cut off before it finished. Please try again.", 502);
    if (stoppedEarlyBecause || !text)
      return jsonError("AI did not return a usable exam review. Please try again.", 502);

    let review = parseExamReviewOutput(text);
    if (!reviewUsesResolvedOutputLanguage(review, languagePreference)) {
      const correctiveStream = await createReviewStream(true);
      const corrective = await collectResponse(correctiveStream);
      if (corrective.stoppedEarlyBecause === "max_output_tokens")
        return jsonError("The exam review was cut off before it finished. Please try again.", 502);
      if (corrective.stoppedEarlyBecause || !corrective.text)
        return jsonError("AI did not return a usable exam review. Please try again.", 502);
      text = corrective.text;
      usage = corrective.usage;
      review = parseExamReviewOutput(text);
      if (!reviewUsesResolvedOutputLanguage(review, languagePreference))
        return jsonError(
          "AI did not return the review in the requested language. Please try again.",
          502,
        );
    }
    const allowedMistakeIds = new Set(parsedMistakes.value.map((mistake) => mistake.id));
    return Response.json({
      ...review,
      // Legacy topic sheets cite learner mistakes by id; drop any the model invented.
      topics:
        review.topics?.map((topic) => {
          const relatedMistakeIds = topic.relatedMistakeIds.filter((id) =>
            allowedMistakeIds.has(id),
          );
          return {
            ...topic,
            relatedMistakeIds,
            mistakeFocus: relatedMistakeIds.length ? topic.mistakeFocus : "",
          };
        }) ?? null,
      usage,
    });
  } catch (error) {
    console.error(
      "Exam review generation failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return jsonError("Exam review generation failed. Please try again later.", 502);
  }
}

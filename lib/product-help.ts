import { z } from "zod";
import {
  DEFAULT_LOCALE,
  generationLanguage,
  translate,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";

export const PRODUCT_HELP_MAX_MESSAGE_CHARS = 2_000;
export const PRODUCT_HELP_MAX_HISTORY_MESSAGES = 8;

const ProductHelpMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(PRODUCT_HELP_MAX_MESSAGE_CHARS),
  })
  .strict();

export const ProductHelpRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(PRODUCT_HELP_MAX_MESSAGE_CHARS),
    history: z.array(ProductHelpMessageSchema).max(PRODUCT_HELP_MAX_HISTORY_MESSAGES).default([]),
    currentView: z
      .enum([
        "dashboard",
        "quiz-lab",
        "mistake-book",
        "calendar",
        "history",
        "quiz",
        "results",
        "help",
      ])
      .default("dashboard"),
    locale: z.enum(["en", "zh"]).default("en"),
  })
  .strict();

export const ProductHelpReplySchema = z
  .object({
    reply: z.string().trim().min(1).max(1_200),
    needsFeedback: z.boolean(),
  })
  .strict();

export type ProductHelpRequest = z.infer<typeof ProductHelpRequestSchema>;
export type ProductHelpReply = z.infer<typeof ProductHelpReplySchema>;

/**
 * Built from the UI dictionary so the labels the chatbot quotes are exactly the ones
 * the learner sees in their chosen language.
 */
function buildProductMap(locale: Locale) {
  const label = (key: MessageKey) => `“${translate(locale, key)}”`;
  return `
Verified navigation and buttons:
- Dashboard / Quiz Lab: use ${label("upload.chooseFileAria")}, then configure ${label("upload.questionMix")}, select ${label("upload.difficultyBasic")}, ${label("upload.difficultyMixed")}, or ${label("upload.difficultyChallenging")}, and click ${label("upload.generateQuiz")} (or ${label("upload.transcribeRecording")} for one recording).
- Mistake review: click ${label("nav.mistakeBook")}, then use ${label("mistakes.practiceSelected")}, ${label("mistakes.practiceAgain")}, ${label("mistakes.viewDetails")}, or ${label("mistakes.buildReviewSheet")} when those controls are visible.
- Past work: click ${label("nav.calendar")} for dated practice sessions or ${label("nav.history")} for saved material. A material detail page includes ${label("material.continueLatest")}, ${label("material.exportAll")}, and ${label("material.generateReview")} when source material is available.
- During a quiz: use ${label("quiz.submitAnswer")}, ${label("quiz.nextQuestion")}, ${label("results.openMistakeBook")}, ${label("quiz.studentCopy")}, and ${label("quiz.answerKey")} when shown.
- Results: use ${label("quiz.studentCopy")}, ${label("quiz.answerKey")}, ${label("results.openMistakeBook")}, ${label("results.createShareLink")}, or ${label("results.uploadAnother")}.
- Support: ${label("nav.feedback")} opens the product feedback form. Do not claim that an action exists unless it is listed above.
`.trim();
}

export function buildProductHelpInstructions(locale: Locale = DEFAULT_LOCALE) {
  return [
    "You are the PaperQuiz product-help chatbot.",
    "Answer only how to use PaperQuiz. Do not answer academic questions, grade work, or request study materials, transcripts, quiz questions, answers, grades, files, or personal data.",
    "Use only the verified UI labels below. When a learner does not know how to start, give a short numbered click path. If the request is unsupported or you are uncertain, say so plainly and set needsFeedback to true so the UI can offer Feedback.",
    `Write the reply in ${generationLanguage(locale)}, quoting the UI labels exactly as given below.`,
    "Return JSON only with reply and needsFeedback.",
    buildProductMap(locale),
  ].join("\n\n");
}

export function parseProductHelpReply(value: string): ProductHelpReply | null {
  try {
    return ProductHelpReplySchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

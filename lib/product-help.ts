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
        "library",
        // Retired destination, still accepted so a cached older client is not rejected.
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
- Dashboard: use ${label("upload.chooseFileAria")}, then configure ${label("upload.questionMix")}, and click ${label("upload.generateQuiz")} (or ${label("upload.transcribeRecording")} for one recording).
- Asking for something specific: ${label("upload.briefLabel")} takes a free-text note before generating, such as which chapters to cover or how hard the questions should be. There is no difficulty picker; the brief is where that goes. The review-sheet builder has the same box, ${label("material.reviewBriefLabel")}.
- Uploads: up to 5 PDFs at once, or a single lecture recording as MP3, M4A, WAV, WebM, or MP4. A recording is transcribed first and the transcript can be edited before questions are generated. Recordings must stay under 25MB, which is roughly 20-25 minutes; a longer lecture fails to upload, and the fix is to split it or trim it.
- Question mix: up to 15 questions total across multiple choice, fill-blank, and short answer. A custom type takes its own label and instructions.
- Daily review: the dashboard shows ${label("daily.heading")}, one paper per course scheduled by the forgetting curve. Click ${label("daily.start")} to sit one.
- Mistake review: click ${label("nav.mistakeBook")}, then use ${label("mistakes.practiceSelected")}, ${label("mistakes.practiceAgain")}, ${label("mistakes.viewDetails")}, or ${label("mistakes.buildReviewSheet")} when those controls are visible.
- Past work: click ${label("nav.calendar")} for dated practice sessions and upcoming review dates, or ${label("nav.library")} for saved material grouped by course. A material detail page includes ${label("material.continueLatest")}, ${label("material.exportAll")}, and ${label("material.generateReview")} when source material is available.
- During a quiz: use ${label("quiz.submitAnswer")}, ${label("quiz.nextQuestion")}, ${label("results.openMistakeBook")}, ${label("quiz.studentCopy")}, and ${label("quiz.answerKey")} when shown.
- Answer explanations: every multiple-choice option carries its own note saying why it is right or which misreading makes it wrong, not just the correct letter. Where the source is a PDF, the originating page is shown beside the explanation.
- Results: use ${label("quiz.studentCopy")}, ${label("quiz.answerKey")}, ${label("results.openMistakeBook")}, ${label("results.createShareLink")}, or ${label("results.uploadAnother")}.
- Course folders: the sidebar groups materials into course folders. ${label("nav.new")} creates a course, double-clicking a folder renames it, and ${label("nav.deleteFolder")} removes the folder while keeping its files. Folders are listed alphabetically, with unassigned files last.
- Appearance and language: the sidebar toggles dark and light theme, and switches between English and 中文. The language toggle currently changes the interface and the generated questions together; they cannot yet be set separately.
- Sharing: ${label("results.createShareLink")} produces a 7-day challenge link that carries the questions only, never the uploaded file.
- Accounts: signing in syncs sessions, mistakes, and the library across devices. Without signing in, everything stays in this browser only.
- Support: ${label("nav.help")} is this chatbot and is the first place to ask anything. ${label("nav.feedback")} opens the product feedback form, for bugs and requests this chatbot cannot resolve.

Known limits, when a learner asks why something failed:
- The forgetting-curve schedule brings a mistake back after 1, 2, 4, 7, 15, and 30 days. Answering correctly moves it to the next step, a wrong answer sends it back to the start, and clearing the last step retires it.
- A long or image-heavy PDF can make ${label("material.generateReview")} time out. Retrying, or using fewer PDFs at once, usually works.
- Questions are not yet grouped by knowledge point, and there is no way to report an individual bad question. Say so plainly rather than inventing a control, and set needsFeedback to true.

Do not claim that an action exists unless it is listed above.
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

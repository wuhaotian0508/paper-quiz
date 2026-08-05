import { z } from "zod";

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

const productMap = `
Verified navigation and buttons:
- Dashboard / Quiz Lab: use “Choose a PDF or lecture recording”, then configure “Question mix”, select “Core review”, “Mixed practice”, or “Challenge mode”, and click “Generate quiz” (or “Transcribe recording” for one recording).
- Mistake review: click “Mistake Book”, then use “Practice selected”, “Practice again”, “View details”, or “Generate review sheet” when those controls are visible.
- Past work: click “Calendar” for dated practice sessions or “History” for saved material. A material detail page includes “Continue latest practice”, “Export all questions”, and “Generate exam review” when source material is available.
- During a quiz: use “Submit answer”, “Next question”, “Open mistake book”, “Student copy (no answers)”, and “Answer key (with answers)” when shown.
- Results: use “Student copy (no answers)”, “Answer key (with answers)”, “Open mistake book”, “Share challenge”, or “Upload another lecture”.
- Support: “Feedback” opens the product feedback form. Do not claim that an action exists unless it is listed above.
`.trim();

export function buildProductHelpInstructions() {
  return [
    "You are the PaperQuiz product-help chatbot.",
    "Answer only how to use PaperQuiz. Do not answer academic questions, grade work, or request study materials, transcripts, quiz questions, answers, grades, files, or personal data.",
    "Use only the verified UI labels below. When a learner does not know how to start, give a short numbered click path. If the request is unsupported or you are uncertain, say so plainly and set needsFeedback to true so the UI can offer Feedback.",
    "Return JSON only with reply and needsFeedback.",
    productMap,
  ].join("\n\n");
}

export function parseProductHelpReply(value: string): ProductHelpReply | null {
  try {
    return ProductHelpReplySchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

import { z } from "zod";
import { DEFAULT_LOCALE, generationLanguage, type Locale } from "@/lib/i18n";

/**
 * Review sheets are laid out as a two-column study page of numbered sections, modelled
 * on a handwritten revision sheet. `kind` is what drives layout and ordering, so the
 * model is free to word `heading` in the reader's language.
 *
 * Sheets generated before this layout stored a flat `topics` list instead. Both shapes
 * stay valid: saved sheets and already-published share links must keep rendering.
 */
export const REVIEW_SECTION_KINDS = [
  "keyConcepts",
  "importantDetails",
  "examples",
  "questions",
  "takeaways",
  "formulas",
  "mistakes",
  "connections",
  "nextSteps",
] as const;

export type ReviewSectionKind = (typeof REVIEW_SECTION_KINDS)[number];

export const ExamReviewItemSchema = z.object({
  /** Bold lead-in, such as a term, an example number, or a formula. Empty when unused. */
  label: z.string().trim().max(120),
  body: z.string().trim().min(1).max(400),
});

export const ExamReviewSectionSchema = z.object({
  kind: z.enum(REVIEW_SECTION_KINDS),
  heading: z.string().trim().min(1).max(60),
  items: z.array(ExamReviewItemSchema).min(1).max(8),
});

export const ExamReviewTopicSchema = z.object({
  topic: z.string().trim().min(1).max(120),
  keyIdeas: z.array(z.string().trim().min(1).max(400)).min(1).max(5),
  formulaOrProcedure: z.string().trim().max(500),
  commonConfusion: z.string().trim().min(1).max(500),
  sourceNote: z.string().trim().min(1).max(300),
  relatedMistakeIds: z.array(z.string().trim().min(1).max(200)).max(3),
  mistakeFocus: z.string().trim().max(500),
});

export const ExamReviewSheetSchema = z.object({
  title: z.string().trim().min(1).max(160),
  subject: z.string().trim().max(80).nullish(),
  scope: z.string().trim().max(120).nullish(),
  goal: z.string().trim().max(160).nullish(),
  sections: z.array(ExamReviewSectionSchema).min(4).max(9).nullish(),
  sourceNote: z.string().trim().max(300).nullish(),
  /** Legacy shape, kept so saved and shared sheets from before the redesign still load. */
  topics: z.array(ExamReviewTopicSchema).min(1).max(8).nullish(),
});

export type ExamReviewItem = z.infer<typeof ExamReviewItemSchema>;
export type ExamReviewSection = z.infer<typeof ExamReviewSectionSchema>;
export type ExamReviewTopic = z.infer<typeof ExamReviewTopicSchema>;
export type ExamReviewSheet = z.infer<typeof ExamReviewSheetSchema>;

/** Left column, right column, then the full-width strip along the bottom. */
export const REVIEW_LEFT_COLUMN: ReviewSectionKind[] = [
  "keyConcepts",
  "importantDetails",
  "examples",
];
export const REVIEW_RIGHT_COLUMN: ReviewSectionKind[] = [
  "questions",
  "takeaways",
  "formulas",
  "mistakes",
  "connections",
];
export const REVIEW_FULL_WIDTH: ReviewSectionKind[] = ["nextSteps"];

const KIND_ORDER = [...REVIEW_LEFT_COLUMN, ...REVIEW_RIGHT_COLUMN, ...REVIEW_FULL_WIDTH];

/** Sections in printed order, numbered the way the sheet displays them. */
export function orderedReviewSections(
  sheet: ExamReviewSheet,
): { section: ExamReviewSection; number: number }[] {
  const sections = sheet.sections ?? [];
  return [...sections]
    .sort((left, right) => KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind))
    .map((section, index) => ({ section, number: index + 1 }));
}

export function reviewSectionsFor(
  sheet: ExamReviewSheet,
  kinds: ReviewSectionKind[],
): { section: ExamReviewSection; number: number }[] {
  return orderedReviewSections(sheet).filter((entry) => kinds.includes(entry.section.kind));
}

export function buildExamReviewInstructions(locale: Locale = DEFAULT_LOCALE) {
  const language = generationLanguage(locale);
  return [
    "You are a precise exam tutor. Create a two-column revision sheet based only on the supplied study material.",
    "The sheet is printed as numbered sections. Produce one section for each of these kinds, in this order, and use the kind value verbatim:",
    "keyConcepts (the definitions and principles that everything else rests on), importantDetails (the specifics that get marked: classifications, conditions, step-by-step procedures), examples (worked examples or practice problems with their key steps), questions (open questions a learner should still resolve, written as questions), takeaways (a short summary of what matters most), formulas (formulas and constants, with what each one is for), mistakes (specific errors learners make on this material), connections (how these ideas link to neighbouring topics), nextSteps (concrete revision actions).",
    "Each section needs a heading written for the reader and 1 to 8 items. Give an item a short label when it names a term, an example, or a formula, and leave label as an empty string otherwise. Keep each body to one or two sentences so it fits a narrow column.",
    "Fill in subject, scope, and goal for the sheet banner, and sourceNote with the pages or sections the material came from.",
    "Set topics to null; it exists only for sheets saved before this layout.",
    "The supplied PDF or transcript is the sole factual authority. Learner mistakes only determine which source-grounded points deserve emphasis, and belong in the mistakes section.",
    "Return JSON only, without Markdown headings or a code fence.",
    `Write every user-visible field in ${language}. Do not invent facts or imply this document is permitted during an exam.`,
  ].join("\n");
}

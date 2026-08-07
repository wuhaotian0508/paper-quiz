import { z } from "zod";

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
  topics: z.array(ExamReviewTopicSchema).min(4).max(8),
});

export type ExamReviewSheet = z.infer<typeof ExamReviewSheetSchema>;

export function parseExamReviewOutput(output: string): ExamReviewSheet {
  const json = output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return ExamReviewSheetSchema.parse(JSON.parse(json));
}

export function buildExamReviewInstructions() {
  return [
    "You are a precise exam tutor. Create a concise review sheet based only on the supplied study material.",
    "Cover 4 to 8 distinct high-value topics from across the material; do not repeat a topic.",
    "For each topic, state essential ideas, include a formula or procedure only when the source contains one, name one common confusion, and cite the supporting page, section, or transcript topic.",
    "The supplied PDF or transcript is the sole factual authority. Learner mistakes only determine which source-grounded concepts deserve emphasis.",
    "Return relatedMistakeIds only from the supplied mistake identifiers, and use an empty array with an empty mistakeFocus when no supplied mistake applies.",
    "Return exactly one JSON object with this shape: { title: string, topics: [{ topic: string, keyIdeas: string[], formulaOrProcedure: string, commonConfusion: string, sourceNote: string, relatedMistakeIds: string[], mistakeFocus: string }] }. Include 4 to 8 topics.",
    "Return JSON only, without Markdown headings or a code fence.",
    "Write every user-visible field in English. Do not invent facts or imply this document is permitted during an exam.",
  ].join("\n");
}

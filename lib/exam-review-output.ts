import { ExamReviewSheetSchema, type ExamReviewSheet } from "@/lib/exam-review";

function stripCodeFence(output: string) {
  return output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function unwrapReview(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if ("title" in record && "topics" in record) return value;
  for (const key of ["exam_review", "examReview", "review", "data", "result", "output"]) {
    if (key in record) return unwrapReview(record[key]);
  }
  return value;
}

function firstValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringList(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (items.length) return items.map((item) => item.trim());
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return fallback;
}

function normalizeTopic(value: unknown, index: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      topic: `Knowledge point ${index + 1}`,
      keyIdeas: ["Review the central idea from this section."],
      formulaOrProcedure: "",
      commonConfusion: "Review how this concept differs from related ideas.",
      sourceNote: "Saved PDF question context",
      relatedMistakeIds: [],
      mistakeFocus: "",
    };
  }
  const record = value as Record<string, unknown>;
  return {
    topic: textValue(firstValue(record, ["topic", "name", "concept", "knowledgePoint", "knowledge_point", "title"]), `Knowledge point ${index + 1}`),
    keyIdeas: stringList(
      firstValue(record, ["keyIdeas", "key_ideas", "keyPoints", "key_points", "ideas", "mainIdeas"]),
      ["Review the central idea from this section."],
    ),
    formulaOrProcedure: textValue(
      firstValue(record, ["formulaOrProcedure", "formula_or_procedure", "formula", "procedure"]),
      "",
    ),
    commonConfusion: textValue(
      firstValue(record, ["commonConfusion", "common_confusion", "confusion", "pitfall"]),
      "Review how this concept differs from related ideas.",
    ),
    sourceNote: textValue(
      firstValue(record, ["sourceNote", "source_note", "source", "citation", "page"]),
      "Saved PDF question context",
    ),
    relatedMistakeIds: stringList(
      firstValue(record, ["relatedMistakeIds", "related_mistake_ids", "mistakeIds", "mistake_ids"]),
      [],
    ),
    mistakeFocus: textValue(
      firstValue(record, ["mistakeFocus", "mistake_focus", "learningFocus", "learning_focus", "focus"]),
      "",
    ),
  };
}

function normalizeReview(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const rawTopics = firstValue(record, ["topics", "sections", "knowledgePoints", "knowledge_points"]);
  if (!Array.isArray(rawTopics)) return value;
  return {
    title: textValue(firstValue(record, ["title", "name", "heading", "reviewTitle", "review_title"]), "Knowledge-Point Review"),
    topics: rawTopics.map(normalizeTopic),
  };
}

export function parseExamReviewOutput(output: string): ExamReviewSheet {
  const value = normalizeReview(unwrapReview(JSON.parse(stripCodeFence(output))));
  const direct = ExamReviewSheetSchema.safeParse(value);
  if (direct.success) return direct.data;
  if (Array.isArray(value)) {
    return ExamReviewSheetSchema.parse({
      title: "Knowledge-Point Review",
      topics: value,
    });
  }
  return ExamReviewSheetSchema.parse(value);
}

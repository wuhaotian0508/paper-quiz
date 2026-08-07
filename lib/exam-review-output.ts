import {
  ExamReviewSheetSchema,
  REVIEW_SECTION_KINDS,
  type ExamReviewSheet,
  type ReviewSectionKind,
} from "@/lib/exam-review";

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
  if ("title" in record && ("sections" in record || "topics" in record)) return value;
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
    const items = value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
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
    topic: textValue(
      firstValue(record, [
        "topic",
        "name",
        "concept",
        "knowledgePoint",
        "knowledge_point",
        "title",
      ]),
      `Knowledge point ${index + 1}`,
    ),
    keyIdeas: stringList(
      firstValue(record, [
        "keyIdeas",
        "key_ideas",
        "keyPoints",
        "key_points",
        "ideas",
        "mainIdeas",
      ]),
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
      firstValue(record, [
        "mistakeFocus",
        "mistake_focus",
        "learningFocus",
        "learning_focus",
        "focus",
      ]),
      "",
    ),
  };
}

/** True once the array carries the two-column section shape rather than legacy topics. */
function looksLikeSections(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.some(
      (item) =>
        !!item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof (item as Record<string, unknown>).kind === "string" &&
        REVIEW_SECTION_KINDS.includes((item as Record<string, unknown>).kind as ReviewSectionKind),
    )
  );
}

function normalizeItem(value: unknown): { label: string; body: string } | null {
  if (typeof value === "string") return value.trim() ? { label: "", body: value.trim() } : null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const body = textValue(firstValue(record, ["body", "text", "detail", "content", "value"]), "");
  if (!body) return null;
  return {
    label: textValue(firstValue(record, ["label", "term", "name", "title"]), ""),
    body,
  };
}

function normalizeSection(value: unknown) {
  const record = value as Record<string, unknown>;
  const rawItems = firstValue(record, ["items", "points", "bullets", "entries", "list"]);
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .map(normalizeItem)
    .filter((item): item is { label: string; body: string } => item !== null);
  return {
    kind: record.kind,
    heading: textValue(firstValue(record, ["heading", "title", "name"]), String(record.kind ?? "")),
    items: items.length ? items : [{ label: "", body: "Review this section in the source." }],
    // Rebuilding the section drops anything not named here, so the page citation the slide
    // preview depends on has to be carried across explicitly.
    sourceNote: textValue(firstValue(record, ["sourceNote", "source_note", "source", "page"]), ""),
  };
}

function normalizeReview(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const title = textValue(
    firstValue(record, ["title", "name", "heading", "reviewTitle", "review_title"]),
    "Knowledge-Point Review",
  );

  const rawSections = firstValue(record, ["sections", "parts", "blocks"]);
  if (looksLikeSections(rawSections)) {
    return {
      ...record,
      title,
      sections: rawSections
        .filter((item) => REVIEW_SECTION_KINDS.includes(item.kind as ReviewSectionKind))
        .map(normalizeSection),
      topics: null,
    };
  }

  const rawTopics = firstValue(record, [
    "topics",
    "sections",
    "knowledgePoints",
    "knowledge_points",
  ]);
  if (!Array.isArray(rawTopics)) return value;
  return { title, topics: rawTopics.map(normalizeTopic) };
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

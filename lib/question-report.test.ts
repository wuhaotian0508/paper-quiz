import { describe, expect, it } from "vitest";
import {
  addReportedQuestion,
  buildQuestionReport,
  hasReportedQuestion,
  MAX_REPORT_NOTE_CHARS,
  parseQuestionReport,
  readReportedQuestions,
  reportReasonsFor,
} from "./question-report";
import { questionKey, type Question } from "./quiz";

const choice: Question = {
  id: "q1",
  type: "multiple_choice",
  prompt: "Which slide states the core test?",
  explanation: "Slide 4.",
  sourceNote: "Slide 4",
  correctOptionId: "b",
  options: [
    { id: "a", text: "Slide 1" },
    { id: "b", text: "Slide 4" },
    { id: "c", text: "Slide 7" },
    { id: "d", text: "Slide 9" },
  ],
};

const written: Question = {
  id: "q2",
  type: "short_answer",
  prompt: "Explain the core test.",
  explanation: "Repeat use and willingness to pay.",
  sourceNote: "Slide 4",
  referenceAnswer: "Repeat use and willingness to pay.",
  gradingCriteria: ["Names repeat use"],
  customLabel: null,
};

describe("reportReasonsFor", () => {
  it("offers broken options only where there are options to break", () => {
    expect(reportReasonsFor("multiple_choice")).toContain("bad_options");
    expect(reportReasonsFor("short_answer")).not.toContain("bad_options");
    expect(reportReasonsFor("fill_blank")).not.toContain("bad_options");
  });
});

describe("buildQuestionReport", () => {
  it("carries the answer key and the question's own key, not the per-quiz id", () => {
    const report = buildQuestionReport(choice, "wrong_answer", {
      note: "  Slide 4 says the opposite.  ",
      quizTitle: "Validation quiz",
      materialName: "lecture-3.pdf",
      locale: "zh",
    });

    expect(report.questionKey).toBe(questionKey(choice));
    expect(report.questionKey).not.toBe(choice.id);
    expect(report.correctAnswer).toBe("Slide 4");
    expect(report.note).toBe("Slide 4 says the opposite.");
    expect(report.materialName).toBe("lecture-3.pdf");
    expect(report.locale).toBe("zh");
  });

  it("fills the optional context in rather than emitting undefined fields", () => {
    const report = buildQuestionReport(written, "not_in_source");

    expect(report).toMatchObject({ note: "", quizTitle: "", materialName: "", locale: "en" });
    expect(report.correctAnswer).toBe("Repeat use and willingness to pay.");
  });

  it("truncates an over-long note instead of refusing the report", () => {
    const report = buildQuestionReport(choice, "other", { note: "x".repeat(2_000) });
    expect(report.note).toHaveLength(MAX_REPORT_NOTE_CHARS);
  });
});

describe("parseQuestionReport", () => {
  const valid = buildQuestionReport(choice, "unclear", { note: "Ambiguous." });

  it("accepts a report built by the client", () => {
    const parsed = parseQuestionReport({ ...valid });
    expect(parsed).toEqual({ ok: true, value: valid });
  });

  it("rejects an unknown reason, a missing prompt and an over-long note", () => {
    expect(parseQuestionReport({ ...valid, reason: "hallucination" }).ok).toBe(false);
    expect(parseQuestionReport({ ...valid, prompt: "" }).ok).toBe(false);
    expect(parseQuestionReport({ ...valid, note: "x".repeat(MAX_REPORT_NOTE_CHARS + 1) }).ok).toBe(
      false,
    );
  });

  it("rejects extra fields so the report cannot smuggle in a payload", () => {
    expect(parseQuestionReport({ ...valid, transcript: "the whole lecture" }).ok).toBe(false);
  });
});

describe("reported question memory", () => {
  it("survives a round trip and dedupes on the question key", () => {
    const first = addReportedQuestion([], "m-abc", "wrong_answer");
    const second = addReportedQuestion(first, "m-abc", "unclear");

    expect(second).toHaveLength(1);
    expect(second[0].reason).toBe("unclear");
    expect(hasReportedQuestion(second, "m-abc")).toBe(true);
    expect(hasReportedQuestion(second, "m-xyz")).toBe(false);
    expect(readReportedQuestions(JSON.stringify(second))).toEqual(second);
  });

  it("reads nothing out of absent, malformed or foreign storage", () => {
    expect(readReportedQuestions(null)).toEqual([]);
    expect(readReportedQuestions("{oops")).toEqual([]);
    expect(readReportedQuestions(JSON.stringify({ key: "m-abc" }))).toEqual([]);
    expect(readReportedQuestions(JSON.stringify([{ key: "m-abc", reason: "nonsense" }]))).toEqual(
      [],
    );
  });

  it("keeps the list bounded so a heavy reporter cannot fill the quota", () => {
    const many = Array.from({ length: 250 }).reduce<ReturnType<typeof addReportedQuestion>>(
      (entries, _item, index) => addReportedQuestion(entries, `m-${index}`, "other"),
      [],
    );
    expect(many).toHaveLength(200);
    // Newest first, so the oldest reports are the ones dropped.
    expect(many[0].key).toBe("m-249");
  });
});

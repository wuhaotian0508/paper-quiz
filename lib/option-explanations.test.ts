import { describe, expect, it } from "vitest";
import type { Question, Quiz } from "@/lib/quiz";
import {
  applyOptionExplanations,
  buildOptionExplanationInstructions,
  needsOptionExplanations,
  parseOptionExplanationsOutput,
  withOptionExplanations,
} from "@/lib/option-explanations";

const explanations = {
  a: "Confuses the demo channel with the test itself.",
  b: "This is the stated core test.",
  c: "Mistakes one revenue option for the only one.",
  d: "Availability of data is not what is being validated.",
};

function question(overrides: Partial<Record<"a" | "b" | "c" | "d", string>> = {}): Question {
  return {
    id: "q1",
    type: "multiple_choice",
    prompt: "What is the core test?",
    explanation: "The core test is about repeat use and willingness to pay.",
    sourceNote: "page 1",
    points: 3,
    correctOptionId: "b",
    options: (["a", "b", "c", "d"] as const).map((id) => ({
      id,
      text: `Option ${id}`,
      explanation: overrides[id] ?? null,
    })),
  };
}

describe("needsOptionExplanations", () => {
  it("flags a question saved before per-option analysis existed", () => {
    expect(needsOptionExplanations(question())).toBe(true);
  });

  it("flags a question the generator only partly explained", () => {
    expect(
      needsOptionExplanations(question({ a: "Wrong because...", b: "Right because..." })),
    ).toBe(true);
  });

  it("leaves a fully explained question alone", () => {
    expect(needsOptionExplanations(question(explanations))).toBe(false);
  });

  it("never flags a question type that has no options", () => {
    const written: Question = {
      id: "q1",
      type: "short_answer",
      prompt: "Explain the core test",
      explanation: "...",
      sourceNote: "page 1",
      points: 10,
      referenceAnswer: "Repeat use and willingness to pay",
      gradingCriteria: ["mentions repeat use"],
      customLabel: null,
    };
    expect(needsOptionExplanations(written)).toBe(false);
  });
});

describe("withOptionExplanations", () => {
  it("fills every empty option", () => {
    const filled = withOptionExplanations(question(), explanations);
    if (filled.type !== "multiple_choice") throw new Error("expected multiple choice");
    expect(filled.options.map((option) => option.explanation)).toEqual([
      explanations.a,
      explanations.b,
      explanations.c,
      explanations.d,
    ]);
  });

  it("keeps an explanation the generator already wrote", () => {
    const filled = withOptionExplanations(question({ b: "Original reasoning." }), explanations);
    if (filled.type !== "multiple_choice") throw new Error("expected multiple choice");
    expect(filled.options[1].explanation).toBe("Original reasoning.");
    expect(filled.options[0].explanation).toBe(explanations.a);
  });
});

describe("applyOptionExplanations", () => {
  it("updates only the named question", () => {
    const quiz: Quiz = {
      title: "Review",
      summary: "",
      questions: [question(), { ...question(), id: "q2" }],
    };
    const next = applyOptionExplanations(quiz, "q2", explanations);
    expect(needsOptionExplanations(next.questions[0])).toBe(true);
    expect(needsOptionExplanations(next.questions[1])).toBe(false);
  });
});

describe("buildOptionExplanationInstructions", () => {
  it("asks for grounding when the study material is available", () => {
    const instructions = buildOptionExplanationInstructions("English", true);
    expect(instructions).toContain("only on the supplied study material");
    expect(instructions).toContain("Write every explanation in English");
    expect(instructions).not.toContain("study material is unavailable");
  });

  it("tells the model not to invent sources when the material is gone", () => {
    const instructions = buildOptionExplanationInstructions("Chinese", false);
    expect(instructions).toContain("study material is unavailable");
    expect(instructions).toContain("Do not invent source facts, page numbers, or citations.");
    expect(instructions).toContain("Write every explanation in Chinese");
  });

  it("always demands a reason per distractor, not a restatement", () => {
    for (const grounded of [true, false]) {
      const instructions = buildOptionExplanationInstructions("English", grounded);
      expect(instructions).toContain("an explanation for every option: a, b, c, and d");
      expect(instructions).toContain("do not merely restate that it is wrong");
    }
  });

  it("states the JSON shape in the prompt, not only in the response format", () => {
    // The gateway ignored `text.format` and answered in prose ("a. This is..."), exactly as
    // it did for the exam review sheet. The shape has to be in the prompt to survive that.
    for (const grounded of [true, false]) {
      const instructions = buildOptionExplanationInstructions("English", grounded);
      expect(instructions).toContain('{ "a": string, "b": string, "c": string, "d": string }');
      expect(instructions).toContain(
        "Return JSON only, without Markdown headings or a code fence.",
      );
    }
  });
});

describe("parseOptionExplanationsOutput", () => {
  it("reads a plain JSON object", () => {
    expect(parseOptionExplanationsOutput(JSON.stringify(explanations))).toEqual(explanations);
  });

  it("reads a response wrapped in a Markdown code fence", () => {
    const fenced = "```json\n" + JSON.stringify(explanations) + "\n```";
    expect(parseOptionExplanationsOutput(fenced)).toEqual(explanations);
  });

  it("unwraps the schema name a gateway may nest the object under", () => {
    expect(
      parseOptionExplanationsOutput(JSON.stringify({ option_explanations: explanations })),
    ).toEqual(explanations);
  });

  it("rejects a partial object rather than rendering a half-filled analysis", () => {
    expect(() => parseOptionExplanationsOutput(JSON.stringify({ a: "x", b: "y" }))).toThrow();
  });

  it("rejects prose, so the caller reports a failure instead of storing it", () => {
    expect(() => parseOptionExplanationsOutput("a. This is wrong because...")).toThrow();
  });
});

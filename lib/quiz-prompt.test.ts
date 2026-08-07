import { describe, expect, it } from "vitest";
import { buildQuizInstructions } from "./quiz-prompt";

describe("buildQuizInstructions", () => {
  it("requires every generated quiz field to be in English", () => {
    const instructions = buildQuizInstructions({
      questions: [{ type: "multiple_choice", count: 5 }],
      difficulty: "basic",
    });

    expect(instructions).toContain(
      "Generate exactly: 5 multiple choice question(s). Use basic difficulty.",
    );
    expect(instructions).toContain("provided study material");
    expect(instructions).not.toContain("uploaded PDF");
    expect(instructions).toContain("Write every user-visible field in English");
    expect(instructions).toContain(
      "title, summary, examHeader, prompt, option text, per-option explanation, explanation, and sourceNote",
    );
    expect(instructions).toContain("Give every multiple-choice option its own explanation");
    expect(instructions).toContain("Fill in examHeader with courseTitle");
  });

  it("spells out the option object shape so per-option analysis is not dropped", () => {
    const instructions = buildQuizInstructions({
      questions: [{ type: "multiple_choice", count: 5 }],
      difficulty: "mixed",
    });

    // Asking for it in prose was not enough on its own: the field contract is what the
    // model follows, and an option shape without `explanation` parses fine but renders blank.
    expect(instructions).toContain('{"id": "a", "text": "...", "explanation": "..."}');
    expect(instructions).toContain("all four need their own explanation");
    // Describing only the option shape here once cost every question its correctOptionId and
    // failed the whole quiz, so the two have to be named together.
    expect(instructions).toContain("needs both correctOptionId and an options array");
  });
});

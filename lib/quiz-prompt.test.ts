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
});

import { describe, expect, it } from "vitest";
import { normalizeAnswer, parseQuestionConfiguration, parseSettings } from "./quiz";

describe("parseSettings", () => {
  it("normalizes fill-blank answers for matching", () => {
    expect(normalizeAnswer("  Retrieval-Augmented  Generation ")).toBe(
      "retrieval augmented generation",
    );
  });
  it("parses supported count and difficulty", () => {
    expect(parseSettings("5", "basic")).toEqual({
      count: 5,
      difficulty: "basic",
    });
  });

  it("rejects unsupported question count in English", () => {
    expect(() => parseSettings("7", "basic")).toThrow("Question count is invalid");
  });
});

describe("parseQuestionConfiguration", () => {
  // The UI no longer creates custom types, but a browser on the previous bundle still can.
  it("accepts fixed and custom question quantities", () => {
    expect(
      parseQuestionConfiguration(
        JSON.stringify([
          { type: "multiple_choice", count: 2 },
          { type: "custom", count: 1, label: "Calculation", instructions: "Show each step." },
        ]),
      ),
    ).toEqual([
      { type: "multiple_choice", count: 2 },
      { type: "custom", count: 1, label: "Calculation", instructions: "Show each step." },
    ]);
  });

  it("rejects custom question types without requirements", () => {
    expect(() =>
      parseQuestionConfiguration(
        JSON.stringify([{ type: "custom", count: 1, label: "Calculation", instructions: "" }]),
      ),
    ).toThrow("Question configuration is invalid");
  });
});

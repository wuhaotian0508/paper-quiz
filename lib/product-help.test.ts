import { describe, expect, it } from "vitest";
import {
  buildProductHelpInstructions,
  parseProductHelpReply,
  ProductHelpRequestSchema,
} from "./product-help";

describe("product help contract", () => {
  it("accepts bounded product-help fields but rejects study material", () => {
    expect(
      ProductHelpRequestSchema.safeParse({
        message: "Where do I export a PDF?",
        history: [{ role: "user", content: "I need a printable copy" }],
        currentView: "quiz-lab",
      }).success,
    ).toBe(true);
    expect(
      ProductHelpRequestSchema.safeParse({
        message: "Where do I export a PDF?",
        transcript: "private lecture text",
      }).success,
    ).toBe(false);
  });

  it("grounds the API in real buttons and excludes academic tutoring", () => {
    const instructions = buildProductHelpInstructions();
    expect(instructions).toContain("Mistake Book");
    expect(instructions).toContain("Generate quiz");
    expect(instructions).toMatch(/do not answer academic questions/i);
  });

  it("rejects malformed model output", () => {
    expect(parseProductHelpReply('{"reply":""}')).toBeNull();
  });
});

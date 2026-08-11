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

  it("accepts the library view the sidebar actually routes to", () => {
    expect(
      ProductHelpRequestSchema.safeParse({ message: "Where are my PDFs?", currentView: "library" })
        .success,
    ).toBe(true);
  });

  /**
   * The map went a whole release cycle describing a product that no longer matched the app,
   * so the chatbot confidently gave stale answers. These assertions are the tripwire: a
   * feature that changes behaviour has to be reflected here before the suite goes green.
   */
  it("describes the shipped features a learner is most likely to ask about", () => {
    const instructions = buildProductHelpInstructions();
    expect(instructions).toContain("up to 5 PDFs at once");
    expect(instructions).toMatch(/1, 2, 4, 7, 15, and 30 days/);
    expect(instructions).toMatch(/course folders/i);
    expect(instructions).toMatch(/every multiple-choice option carries its own note/i);
    expect(instructions).toMatch(/7-day challenge link/i);
    // The chatbot must own "I don't know" rather than inventing a control for it.
    expect(instructions).toMatch(/not yet grouped by knowledge point/i);
  });

  it("rejects malformed model output", () => {
    expect(parseProductHelpReply('{"reply":""}')).toBeNull();
  });
});

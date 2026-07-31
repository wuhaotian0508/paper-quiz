import { describe, expect, it } from "vitest";
import { findHelpArticles, getProductHelpReply } from "./product-help";

describe("product help", () => {
  it("finds PDF export help", () => {
    expect(findHelpArticles("How do I download a PDF?")[0]?.id).toBe("pdf-exports");
  });

  it("answers documented use questions locally", () => {
    expect(getProductHelpReply("Where is my mistake book?").kind).toBe("article");
  });

  it("refuses to invent unsupported or academic answers", () => {
    expect(getProductHelpReply("Can you solve my calculus homework?").kind).toBe("fallback");
  });
});

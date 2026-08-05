import { expect, it } from "vitest";
import { createFeedbackHref } from "./feedback";

it("creates the shared Google Form feedback link", () => {
  expect(createFeedbackHref("Chatbot question: Can I export cards?")).toBe(
    "https://docs.google.com/forms/d/e/1FAIpQLSdgqSIBtVjXqOVEsb586N1_vdIAcYz-ce-54pfxERikOGudRQ/viewform",
  );
});

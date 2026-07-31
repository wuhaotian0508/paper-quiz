import { expect, it } from "vitest";
import { createFeedbackHref } from "./feedback";

it("creates an email feedback link with the relevant context", () => {
  expect(createFeedbackHref("Chatbot question: Can I export cards?")).toContain(
    "Chatbot%20question%3A%20Can%20I%20export%20cards%3F",
  );
});

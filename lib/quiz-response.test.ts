import { describe, expect, it } from "vitest";
import { readQuizResponse } from "./quiz-response";

describe("readQuizResponse", () => {
  it("turns an HTML error page into a readable English server error", async () => {
    const response = new Response("<html><head><title>502</title></head></html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    });

    await expect(readQuizResponse(response)).rejects.toThrow(
      "The server returned an HTML error page (HTTP 502). Please try again.",
    );
  });

  it("parses JSON responses without changing the payload", async () => {
    const response = new Response(JSON.stringify({ title: "Quiz", questions: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(readQuizResponse(response)).resolves.toEqual({
      title: "Quiz",
      questions: [],
    });
  });
});

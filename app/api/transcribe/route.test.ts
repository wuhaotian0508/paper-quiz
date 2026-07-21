// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalKey = process.env.OPENAI_API_KEY;

function requestWith(form: FormData) {
  return new Request("http://localhost/api/transcribe", { method: "POST", body: form });
}

afterEach(() => {
  process.env.OPENAI_API_KEY = originalKey;
});

describe("POST /api/transcribe", () => {
  it("rejects a missing audio file", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    const response = await POST(requestWith(new FormData()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please select a lecture recording first." });
  });

  it("rejects unsupported audio uploads", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const form = new FormData();
    form.set("file", new File(["notes"], "notes.txt", { type: "text/plain" }));

    const response = await POST(requestWith(form));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Choose an MP3, M4A, WAV, WebM, or MP4 lecture recording." });
  });

  it("reports missing server configuration without sending the upload", async () => {
    process.env.OPENAI_API_KEY = "";
    const form = new FormData();
    form.set("file", new File(["audio"], "lecture.mp3", { type: "audio/mpeg" }));

    const response = await POST(requestWith(form));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "The server has not been configured with an OpenAI API key." });
  });
});

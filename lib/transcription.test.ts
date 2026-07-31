import { describe, expect, it } from "vitest";
import { getTranscriptionModel, transcribeAudio, validateAudioFile } from "./transcription";

describe("validateAudioFile", () => {
  it("accepts supported lecture audio", () => {
    const audio = new File(["audio"], "lecture.m4a", { type: "audio/mp4" });

    expect(validateAudioFile(audio)).toEqual({ valid: true });
  });

  it("rejects unsupported files without imposing an application size limit", () => {
    const text = new File(["notes"], "notes.txt", { type: "text/plain" });
    const large = new File([new Uint8Array(20 * 1024 * 1024 + 1)], "lecture.mp3", {
      type: "audio/mpeg",
    });

    expect(validateAudioFile(text)).toEqual({
      valid: false,
      error: "Choose an MP3, M4A, WAV, WebM, or MP4 lecture recording.",
    });
    expect(validateAudioFile(large)).toEqual({ valid: true });
  });
});

describe("getTranscriptionModel", () => {
  it("uses the low-latency transcription default unless configured", () => {
    expect(getTranscriptionModel({})).toBe("gpt-4o-mini-transcribe");
    expect(getTranscriptionModel({ OPENAI_TRANSCRIBE_MODEL: "gpt-4o-transcribe" })).toBe(
      "gpt-4o-transcribe",
    );
  });
});

describe("transcribeAudio", () => {
  it("sends the audio file and lecture terminology prompt to the transcription API", async () => {
    let request: unknown;
    const client = {
      audio: {
        transcriptions: {
          create: async (value: unknown) => {
            request = value;
            return { text: "  A transcript about RAG systems.  " };
          },
        },
      },
    };
    const file = new File(["audio"], "lecture.webm", { type: "audio/webm" });

    await expect(transcribeAudio(client, file, "gpt-4o-mini-transcribe")).resolves.toBe(
      "A transcript about RAG systems.",
    );
    expect(request).toMatchObject({ file, model: "gpt-4o-mini-transcribe" });
  });
});

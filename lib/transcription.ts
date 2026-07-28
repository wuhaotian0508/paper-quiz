const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]);
const SUPPORTED_TYPES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/mp4",
]);

type TranscriptionEnv = { OPENAI_TRANSCRIBE_MODEL?: string };

type TranscriptionClient = {
  audio: {
    transcriptions: {
      create: (input: { file: File; model: string; prompt: string }) => Promise<{ text: string }>;
    };
  };
};

export function validateAudioFile(file: File): { valid: true } | { valid: false; error: string } {
  const extension = file.name.toLowerCase().split(".").pop();
  if (!extension || (!SUPPORTED_TYPES.has(file.type) && !SUPPORTED_EXTENSIONS.has(extension))) {
    return { valid: false, error: "Choose an MP3, M4A, WAV, WebM, or MP4 lecture recording." };
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return { valid: false, error: "Audio files must be 20 MB or smaller." };
  }
  return { valid: true };
}

export function getTranscriptionModel(env?: TranscriptionEnv) {
  const configured =
    env?.OPENAI_TRANSCRIBE_MODEL ??
    (process.env as Record<string, string | undefined>)["OPENAI_TRANSCRIBE_MODEL"];
  return configured || "gpt-4o-mini-transcribe";
}

export async function transcribeAudio(client: TranscriptionClient, file: File, model: string) {
  const response = await client.audio.transcriptions.create({
    file,
    model,
    prompt:
      "This is a university lecture. Preserve technical terms, names, acronyms, equations, and important vocabulary.",
  });
  const transcript = response.text.trim();
  if (!transcript) throw new Error("The transcription service returned no text.");
  return transcript;
}

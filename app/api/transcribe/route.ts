import OpenAI from "openai";
import { getOpenAIClientOptions } from "@/lib/openai-config";
import { getTranscriptionModel, transcribeAudio, validateAudioFile } from "@/lib/transcription";

export const maxDuration = 60;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return jsonError("Please select a lecture recording first.", 400);
    }

    const validation = validateAudioFile(file);
    if (!validation.valid) {
      return jsonError(validation.error, 400);
    }

    const clientOptions = getOpenAIClientOptions();
    if (!clientOptions) {
      return jsonError("The server has not been configured with an OpenAI API key.", 503);
    }

    const transcript = await transcribeAudio(
      new OpenAI(clientOptions),
      file,
      getTranscriptionModel(),
    );
    return Response.json({ transcript });
  } catch (error) {
    console.error(
      "Audio transcription failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return jsonError("Audio transcription failed. Please try again later.", 502);
  }
}

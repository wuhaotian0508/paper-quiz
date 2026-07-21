import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { parseQuestionConfiguration, parseSettings, QuizSchema } from "@/lib/quiz";
import { getOpenAIClientOptions } from "@/lib/openai-config";
import { collectResponseText } from "@/lib/openai-stream";
import { getQuizGenerationOptions } from "@/lib/quiz-generation";
import { parseQuizOutput } from "@/lib/quiz-output";
import { buildQuizInstructions } from "@/lib/quiz-prompt";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const transcript = String(form.get("transcript") ?? "").trim();
    const countValue = String(form.get("count") ?? "");
    const questionConfigValue = String(form.get("questions") ?? "");
    const difficultyValue = String(form.get("difficulty") ?? "");

    if (!(file instanceof File) && !transcript) {
      return jsonError("Please upload a PDF or provide a lecture transcript.", 400);
    }
    if (file instanceof File && transcript) {
      return jsonError("Choose either a PDF or a lecture transcript, not both.", 400);
    }
    if (file instanceof File && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return jsonError("Only PDF files are supported.", 400);
    }
    if (file instanceof File && file.size > MAX_FILE_BYTES) {
      return jsonError("PDF files must be 20 MB or smaller.", 400);
    }

    let settings: { difficulty: string; questions: ReturnType<typeof parseQuestionConfiguration> };
    try {
      const legacy = parseSettings(countValue, difficultyValue);
      settings = {
        difficulty: legacy.difficulty,
        questions: questionConfigValue ? parseQuestionConfiguration(questionConfigValue) : [{ type: "multiple_choice", count: legacy.count }],
      };
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Quiz settings are invalid.", 400);
    }

    const clientOptions = getOpenAIClientOptions();
    if (!clientOptions) {
      return jsonError("The server has not been configured with an OpenAI API key.", 503);
    }

    const client = new OpenAI(clientOptions);
    const generationOptions = getQuizGenerationOptions(process.env.OPENAI_MODEL || "gpt-5.5");
    const sourceContent = file instanceof File
      ? [
          {
            type: "input_file" as const,
            filename: file.name,
            file_data: `data:application/pdf;base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`,
            detail: "auto" as const,
          },
          {
            type: "input_text" as const,
            text: buildQuizInstructions(settings),
          },
        ]
      : [
          {
            type: "input_text" as const,
            text: `${buildQuizInstructions(settings)}\n\n<lecture_transcript>\n${transcript}\n</lecture_transcript>`,
          },
        ];
    const stream = await client.responses.create({
      ...generationOptions,
      input: [
        {
          role: "user",
          content: sourceContent,
        },
      ],
      text: { format: zodTextFormat(QuizSchema, "quiz") },
    });

    const outputText = await collectResponseText(stream);
    if (!outputText) {
      return jsonError("AI did not return a usable quiz. Please try again.", 502);
    }

    try {
      return Response.json(parseQuizOutput(outputText, file instanceof File ? file.name : "Lecture transcript"));
    } catch {
      return jsonError("AI returned an incomplete quiz format. Please try again.", 502);
    }
  } catch (error) {
    console.error("Quiz generation failed", error instanceof Error ? error.message : "unknown error");
    return jsonError("Quiz generation failed. Please try again later.", 502);
  }
}

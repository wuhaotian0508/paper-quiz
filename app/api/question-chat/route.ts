import OpenAI from "openai";
import { getOpenAIClientOptions } from "@/lib/openai-config";
import { QuestionSchema } from "@/lib/quiz";
import { collectResponseText } from "@/lib/openai-stream";

function error(message: string, status: number) { return Response.json({ error: message }, { status }); }

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const message = String(form.get("message") ?? "").trim();
    const transcript = String(form.get("transcript") ?? "").trim();
    const rawQuestion = String(form.get("question") ?? "");
    const rawHistory = String(form.get("history") ?? "[]");
    const file = form.get("file");
    if (!message || !rawQuestion || (!transcript && !(file instanceof File))) return error("Please provide a question, message, and study material.", 400);
    const question = QuestionSchema.safeParse(JSON.parse(rawQuestion));
    if (!question.success) return error("The current question is invalid.", 400);
    const history = JSON.parse(rawHistory) as Array<{ role: "user" | "assistant"; content: string }>;
    const options = getOpenAIClientOptions();
    if (!options) return error("The server has not been configured with an OpenAI API key.", 503);
    const content = [
      { type: "input_text" as const, text: [
        "You are a study tutor. Answer only from the supplied study material and current question.",
        "If the material does not support an answer, say so plainly. Do not invent facts.",
        `CURRENT QUESTION: ${JSON.stringify(question.data)}`,
        `CONVERSATION: ${JSON.stringify(history.slice(-8))}`,
        `STUDENT: ${message}`,
        ...(transcript ? [`LECTURE TRANSCRIPT: ${transcript}`] : []),
      ].join("\n\n") },
      ...(file instanceof File ? [{ type: "input_file" as const, filename: file.name, file_data: `data:application/pdf;base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`, detail: "auto" as const }] : []),
    ];
    const stream = await new OpenAI(options).responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.5", stream: true, max_output_tokens: 1200,
      input: [{ role: "user", content }],
    });
    const reply = await collectResponseText(stream);
    if (!reply) return error("The tutor did not return a response. Please try again.", 502);
    return Response.json({ reply });
  } catch (cause) {
    console.error("Question chat failed", cause instanceof Error ? cause.message : "unknown error");
    return error("Question chat failed. Please try again later.", 502);
  }
}

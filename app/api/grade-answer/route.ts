import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { GradeResultSchema, QuestionSchema } from "@/lib/quiz";
import { getOpenAIClientOptions } from "@/lib/openai-config";
import { collectResponseText } from "@/lib/openai-stream";

function error(message: string, status: number) { return Response.json({ error: message }, { status }); }

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const answer = String(form.get("answer") ?? "").trim();
    const transcript = String(form.get("transcript") ?? "").trim();
    const file = form.get("file");
    const rawQuestion = String(form.get("question") ?? "");
    if (!answer || !rawQuestion || (!transcript && !(file instanceof File))) return error("Please provide an answer, question, and study material.", 400);
    const question = QuestionSchema.safeParse(JSON.parse(rawQuestion));
    if (!question.success || question.data.type === "multiple_choice") return error("This question cannot be graded as a written answer.", 400);
    const options = getOpenAIClientOptions();
    if (!options) return error("The server has not been configured with an OpenAI API key.", 503);
    const stream = await new OpenAI(options).responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.5", stream: true, max_output_tokens: 900,
      input: [{ role: "user", content: [
        { type: "input_text" as const, text: [
        "Grade the student's answer only against the supplied lecture transcript and question.",
        "Return correct, partial, or incorrect; score must be 0 to 1. Do not invent facts.",
        `QUESTION: ${JSON.stringify(question.data)}`,
        `STUDENT ANSWER: ${answer}`,
        ...(transcript ? [`LECTURE TRANSCRIPT: ${transcript}`] : []),
      ].join("\n\n") },
        ...(file instanceof File ? [{ type: "input_file" as const, filename: file.name, file_data: `data:application/pdf;base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`, detail: "auto" as const }] : []),
      ] }],
      text: { format: zodTextFormat(GradeResultSchema, "grade") },
    });
    const output = await collectResponseText(stream);
    return Response.json(GradeResultSchema.parse(JSON.parse(output)));
  } catch (cause) {
    console.error("Answer grading failed", cause instanceof Error ? cause.message : "unknown error");
    return error("Answer grading failed. Please try again later.", 502);
  }
}

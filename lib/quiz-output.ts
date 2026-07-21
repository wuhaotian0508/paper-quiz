import { z } from "zod";
import { QuizSchema, type Quiz } from "@/lib/quiz";

const optionId = z.enum(["a", "b", "c", "d"]);
const crsQuestionSchema = z.object({
  question: z.string().min(1),
  options: z.object({
    a: z.string().min(1),
    b: z.string().min(1),
    c: z.string().min(1),
    d: z.string().min(1),
  }),
  answer: optionId,
  explanation: z.string().min(1),
  sourceNote: z.string().min(1).optional(),
});

function stripCodeFence(output: string) {
  return output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export function parseQuizOutput(output: string, fileName: string): Quiz {
  const value: unknown = JSON.parse(stripCodeFence(output));
  const direct = QuizSchema.safeParse(value);
  if (direct.success) return direct.data;

  const questions = z.array(crsQuestionSchema).min(1).parse(value);
  return QuizSchema.parse({
    title: `${fileName} Review Quiz`,
    summary: "A review quiz generated from the uploaded PDF.",
    questions: questions.map((question, index) => ({
      id: `q${index + 1}`,
      type: "multiple_choice" as const,
      prompt: question.question,
      options: (["a", "b", "c", "d"] as const).map((id) => ({
        id,
        text: question.options[id],
      })),
      correctOptionId: question.answer,
      explanation: question.explanation,
      sourceNote: question.sourceNote || "Uploaded PDF",
    })),
  });
}

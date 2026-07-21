import { z } from "zod";

export const DifficultySchema = z.enum(["basic", "mixed", "challenging"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

const OptionSchema = z.object({ id: z.enum(["a", "b", "c", "d"]), text: z.string().min(1) });
const BaseQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  explanation: z.string().min(1),
  sourceNote: z.string().min(1),
});

export const MultipleChoiceQuestionSchema = BaseQuestionSchema.extend({
  type: z.literal("multiple_choice"),
  options: z.array(OptionSchema).length(4),
  correctOptionId: z.enum(["a", "b", "c", "d"]),
});
export const FillBlankQuestionSchema = BaseQuestionSchema.extend({
  type: z.literal("fill_blank"),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  referenceAnswer: z.string().min(1),
});
export const WrittenQuestionSchema = BaseQuestionSchema.extend({
  type: z.enum(["short_answer", "custom"]),
  referenceAnswer: z.string().min(1),
  gradingCriteria: z.array(z.string().min(1)).min(1),
  customLabel: z.string().min(1).optional(),
});
export const QuestionSchema = z.discriminatedUnion("type", [
  MultipleChoiceQuestionSchema,
  FillBlankQuestionSchema,
  WrittenQuestionSchema,
]);

export const QuizSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  questions: z.array(QuestionSchema).min(1),
});
export type Question = z.infer<typeof QuestionSchema>;
export type Quiz = z.infer<typeof QuizSchema>;

export const QuestionConfigurationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["multiple_choice", "fill_blank", "short_answer"]), count: z.number().int().min(0).max(15) }),
  z.object({ type: z.literal("custom"), count: z.number().int().min(1).max(15), label: z.string().trim().min(1).max(80), instructions: z.string().trim().min(1).max(500) }),
]);
export type QuestionConfiguration = z.infer<typeof QuestionConfigurationSchema>;

export const GradeResultSchema = z.object({
  status: z.enum(["correct", "partial", "incorrect"]),
  score: z.number().min(0).max(1),
  feedback: z.string().min(1),
  missingPoints: z.array(z.string()),
});
export type GradeResult = z.infer<typeof GradeResultSchema>;

const allowedCounts = [5, 10, 15] as const;
export type QuestionCount = (typeof allowedCounts)[number];

export function parseSettings(countValue: string, difficultyValue: string): { count: QuestionCount; difficulty: Difficulty } {
  const count = Number(countValue);
  if (!allowedCounts.includes(count as QuestionCount)) throw new Error("Question count is invalid");
  const difficulty = DifficultySchema.safeParse(difficultyValue);
  if (!difficulty.success) throw new Error("Difficulty setting is invalid");
  return { count: count as QuestionCount, difficulty: difficulty.data };
}

export function parseQuestionConfiguration(value: string): QuestionConfiguration[] {
  try {
    const parsed = z.array(QuestionConfigurationSchema).min(1).parse(JSON.parse(value));
    const total = parsed.reduce((sum, item) => sum + item.count, 0);
    if (total < 1 || total > 15) throw new Error("total");
    return parsed.filter((item) => item.count > 0);
  } catch {
    throw new Error("Question configuration is invalid");
  }
}

export function calculateScore(quiz: Quiz, answers: Record<string, string>): { correct: number; total: number } {
  const correct = quiz.questions.reduce((total, question) => (
    question.type === "multiple_choice" && answers[question.id] === question.correctOptionId ? total + 1 : total
  ), 0);
  return { correct, total: quiz.questions.length };
}

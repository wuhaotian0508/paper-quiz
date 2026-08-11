import { z } from "zod";

export const DifficultySchema = z.enum(["basic", "mixed", "challenging"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

/**
 * What every quiz is generated at now that the three-way picker is gone. The learner asks
 * for harder or gentler questions in the brief instead, in their own words, which is what
 * "Core review / Mixed practice / Challenge mode" was failing to communicate.
 */
export const DEFAULT_DIFFICULTY: Difficulty = "mixed";

const OptionSchema = z.object({
  id: z.enum(["a", "b", "c", "d"]),
  text: z.string().min(1),
  // Every option carries its own "why this is right / wrong" note. Nullish so quizzes
  // saved before per-option analysis existed still load.
  explanation: z.string().min(1).nullish(),
});
const BaseQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  explanation: z.string().min(1),
  sourceNote: z.string().min(1),
  // Marks printed on the exported exam paper. Nullish for quizzes saved before the
  // exam-paper layout; the exporter substitutes a default for the question type.
  points: z.number().int().min(1).max(40).nullish(),
  /**
   * Which part of the source this question assesses, in the model's own words. Not shown to
   * the learner: it exists so the spread of a generated set can be measured instead of
   * merely asked for. Nullish because every quiz saved before this field still has to load.
   */
  topic: z.string().min(1).max(80).nullish(),
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
  // Structured Outputs requires every field to be present; non-custom questions use null.
  customLabel: z.string().min(1).nullable(),
});
export const QuestionSchema = z.discriminatedUnion("type", [
  MultipleChoiceQuestionSchema,
  FillBlankQuestionSchema,
  WrittenQuestionSchema,
]);

/**
 * The exam-paper header the model fills in. Kept separate from `title` because the
 * printed paper needs the course name on its own line, above the timing banner.
 */
export const ExamHeaderSchema = z.object({
  courseTitle: z.string().min(1).max(80),
  paperLabel: z.string().min(1).max(40),
  durationMinutes: z.number().int().min(10).max(300),
  scope: z.string().min(1).max(200),
});
export type ExamHeader = z.infer<typeof ExamHeaderSchema>;

export const QuizSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  // Nullish so quizzes saved before the exam-paper layout still load; the exporter
  // falls back to the quiz title and a duration derived from the question mix.
  examHeader: ExamHeaderSchema.nullish(),
  questions: z.array(QuestionSchema).min(1),
});
export type Question = z.infer<typeof QuestionSchema>;
export type Quiz = z.infer<typeof QuizSchema>;

export const QuestionConfigurationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["multiple_choice", "fill_blank", "short_answer"]),
    count: z.number().int().min(0).max(15),
  }),
  // Custom types are no longer offered in the UI — a free-text brief covers the same
  // ground for the whole quiz instead of per type. The variant stays so a browser still
  // running the previous bundle, or a draft persisted under it, is not rejected outright.
  z.object({
    type: z.literal("custom"),
    count: z.number().int().min(1).max(15),
    label: z.string().trim().min(1).max(80),
    instructions: z.string().trim().min(1).max(500),
  }),
]);
export type QuestionConfiguration = z.infer<typeof QuestionConfigurationSchema>;

export const GradeResultSchema = z.object({
  status: z.enum(["correct", "partial", "incorrect"]),
  score: z.number().min(0).max(1),
  feedback: z.string().min(1),
  missingPoints: z.array(z.string()),
});
export type GradeResult = z.infer<typeof GradeResultSchema>;

/**
 * Identifies a question by what it asks. The model numbers questions per quiz, so
 * `question.id` is only unique inside one quiz — anything that collects questions across
 * quizzes (the mistake book, per-material views) has to key on content instead.
 */
export function questionKey(question: Pick<Question, "type" | "prompt">): string {
  const normalizedPrompt = question.prompt
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
  const basis = `${question.type}::${normalizedPrompt}`;
  let hash = 2166136261;
  for (let index = 0; index < basis.length; index += 1) {
    hash ^= basis.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `m-${(hash >>> 0).toString(36)}`;
}

export function correctAnswerText(question: Question): string {
  if (question.type !== "multiple_choice") return question.referenceAnswer;
  return (
    question.options.find((option) => option.id === question.correctOptionId)?.text ||
    question.correctOptionId.toUpperCase()
  );
}

export function questionTypeLabel(question: Question): string {
  if (question.type === "custom") return question.customLabel || "Custom";
  return question.type.replaceAll("_", " ");
}

export function normalizeAnswer(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[\u2010-\u2015-]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const allowedCounts = [5, 10, 15] as const;
export type QuestionCount = (typeof allowedCounts)[number];

export function parseSettings(
  countValue: string,
  difficultyValue: string,
): { count: QuestionCount; difficulty: Difficulty } {
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

/** Rejects a model answer that changed the server-configured question count or type mix. */
export function assertQuizMatchesQuestionConfiguration(
  quiz: Quiz,
  configuration: QuestionConfiguration[],
) {
  const requested = new Map<Question["type"], number>();
  for (const item of configuration)
    requested.set(item.type, (requested.get(item.type) ?? 0) + item.count);
  const received = new Map<Question["type"], number>();
  for (const question of quiz.questions)
    received.set(question.type, (received.get(question.type) ?? 0) + 1);

  if (received.size !== requested.size)
    throw new Error("Quiz question types do not match the requested configuration.");
  for (const [type, count] of requested) {
    if (received.get(type) !== count)
      throw new Error("Quiz question types do not match the requested configuration.");
  }
}

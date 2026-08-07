import { z } from "zod";
import { QuizSchema, type Quiz } from "@/lib/quiz";
import { assertDistinctQuizQuestions } from "@/lib/quiz-coverage";

const optionId = z.enum(["a", "b", "c", "d"]);
const gatewayQuestionTypeAliases = {
  "multiple-choice": "multiple_choice",
  multipleChoice: "multiple_choice",
  "fill-blank": "fill_blank",
  fillBlank: "fill_blank",
  "short-answer": "short_answer",
  shortAnswer: "short_answer",
} as const;
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
  optionExplanations: z
    .object({
      a: z.string().min(1),
      b: z.string().min(1),
      c: z.string().min(1),
      d: z.string().min(1),
    })
    .optional(),
  sourceNote: z.string().min(1).optional(),
});

function stripCodeFence(output: string) {
  return output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

const OPTION_IDS = ["a", "b", "c", "d"] as const;

function readOptionId(value: unknown): "a" | "b" | "c" | "d" | undefined {
  if (typeof value === "number" && value >= 0 && value < 4) return OPTION_IDS[value];
  if (typeof value !== "string") return undefined;
  // "B", "b)", "Option C", "answer: d" all name an option; take the first a-d letter.
  const letter = value.trim().toLowerCase().match(/[a-d]/)?.[0];
  return letter ? (letter as "a" | "b" | "c" | "d") : undefined;
}

/**
 * Recovers the answer to a multiple-choice question the model did not label with
 * `correctOptionId`.
 *
 * Losing the whole quiz to one missing field is the worst outcome available, and this
 * gateway does not enforce the response schema, so the answer is looked for under the other
 * names models reach for and on the options themselves before giving up.
 */
function normalizeCorrectOption(question: Record<string, unknown>): unknown {
  if (readOptionId(question.correctOptionId)) return question;

  const named = [
    question.correctOptionId,
    question.correctOption,
    question.correct_option_id,
    question.correctAnswer,
    question.correct_answer,
    question.answer,
    question.correct,
  ]
    .map(readOptionId)
    .find(Boolean);
  if (named) return { ...question, correctOptionId: named };

  const options = Array.isArray(question.options) ? question.options : [];
  const flagged = options.findIndex(
    (option) =>
      !!option &&
      typeof option === "object" &&
      ["isCorrect", "correct", "is_correct"].some(
        (key) => (option as Record<string, unknown>)[key] === true,
      ),
  );
  if (flagged >= 0) {
    const option = options[flagged] as Record<string, unknown>;
    return { ...question, correctOptionId: readOptionId(option.id) ?? OPTION_IDS[flagged] };
  }
  return question;
}

function normalizeGatewayQuestionTypes(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const quiz = value as { questions?: unknown };
  if (!Array.isArray(quiz.questions)) return value;

  return {
    ...quiz,
    questions: quiz.questions.map((question) => {
      if (!question || typeof question !== "object" || Array.isArray(question)) return question;
      const item = question as Record<string, unknown>;
      const normalizedType =
        typeof item.type === "string"
          ? gatewayQuestionTypeAliases[item.type as keyof typeof gatewayQuestionTypeAliases]
          : undefined;
      const typed = normalizedType ? { ...item, type: normalizedType } : item;
      const type = (typed as { type?: unknown }).type;
      return type === "multiple_choice"
        ? normalizeCorrectOption(typed as Record<string, unknown>)
        : typed;
    }),
  };
}

/**
 * Answers, grades, and chat are all keyed by question id, so a quiz that repeats an id
 * would let one question overwrite another's state. The model is not asked for unique
 * ids, so enforce it here rather than trusting the output.
 */
function withUniqueIds(quiz: Quiz): Quiz {
  const seen = new Set<string>();
  return {
    ...quiz,
    questions: quiz.questions.map((question, index) => {
      if (!seen.has(question.id)) {
        seen.add(question.id);
        return question;
      }
      let id = `${question.id}-${index + 1}`;
      while (seen.has(id)) id = `${id}x`;
      seen.add(id);
      return { ...question, id };
    }),
  };
}

export function parseQuizOutput(output: string, fileName: string): Quiz {
  const value: unknown = JSON.parse(stripCodeFence(output));
  const normalized = normalizeGatewayQuestionTypes(value);
  const direct = QuizSchema.safeParse(normalized);
  if (direct.success) {
    const quiz = withUniqueIds(direct.data);
    assertDistinctQuizQuestions(quiz);
    return quiz;
  }
  if (!Array.isArray(value)) return QuizSchema.parse(normalized);

  const questions = z.array(crsQuestionSchema).min(1).parse(value);
  const quiz = QuizSchema.parse({
    title: `${fileName} Review Quiz`,
    summary: "A review quiz generated from the uploaded PDF.",
    questions: questions.map((question, index) => ({
      id: `q${index + 1}`,
      type: "multiple_choice" as const,
      prompt: question.question,
      options: (["a", "b", "c", "d"] as const).map((id) => ({
        id,
        text: question.options[id],
        explanation: question.optionExplanations?.[id] ?? null,
      })),
      correctOptionId: question.answer,
      explanation: question.explanation,
      sourceNote: question.sourceNote || "Uploaded PDF",
    })),
  });
  assertDistinctQuizQuestions(quiz);
  return quiz;
}

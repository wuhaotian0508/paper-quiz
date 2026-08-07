import { z } from "zod";
import type { Question, Quiz } from "@/lib/quiz";

/**
 * One "why this option is right / wrong" note per choice. Every key is required: the
 * point of the backfill is to fill the gaps, so a partial answer would leave the same
 * ragged display the backfill exists to remove.
 */
export const OptionExplanationsSchema = z.object({
  a: z.string().min(1),
  b: z.string().min(1),
  c: z.string().min(1),
  d: z.string().min(1),
});
export type OptionExplanations = z.infer<typeof OptionExplanationsSchema>;

/**
 * True when a question could show per-option analysis but has none stored.
 *
 * Quizzes generated before per-option analysis existed — which is every question already
 * in a student's mistake book — parse fine because `explanation` is nullish, and then
 * render an empty analysis block. Those are exactly the questions worth backfilling.
 */
export function needsOptionExplanations(question: Question): boolean {
  return (
    question.type === "multiple_choice" && question.options.some((option) => !option.explanation)
  );
}

/** Applies a backfill result, leaving any explanation the generator already wrote alone. */
export function withOptionExplanations(
  question: Question,
  explanations: OptionExplanations,
): Question {
  if (question.type !== "multiple_choice") return question;
  return {
    ...question,
    options: question.options.map((option) => ({
      ...option,
      explanation: option.explanation || explanations[option.id],
    })),
  };
}

export function applyOptionExplanations(
  quiz: Quiz,
  questionId: string,
  explanations: OptionExplanations,
): Quiz {
  return {
    ...quiz,
    questions: quiz.questions.map((question) =>
      question.id === questionId ? withOptionExplanations(question, explanations) : question,
    ),
  };
}

/**
 * The prompt is shared by the generator and the backfill route so a question explained
 * after the fact reads like one explained at generation time.
 */
export function buildOptionExplanationInstructions(language: string, grounded: boolean): string {
  return [
    "You are a careful, clear exam tutor. Explain a multiple-choice question one option at a time.",
    "Return an explanation for every option: a, b, c, and d.",
    "For the correct option, say what makes it correct. For each wrong option, name the specific misconception, misread, or confusion that would lead a student to pick it — do not merely restate that it is wrong.",
    "Keep each explanation to one or two sentences. Never reuse the same sentence across options.",
    grounded
      ? "Base every explanation only on the supplied study material and the question itself. Do not invent facts that are not in the material."
      : // The mistake book keeps the question but not always the PDF it came from. Reasoning
        // from the question's own stated answer is still useful; inventing new source facts
        // is not, so the model is told which ground it actually has.
        "The original study material is unavailable. Reason only from the question, its stated correct answer, and its existing explanation. Do not invent source facts, page numbers, or citations.",
    `Write every explanation in ${language}.`,
    // A gateway behind OPENAI_BASE_URL need not honour the json_schema response format, and
    // this one answers in prose ("a. This is...") when only asked for it there. The shape has
    // to be stated in the prompt as well, exactly as the exam review route already does.
    'Return exactly one JSON object with this shape: { "a": string, "b": string, "c": string, "d": string }. Each value is that option\'s explanation.',
    "Return JSON only, without Markdown headings or a code fence.",
  ].join("\n");
}

/**
 * Tolerates the wrappers a gateway adds around the object: a Markdown code fence, or the
 * schema name the Responses API would have used as a key.
 */
export function parseOptionExplanationsOutput(output: string): OptionExplanations {
  const unfenced = output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  let value: unknown = JSON.parse(unfenced);
  for (const key of ["option_explanations", "optionExplanations", "explanations", "options"]) {
    if (value && typeof value === "object" && !Array.isArray(value) && key in value) {
      value = (value as Record<string, unknown>)[key];
    }
  }
  return OptionExplanationsSchema.parse(value);
}

import { z } from "zod";
import {
  LEARNING_RULES,
  LEARNING_RULE_IDS,
  MAX_LEARNING_SCOPE_CHARS,
  sanitizeLearningScope,
  type LearningRule,
} from "@/lib/question-verdict";

/**
 * What a confirmed bad question teaches the next generation run.
 *
 * Kept in this browser and applied to this learner's own runs. That is not a stopgap: a
 * learning is derived from one report about one material, and letting it reach everybody's
 * prompt would mean any anonymous POST could steer generation for the whole product. The
 * report still lands in the reports table, where a rule worth applying globally can be
 * promoted deliberately rather than by a stranger's click.
 *
 * Deliberately not part of `lib/learner-memory.ts`: that store records what the student
 * says about themselves, and its own note explains why an inference about them never
 * belongs there. This is a note about the model's output, not about the learner.
 */

export const GENERATION_LEARNINGS_KEY = "paper-quiz-generation-learnings-v1";

/** Small on purpose: these lines compete with the real instructions for the model's attention. */
export const MAX_INJECTED_LEARNINGS = 5;
const MAX_STORED_LEARNINGS = 40;

export const GenerationLearningSchema = z.object({
  rule: z.enum(LEARNING_RULE_IDS as [LearningRule, ...LearningRule[]]),
  scope: z.string().max(MAX_LEARNING_SCOPE_CHARS).default(""),
  /** Which material this was learned from, so a lesson from one course does not follow another. */
  materialName: z.string().max(200).default(""),
  /** Content-keyed, so re-reporting the same question updates one entry instead of stacking. */
  questionKey: z.string().max(100).default(""),
  learnedAt: z.string().max(40).default(""),
});

export type GenerationLearning = z.infer<typeof GenerationLearningSchema>;

export function readLearnings(value: string | null): GenerationLearning[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => GenerationLearningSchema.safeParse(entry))
      .filter((result) => result.success)
      .map((result) => result.data)
      .slice(0, MAX_STORED_LEARNINGS);
  } catch {
    return [];
  }
}

export function addLearning(
  entries: GenerationLearning[],
  learning: Omit<GenerationLearning, "learnedAt">,
  now: Date = new Date(),
): GenerationLearning[] {
  const entry: GenerationLearning = {
    ...learning,
    scope: sanitizeLearningScope(learning.scope),
    learnedAt: now.toISOString(),
  };
  const isSame = (other: GenerationLearning) =>
    other.rule === entry.rule &&
    (entry.questionKey ? other.questionKey === entry.questionKey : other.scope === entry.scope);
  return [entry, ...entries.filter((other) => !isSame(other))].slice(0, MAX_STORED_LEARNINGS);
}

/**
 * The lessons worth carrying into a run on this material: what went wrong on this material
 * before, then anything learned without one. A lesson from a statistics deck has nothing to
 * teach a run on a history deck, and spending the budget on it would push out one that does.
 */
export function learningsFor(
  entries: GenerationLearning[],
  materialName: string,
): GenerationLearning[] {
  const wanted = materialName.trim().toLocaleLowerCase();
  const matches = (entry: GenerationLearning) =>
    Boolean(wanted) && entry.materialName.trim().toLocaleLowerCase() === wanted;
  return [
    ...entries.filter(matches),
    ...entries.filter((entry) => !matches(entry) && !entry.materialName.trim()),
  ].slice(0, MAX_INJECTED_LEARNINGS);
}

/** The compact form sent to the server: a rule id it can check, and a label it cannot trust. */
export function serializeLearnings(entries: GenerationLearning[]): string {
  return JSON.stringify(entries.map((entry) => ({ rule: entry.rule, scope: entry.scope })));
}

/**
 * The server rebuilds every sentence from its own table after validating the rule id, so a
 * request can choose which lessons apply but never what a lesson says.
 */
export function parseLearnings(value: unknown): { rule: LearningRule; scope: string }[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .map((entry) =>
        z
          .object({
            rule: z.enum(LEARNING_RULE_IDS as [LearningRule, ...LearningRule[]]),
            scope: z.string().max(MAX_LEARNING_SCOPE_CHARS).optional(),
          })
          .safeParse(entry),
      )
      .filter((result) => result.success)
      .map((result) => ({
        rule: result.data.rule,
        scope: sanitizeLearningScope(result.data.scope),
      }))
      .filter((entry) => {
        const key = `${entry.rule}::${entry.scope}`;
        return !seen.has(key) && Boolean(seen.add(key));
      })
      .slice(0, MAX_INJECTED_LEARNINGS);
  } catch {
    return [];
  }
}

/**
 * The block that goes into the generation instructions. The rule text is this server's
 * own; the scope is quoted so it reads as the name of a place in the material rather than
 * as another rule.
 */
export function buildLearningsPrompt(entries: { rule: LearningRule; scope: string }[]): string {
  if (!entries.length) return "";
  const lines = entries.map((entry) => {
    const rule = LEARNING_RULES[entry.rule];
    return entry.scope ? `- ${rule} It went wrong around "${entry.scope}".` : `- ${rule}`;
  });
  return [
    "Faults confirmed against this material in earlier runs. Avoid repeating them; they do not change the question count, types, or output language required above.",
    ...lines,
  ].join("\n");
}

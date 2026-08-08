import { z } from "zod";
import type { ResponseUsage } from "@/lib/openai-stream";

/**
 * What a learner's usage would have cost, shown to them but not billed.
 *
 * Nothing is gated and nothing is charged: the meter exists to make the unit economics
 * visible while the product is still proving it earns reuse. Because no money moves, the
 * running total lives in the browser — it does not need to resist tampering. Charging for
 * real would have to move this server-side first, since clearing site data resets it.
 */
export const USAGE_METER_KEY = "paper-quiz-usage-v1";
export const USAGE_METER_UPDATED_EVENT = "paper-quiz-usage-updated";

/** Dollars per million tokens. Configurable because the deployed model sits behind a gateway. */
const DEFAULT_INPUT_COST_PER_MTOK = 0.2;
const DEFAULT_OUTPUT_COST_PER_MTOK = 1.2;

export function usageRates(
  env: { inputPerMTok?: string; outputPerMTok?: string } = {
    inputPerMTok: process.env.NEXT_PUBLIC_AI_INPUT_COST_PER_MTOK,
    outputPerMTok: process.env.NEXT_PUBLIC_AI_OUTPUT_COST_PER_MTOK,
  },
): { input: number; output: number } {
  const read = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    input: read(env.inputPerMTok, DEFAULT_INPUT_COST_PER_MTOK),
    output: read(env.outputPerMTok, DEFAULT_OUTPUT_COST_PER_MTOK),
  };
}

export function costOf(usage: ResponseUsage, rates = usageRates()): number {
  return (
    (usage.inputTokens / 1_000_000) * rates.input + (usage.outputTokens / 1_000_000) * rates.output
  );
}

/**
 * Sums the usage of several calls made to serve one request.
 *
 * Quiz generation retries once when the model repeats a question, and both attempts are
 * billed, so the meter has to report their total rather than the last one.
 */
export function mergeUsage(
  left: ResponseUsage | null,
  right: ResponseUsage | null,
): ResponseUsage | null {
  if (!left) return right;
  if (!right) return left;
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
  };
}

export type UsageTotals = {
  version: 1;
  /** Model calls that reported usage. Calls a gateway did not report are not counted. */
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Accrued dollars, stored rather than recomputed so a later rate change cannot rewrite history. */
  cost: number;
  updatedAt: string;
};

export const EMPTY_USAGE: UsageTotals = {
  version: 1,
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cost: 0,
  updatedAt: "",
};

const UsageTotalsSchema = z.object({
  version: z.literal(1),
  calls: z.number().min(0),
  inputTokens: z.number().min(0),
  outputTokens: z.number().min(0),
  cost: z.number().min(0),
  updatedAt: z.string(),
});

export function readUsage(value: string | null): UsageTotals {
  try {
    const parsed = UsageTotalsSchema.safeParse(JSON.parse(value || "null"));
    return parsed.success ? parsed.data : EMPTY_USAGE;
  } catch {
    return EMPTY_USAGE;
  }
}

/** Adds one call. A call the provider did not report usage for leaves the totals untouched. */
export function addUsage(
  totals: UsageTotals,
  usage: ResponseUsage | null | undefined,
  now: Date = new Date(),
  rates = usageRates(),
): UsageTotals {
  if (!usage || (usage.inputTokens <= 0 && usage.outputTokens <= 0)) return totals;
  return {
    version: 1,
    calls: totals.calls + 1,
    inputTokens: totals.inputTokens + usage.inputTokens,
    outputTokens: totals.outputTokens + usage.outputTokens,
    cost: totals.cost + costOf(usage, rates),
    updatedAt: now.toISOString(),
  };
}

/**
 * Under a cent reads as "$0.00", which looks like the meter is broken rather than like the
 * usage was cheap. Small totals keep enough decimals to stay visibly non-zero.
 */
export function formatCost(cost: number): string {
  if (cost <= 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * The reference the usage bar fills against.
 *
 * There is no quota — usage is unlimited and unbilled — so this is a display reference, not
 * a cap. It exists because a bar needs something to be a fraction of, and because naming a
 * figure is what makes "you have used this much, and we are not charging for it" legible.
 * Past the reference the bar stays full and the copy says so; nothing stops working.
 */
const DEFAULT_FREE_ALLOWANCE_USD = 0.2;

export function freeAllowance(
  env: { allowance?: string } = { allowance: process.env.NEXT_PUBLIC_FREE_ALLOWANCE_USD },
): number {
  const parsed = Number(env.allowance);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FREE_ALLOWANCE_USD;
}

/** How full the bar is, 0 to 1. Caps at 1 so an over-run cannot overflow the track. */
export function usageProgress(cost: number, allowance = freeAllowance()): number {
  if (!(allowance > 0)) return 0;
  return Math.max(0, Math.min(1, cost / allowance));
}

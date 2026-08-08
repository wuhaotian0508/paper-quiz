import { describe, expect, it } from "vitest";
import {
  addUsage,
  costOf,
  EMPTY_USAGE,
  formatCost,
  mergeUsage,
  readUsage,
  usageRates,
} from "@/lib/usage-meter";

const rates = { input: 1.25, output: 10 };

describe("usage cost", () => {
  it("prices input and output tokens separately", () => {
    expect(costOf({ inputTokens: 1_000_000, outputTokens: 0 }, rates)).toBeCloseTo(1.25);
    expect(costOf({ inputTokens: 0, outputTokens: 1_000_000 }, rates)).toBeCloseTo(10);
    expect(costOf({ inputTokens: 500_000, outputTokens: 100_000 }, rates)).toBeCloseTo(1.625);
  });

  it("falls back to defaults when the configured rate is unusable", () => {
    expect(usageRates({ inputPerMTok: "abc", outputPerMTok: "-3" })).toEqual({
      input: 1.25,
      output: 10,
    });
    expect(usageRates({ inputPerMTok: "2", outputPerMTok: "0" })).toEqual({ input: 2, output: 0 });
  });
});

describe("accumulating usage", () => {
  const now = new Date("2026-08-07T12:00:00.000Z");

  it("adds a call to the running total", () => {
    const next = addUsage(EMPTY_USAGE, { inputTokens: 1000, outputTokens: 500 }, now, rates);
    expect(next.calls).toBe(1);
    expect(next.inputTokens).toBe(1000);
    expect(next.cost).toBeCloseTo(0.00625);
    expect(next.updatedAt).toBe(now.toISOString());
  });

  it("ignores a call the gateway reported no usage for", () => {
    // Inventing a number here would make the meter disagree with the real bill.
    expect(addUsage(EMPTY_USAGE, null, now, rates)).toBe(EMPTY_USAGE);
    expect(addUsage(EMPTY_USAGE, { inputTokens: 0, outputTokens: 0 }, now, rates)).toBe(
      EMPTY_USAGE,
    );
  });

  it("keeps already-accrued cost when the rate later changes", () => {
    const first = addUsage(EMPTY_USAGE, { inputTokens: 1_000_000, outputTokens: 0 }, now, rates);
    const second = addUsage(first, { inputTokens: 1_000_000, outputTokens: 0 }, now, {
      input: 100,
      output: 0,
    });
    // 1.25 accrued at the old rate plus 100 at the new one, not 200.
    expect(second.cost).toBeCloseTo(101.25);
  });

  it("sums the attempts made to serve one request", () => {
    // A repeated-question retry is billed twice, so the meter must report the total.
    expect(
      mergeUsage({ inputTokens: 10, outputTokens: 5 }, { inputTokens: 3, outputTokens: 2 }),
    ).toEqual({ inputTokens: 13, outputTokens: 7 });
    expect(mergeUsage(null, { inputTokens: 3, outputTokens: 2 })).toEqual({
      inputTokens: 3,
      outputTokens: 2,
    });
    expect(mergeUsage(null, null)).toBeNull();
  });
});

describe("reading stored totals", () => {
  it("survives absent or corrupted storage", () => {
    expect(readUsage(null)).toEqual(EMPTY_USAGE);
    expect(readUsage("not json")).toEqual(EMPTY_USAGE);
    expect(readUsage(JSON.stringify({ version: 2 }))).toEqual(EMPTY_USAGE);
  });

  it("round-trips a real total", () => {
    const stored = addUsage(EMPTY_USAGE, { inputTokens: 2000, outputTokens: 100 });
    expect(readUsage(JSON.stringify(stored))).toEqual(stored);
  });
});

describe("formatting", () => {
  it("keeps a sub-cent total visibly non-zero", () => {
    // "$0.00" reads as a broken meter rather than as cheap usage.
    expect(formatCost(0.0031)).toBe("$0.0031");
    expect(formatCost(1.239)).toBe("$1.24");
    expect(formatCost(0)).toBe("$0.00");
  });
});

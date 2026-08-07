import { describe, expect, it } from "vitest";
import {
  addMemory,
  buildMemoryContext,
  captureFromMessage,
  captureMemory,
  enforceMemoryLimit,
  forgetMemory,
  MANUAL_IMPORTANCE,
  MAX_MEMORIES,
  readMemories,
  searchMemories,
  segment,
  similarity,
  type LearnerMemoryEntry,
} from "./learner-memory";

const at = (iso: string) => new Date(iso);
const day = (n: number) => at(`2026-08-${String(n).padStart(2, "0")}T00:00:00.000Z`);

function entry(overrides: Partial<LearnerMemoryEntry> & { content: string }): LearnerMemoryEntry {
  return {
    version: 1,
    id: overrides.content,
    category: "other",
    importance: 0.6,
    source: "auto",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    accessCount: 0,
    ...overrides,
  };
}

describe("capture rules", () => {
  it("categorises self-reported difficulty above generic self-description", () => {
    // "I'm bad at X" also matches the generic /\bi'm\b/ fact rule; order decides.
    expect(captureFromMessage("I'm bad at discounted cash flow")).toMatchObject({
      category: "struggle",
    });
    expect(captureFromMessage("我一直搞不清边际成本和沉没成本")).toMatchObject({
      category: "struggle",
    });
  });

  it("captures preferences, goals, and facts in either language", () => {
    expect(captureFromMessage("以后别再考纯定义题了")).toMatchObject({ category: "preference" });
    expect(captureFromMessage("From now on, give me applied questions")).toMatchObject({
      category: "preference",
    });
    expect(captureFromMessage("我下周要考期末")).toMatchObject({ category: "goal" });
    expect(captureFromMessage("I have a midterm on Friday")).toMatchObject({ category: "goal" });
    expect(captureFromMessage("我主修市场营销")).toMatchObject({ category: "fact" });
  });

  it("matches the inflected verbs students actually type", () => {
    // "keep forgetting", not "keep forget".
    expect(captureFromMessage("I keep forgetting the formula")).toMatchObject({
      category: "struggle",
    });
    expect(captureFromMessage("I often confuse these two")).toMatchObject({
      category: "struggle",
    });
  });

  it("reads a contracted exam plan as a goal rather than a bare fact", () => {
    // "I'm taking" has no space after "i", so it needs its own rule or it falls through
    // to the generic /\bi'm\b/ fact pattern.
    expect(captureFromMessage("I'm taking the final next week")).toMatchObject({
      category: "goal",
    });
    expect(captureFromMessage("I have a midterm on Friday")).toMatchObject({ category: "goal" });
  });

  it("ignores ordinary tutor questions", () => {
    expect(captureFromMessage("Why is the answer b?")).toBeNull();
    expect(captureFromMessage("这道题为什么选 b")).toBeNull();
    expect(captureFromMessage("能再解释一遍吗")).toBeNull();
  });

  it("ignores messages outside the length gate", () => {
    expect(captureFromMessage("记住")).toBeNull();
    expect(captureFromMessage(`I prefer ${"a".repeat(600)}`)).toBeNull();
  });
});

describe("similarity dedupe", () => {
  it("merges a restated memory instead of storing it twice", () => {
    const first = captureMemory([], "我一直搞不清边际成本和沉没成本", day(1));
    const restated = captureMemory(first, "我一直搞不清边际成本和沉没成本。", day(3));

    expect(restated).toHaveLength(1);
    // The original wording survives; only its freshness changes.
    expect(restated[0].content).toBe("我一直搞不清边际成本和沉没成本");
    expect(restated[0].accessCount).toBe(1);
    expect(restated[0].updatedAt).toBe(day(3).toISOString());
  });

  it("keeps genuinely different memories apart", () => {
    const memories = captureMemory(
      captureMemory([], "I always mix up marginal cost and sunk cost", day(1)),
      "I always mix up elasticity and inelasticity",
      day(1),
    );
    expect(memories).toHaveLength(2);
  });

  it("lets a manual save promote a rule-captured memory", () => {
    const captured = captureMemory([], "I always mix up marginal and sunk cost", day(1));
    const promoted = addMemory(
      captured,
      { content: "I always mix up marginal and sunk cost", source: "manual" },
      day(2),
    );

    expect(promoted).toHaveLength(1);
    expect(promoted[0]).toMatchObject({ source: "manual", importance: MANUAL_IMPORTANCE });
  });

  it("scores unrelated and near-identical strings apart", () => {
    expect(similarity("marginal cost", "marginal cost")).toBe(1);
    expect(similarity("marginal cost", "sunk cost")).toBeLessThan(0.9);
    expect(similarity("", "")).toBe(1);
  });
});

describe("retrieval", () => {
  const book = [
    entry({
      id: "a",
      content: "我一直搞不清边际成本和沉没成本",
      category: "struggle",
      updatedAt: "2026-08-05T00:00:00.000Z",
    }),
    entry({
      id: "b",
      content: "我不太懂价格弹性怎么算",
      category: "struggle",
      updatedAt: "2026-08-05T00:00:00.000Z",
    }),
    entry({
      id: "c",
      content: "以后别再考纯定义题了",
      category: "preference",
      updatedAt: "2026-08-05T00:00:00.000Z",
    }),
  ];

  it("ranks the memory sharing terms with the query first", () => {
    const results = searchMemories(book, "这道题问的是沉没成本", 5, day(6));
    expect(results[0].id).toBe("a");
  });

  it("returns nothing when no memory shares a term with the query", () => {
    expect(searchMemories(book, "photosynthesis chloroplast", 5, day(6))).toEqual([]);
  });

  it("prefers the fresher of two equally relevant memories", () => {
    const stale = entry({
      id: "stale",
      content: "我不太懂价格弹性怎么算",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const fresh = entry({
      id: "fresh",
      content: "我不太懂价格弹性怎么算",
      updatedAt: "2026-08-05T00:00:00.000Z",
    });
    const results = searchMemories([stale, fresh], "价格弹性", 5, day(6));
    expect(results[0].id).toBe("fresh");
  });

  it("segments Han text into words rather than one blob", () => {
    expect(segment("边际成本")).toContain("边际");
    expect(segment("marginal cost")).toEqual(["marginal", "cost"]);
  });
});

describe("prompt context", () => {
  const book = [
    entry({
      id: "a",
      content: "我一直搞不清边际成本和沉没成本",
      category: "struggle",
      updatedAt: "2026-08-05T00:00:00.000Z",
    }),
  ];

  it("labels the block as context, not as material fact", () => {
    const context = buildMemoryContext(book, "沉没成本", { now: day(6) });
    expect(context).toContain("reported difficulty");
    expect(context).toContain("我一直搞不清边际成本和沉没成本");
    expect(context).toContain("never a source of facts");
  });

  it("returns an empty string when nothing is relevant, so callers can omit the field", () => {
    expect(buildMemoryContext(book, "photosynthesis", { now: day(6) })).toBe("");
    expect(buildMemoryContext([], "沉没成本", { now: day(6) })).toBe("");
  });

  it("stops at the character budget instead of crowding out the route prompt", () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      entry({
        id: `m${index}`,
        content: `我不太懂第${index}章的价格弹性推导过程为什么要那样写`,
        category: "struggle",
        updatedAt: "2026-08-05T00:00:00.000Z",
      }),
    );
    const context = buildMemoryContext(many, "价格弹性", { limit: 10, budget: 80, now: day(6) });
    expect(context.split("\n").length - 1).toBeLessThan(10);
    expect(context.length).toBeLessThan(300);
  });
});

describe("capacity and persistence", () => {
  it("drops the least recently touched memory past the cap", () => {
    const base = Date.parse("2026-08-05T00:00:00.000Z");
    const full = Array.from({ length: MAX_MEMORIES }, (_, index) =>
      entry({
        id: `m${index}`,
        content: `memory ${index}`,
        // Ascending, so m0 is unambiguously the least recently touched.
        updatedAt: new Date(base + index * 1_000).toISOString(),
      }),
    );
    const arrival = entry({
      id: "new",
      content: "newest",
      updatedAt: new Date(base + MAX_MEMORIES * 1_000).toISOString(),
    });
    const trimmed = enforceMemoryLimit([arrival, ...full]);

    expect(trimmed).toHaveLength(MAX_MEMORIES);
    expect(trimmed.some((item) => item.id === "new")).toBe(true);
    expect(trimmed.some((item) => item.id === "m0")).toBe(false);
  });

  it("round-trips through storage and skips unreadable records", () => {
    const saved = captureMemory([], "我一直搞不清边际成本和沉没成本", day(1));
    const stored = JSON.stringify([...saved, { version: 2, junk: true }, null]);

    expect(readMemories(stored)).toHaveLength(1);
    expect(readMemories("not json")).toEqual([]);
    expect(readMemories(null)).toEqual([]);
  });

  it("forgets a single memory by id", () => {
    const saved = captureMemory([], "我一直搞不清边际成本和沉没成本", day(1));
    expect(forgetMemory(saved, saved[0].id)).toEqual([]);
  });

  it("leaves the book untouched when a message matches no rule", () => {
    const saved = captureMemory([], "我一直搞不清边际成本和沉没成本", day(1));
    // Same reference, so the caller can skip the storage write and the re-render.
    expect(captureMemory(saved, "这道题为什么选 b", day(2))).toBe(saved);
  });
});

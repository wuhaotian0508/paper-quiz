import { z } from "zod";

/**
 * Rule-based long-term memory for a learner, modelled on EvoMaster's memory module
 * (`evomaster/memory` on its `dev/0.1.0` branch): regex capture, similarity dedupe,
 * tokenised keyword retrieval with time decay, and a hard per-user cap.
 *
 * Nothing here calls a model. Memories come from what the student says out loud in
 * tutor chat, never from what grading inferred about them: a wrong answer has too many
 * causes (misread prompt, bad question, mis-grade) to be recorded as a durable trait,
 * and a self-report is something the student already chose to tell us.
 */

/**
 * EvoMaster's chat-agent categories were preference/fact/decision/entity/other. `struggle`
 * and `goal` replace decision/entity because a study tutor needs to know what the learner
 * finds hard and what they are working towards, not which entities they named.
 */
export type MemoryCategory = "preference" | "struggle" | "fact" | "goal" | "other";
export type MemorySource = "auto" | "manual";

export type LearnerMemoryEntry = {
  version: 1;
  id: string;
  content: string;
  category: MemoryCategory;
  /** Ranking weight only. Manual saves outrank rule captures on an equal keyword match. */
  importance: number;
  source: MemorySource;
  createdAt: string;
  updatedAt: string;
  /** Incremented every time a near-duplicate is captured again, so repetition ages an entry back up. */
  accessCount: number;
};

/** A memory plus its score for one query. Never persisted. */
export type ScoredMemory = LearnerMemoryEntry & { score: number };

/** Too short to carry a fact; too long to be a statement about oneself. */
export const MIN_CAPTURE_CHARS = 6;
export const MAX_CAPTURE_CHARS = 500;
export const AUTO_IMPORTANCE = 0.6;
export const MANUAL_IMPORTANCE = 0.8;
/** Above this, a new capture updates the existing entry instead of adding a second one. */
export const DEDUPE_SIMILARITY = 0.9;
/**
 * Lower than EvoMaster's 500 because the whole book shares one localStorage quota with
 * 30 sessions and their transcripts, and because retrieval here scans the array.
 */
export const MAX_MEMORIES = 200;
/** Halves an entry's ranking weight after roughly 100 days untouched. */
export const DECAY_PER_DAY = 0.01;
export const LEARNER_MEMORY_KEY = "paper-plane-quiz-memory-v1";

/**
 * Ordered: the first pattern to match decides the category, so specific self-reports are
 * listed before the generic "I am / 我是" facts they would otherwise be swallowed by.
 *
 * Both language tables always run, regardless of UI locale — students switch languages
 * mid-conversation, and a Chinese-locale learner still types English terminology.
 */
const CAPTURE_PATTERNS: readonly (readonly [RegExp, MemoryCategory])[] = [
  // Explicit instructions to remember
  [/记住[：:\s]/, "fact"],
  [/(请|帮我)记住/, "fact"],
  [/\bremember\b/i, "fact"],

  // Self-reported difficulty
  [/我(一直|老是|总是|经常|容易)(搞不清|分不清|记不住|弄混|混淆|做错|错)/, "struggle"],
  [/我(不太懂|不懂|不会|没学过|不擅长|最怕|搞不懂|理解不了|跟不上)/, "struggle"],
  // Stems, not whole words: students write "keep forgetting" and "always mixing up" far
  // more often than the bare infinitive these patterns first looked for.
  [/\bi (always|keep|often|usually) (mix|confus|forget|misread|get .{0,20}wrong)/i, "struggle"],
  [/\bi (don't|do not|never|can't|cannot) (understand|get|follow)\b/i, "struggle"],
  [/\bi'?m (bad|weak|not good|terrible) at\b|\bi struggle with\b/i, "struggle"],

  // Preferences about how to be taught
  [/我(喜欢|偏好|习惯|倾向于|更喜欢|不喜欢|讨厌)/, "preference"],
  [/(以后|每次|下次|将来)(都|总是|一直|请|帮我|别|不要)/, "preference"],
  [/(别|不要)(再|总是|每次)/, "preference"],
  [/\bi (prefer|like|love|hate|always|never|usually|don'?t like)\b/i, "preference"],
  [/\b(from now on|next time|in future|going forward)\b/i, "preference"],
  [/\b(stop|don'?t|do not) (asking|giving|testing|quizzing)\b/i, "preference"],

  // What they are working towards
  [/我(要|准备|打算|下周|明天|马上).{0,12}(考试|期末|期中|测验|面试|答辩)/, "goal"],
  [/我(决定|选择|确定|打算)/, "goal"],
  [/\bi (have|'?ve got) (a|an|my|the)?\s?(exam|midterm|final|test|quiz)\b/i, "goal"],
  // Split from the line above so the contraction is reachable: `\bi ` needs a space after
  // "i", which "I'm taking my final" never has, and it was falling through to the fact rule.
  [
    /\bi('?m| am| will be)? ?(taking|sitting|writing) (a|an|my|the)?\s?(exam|midterm|final|test|quiz)\b/i,
    "goal",
  ],
  [/\bi (decided|chose|plan to|want to|need to)\b/i, "goal"],

  // Generic facts about the learner — last, so the above win
  [/我的.{1,15}(是|叫|为|用的是)/, "fact"],
  [/我(是|叫|在|住在|来自|学的是|专业是|主修)/, "fact"],
  [/\bmy .{1,30} is\b/i, "fact"],
  [/\bi('?m| am| work| live| study| major)\b/i, "fact"],
];

/**
 * Built once and reused: constructing a CJK segmenter loads an ICU dictionary, and one
 * search segments every memory in the book.
 */
let segmenter: Intl.Segmenter | null | undefined;
function getSegmenter() {
  if (segmenter === undefined) {
    segmenter =
      typeof Intl !== "undefined" && "Segmenter" in Intl
        ? new Intl.Segmenter("zh", { granularity: "word" })
        : null;
  }
  return segmenter;
}

/**
 * Word-splits text for keyword matching. Always segments with the `zh` locale, whatever
 * the UI language: ICU only applies dictionary-based Han word breaking under a CJK locale,
 * and it still splits Latin text on whitespace, so one segmenter serves both.
 */
export function segment(text: string): string[] {
  const normalized = text.toLowerCase();
  const active = getSegmenter();
  if (active) {
    return [...active.segment(normalized)]
      .filter((piece) => piece.isWordLike)
      .map((piece) => piece.segment);
  }
  // Environments without Intl.Segmenter fall back to one token per Han character.
  return normalized.match(/\p{Script=Han}|[\p{L}\p{N}]+/gu) ?? [];
}

function bigrams(value: string): string[] {
  const characters = [...value.toLowerCase().replaceAll(/\s+/g, "")];
  if (characters.length < 2) return characters;
  return characters.slice(0, -1).map((character, index) => character + characters[index + 1]);
}

/**
 * Character-bigram Dice coefficient in 0..1. EvoMaster used Python's `difflib`
 * SequenceMatcher, which has no JS equivalent; Dice is order-insensitive and behaves the
 * same way on Han text as on Latin, which matters here more than matching difflib exactly.
 */
export function similarity(left: string, right: string): number {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.length || !b.length) return left.toLowerCase() === right.toLowerCase() ? 1 : 0;
  const remaining = new Map<string, number>();
  for (const gram of a) remaining.set(gram, (remaining.get(gram) ?? 0) + 1);
  let shared = 0;
  for (const gram of b) {
    const count = remaining.get(gram) ?? 0;
    if (count > 0) {
      shared += 1;
      remaining.set(gram, count - 1);
    }
  }
  return (2 * shared) / (a.length + b.length);
}

/** Stable across reloads and identical for identical text, so exact repeats collapse. */
function memoryId(content: string): string {
  let hash = 2166136261;
  for (const character of content.toLowerCase().trim()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Decides whether one student message is worth remembering. Returns the whole message
 * rather than an extracted clause: the surrounding wording is what makes the memory
 * readable later, and trimming it would need a model.
 */
export function captureFromMessage(
  message: string,
): { content: string; category: MemoryCategory } | null {
  const content = message.trim();
  if (content.length < MIN_CAPTURE_CHARS || content.length > MAX_CAPTURE_CHARS) return null;
  for (const [pattern, category] of CAPTURE_PATTERNS) {
    if (pattern.test(content)) return { content, category };
  }
  return null;
}

function compareNewestFirst(a: LearnerMemoryEntry, b: LearnerMemoryEntry) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** Drops the least recently touched entries once the cap is exceeded. */
export function enforceMemoryLimit(
  entries: readonly LearnerMemoryEntry[],
  max = MAX_MEMORIES,
): LearnerMemoryEntry[] {
  return entries.length <= max ? [...entries] : [...entries].sort(compareNewestFirst).slice(0, max);
}

/**
 * Adds a memory, merging into a near-duplicate when one exists. Merging keeps the older
 * wording and only refreshes its timestamp, so a student repeating themselves makes the
 * memory *fresher* instead of making a second copy that competes with the first.
 *
 * Every existing entry is compared, unlike EvoMaster's compare-against-top-search-hit:
 * the book is small enough to scan, and a full scan cannot miss a duplicate the keyword
 * search happened to rank low.
 */
export function addMemory(
  entries: readonly LearnerMemoryEntry[],
  input: {
    content: string;
    category?: MemoryCategory;
    source?: MemorySource;
    importance?: number;
  },
  now: Date = new Date(),
): LearnerMemoryEntry[] {
  const content = input.content.trim();
  if (!content) return [...entries];
  const timestamp = now.toISOString();
  const source = input.source ?? "auto";

  let closest: LearnerMemoryEntry | null = null;
  let closestScore = 0;
  for (const entry of entries) {
    const score = similarity(content, entry.content);
    if (score > closestScore) {
      closest = entry;
      closestScore = score;
    }
  }
  if (closest && closestScore >= DEDUPE_SIMILARITY) {
    const merged: LearnerMemoryEntry = {
      ...closest,
      updatedAt: timestamp,
      accessCount: closest.accessCount + 1,
      // A manual re-save promotes an entry the rules had only guessed at.
      importance: Math.max(closest.importance, input.importance ?? weightFor(source)),
      source: source === "manual" ? "manual" : closest.source,
    };
    return [merged, ...entries.filter((entry) => entry.id !== closest.id)];
  }

  const entry: LearnerMemoryEntry = {
    version: 1,
    id: memoryId(content),
    content,
    category: input.category ?? "other",
    importance: input.importance ?? weightFor(source),
    source,
    createdAt: timestamp,
    updatedAt: timestamp,
    accessCount: 0,
  };
  return enforceMemoryLimit([entry, ...entries.filter((existing) => existing.id !== entry.id)]);
}

function weightFor(source: MemorySource) {
  return source === "manual" ? MANUAL_IMPORTANCE : AUTO_IMPORTANCE;
}

/**
 * Captures a tutor-chat message if the rules match it. Returns the *same array reference*
 * when nothing matched, so callers can skip a storage write and a re-render on the common
 * case — most tutor messages are ordinary questions and capture nothing.
 */
export function captureMemory(
  entries: LearnerMemoryEntry[],
  message: string,
  now: Date = new Date(),
): LearnerMemoryEntry[] {
  const captured = captureFromMessage(message);
  return captured ? addMemory(entries, { ...captured, source: "auto" }, now) : entries;
}

export function forgetMemory(
  entries: readonly LearnerMemoryEntry[],
  id: string,
): LearnerMemoryEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * BM25 over the learner's own memories, scaled by importance and by how recently the
 * memory was touched. Retrieval is keyword-based on purpose: it costs nothing, runs
 * offline, and stays deterministic enough to test, which an embedding search would not.
 */
export function searchMemories(
  entries: readonly LearnerMemoryEntry[],
  query: string,
  limit = 5,
  now: Date = new Date(),
): ScoredMemory[] {
  if (!entries.length) return [];
  const queryTokens = new Set(segment(query));
  if (!queryTokens.size) return [];

  const documents = entries.map((entry) => segment(entry.content));
  const averageLength =
    documents.reduce((total, tokens) => total + tokens.length, 0) / documents.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const tokens of documents) {
    for (const token of new Set(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const scored = entries.map((entry, position) => {
    const tokens = documents[position];
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

    let relevance = 0;
    for (const token of queryTokens) {
      const frequency = counts.get(token) ?? 0;
      if (!frequency) continue;
      const matched = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (entries.length - matched + 0.5) / (matched + 0.5));
      const denominator =
        frequency + BM25_K1 * (1 - BM25_B + (BM25_B * tokens.length) / averageLength);
      relevance += idf * ((frequency * (BM25_K1 + 1)) / denominator);
    }

    const days = Math.max(0, (now.getTime() - Date.parse(entry.updatedAt)) / 86_400_000);
    const decay = 1 / (1 + days * DECAY_PER_DAY);
    return { ...entry, score: relevance * decay * entry.importance };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || compareNewestFirst(a, b))
    .slice(0, limit);
}

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: "preference",
  struggle: "reported difficulty",
  fact: "fact",
  goal: "goal",
  other: "note",
};

/**
 * Renders the memories relevant to `query` as a prompt block, or "" when nothing matches
 * so callers can drop the field entirely. Bounded twice — top-k and a character budget —
 * because this text competes for attention with the hard output constraints in the route
 * prompts, and a memory must never be the reason a question loses its JSON shape.
 */
export function buildMemoryContext(
  entries: readonly LearnerMemoryEntry[],
  query: string,
  options: { limit?: number; budget?: number; now?: Date } = {},
): string {
  const { limit = 5, budget = 600, now = new Date() } = options;
  const lines: string[] = [];
  let used = 0;
  for (const entry of searchMemories(entries, query, limit, now)) {
    const line = `- [${CATEGORY_LABELS[entry.category]}] ${entry.content}`;
    if (used + line.length > budget) break;
    lines.push(line);
    used += line.length;
  }
  if (!lines.length) return "";
  return [
    "LEARNER MEMORY (things this student has said about themselves; context only, never a source of facts about the study material):",
    ...lines,
  ].join("\n");
}

const MemorySchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  content: z.string().min(1).max(MAX_CAPTURE_CHARS),
  category: z.enum(["preference", "struggle", "fact", "goal", "other"]).default("other"),
  importance: z.number().min(0).max(1).default(AUTO_IMPORTANCE),
  source: z.enum(["auto", "manual"]).default("auto"),
  createdAt: z.string(),
  updatedAt: z.string(),
  accessCount: z.number().int().min(0).default(0),
});

/** Drops unreadable entries rather than throwing, so one bad record cannot empty the book. */
export function readMemories(value: string | null): LearnerMemoryEntry[] {
  try {
    const data: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(data)) return [];
    return data
      .flatMap((item) => {
        const parsed = MemorySchema.safeParse(item);
        return parsed.success ? [parsed.data as LearnerMemoryEntry] : [];
      })
      .sort(compareNewestFirst);
  } catch {
    return [];
  }
}

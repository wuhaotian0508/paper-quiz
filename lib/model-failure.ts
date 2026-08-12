/**
 * A provider refuses an oversized study set with a precise sentence — "input tokens exceed
 * the model's context length", "file exceeds the maximum of 100 pages" — and every route
 * collapses anything it does not recognise into one generic apology so provider internals
 * never reach a response body. That is the right default, but it left the learner who
 * uploaded a 300-page textbook holding "Please try again later": advice that cannot work
 * however many times it is followed, because nothing about the next attempt would differ.
 *
 * These rules recognise only the failures a learner can actually do something about, and
 * answer with the action rather than the diagnosis. Anything unrecognised keeps the generic
 * sentence, so a new provider message cannot leak by default — it just stays quiet, exactly
 * as it does today, while the caller logs the full text.
 */

const TOO_MUCH_MATERIAL =
  "This study material is too large to handle in one go. Select fewer PDFs, or one chapter at a time, and try again.";

const TOO_MANY_PAGES =
  "One of these PDFs has more pages than can be read in one go. Split it, or select a single chapter, and try again.";

const FILE_TOO_LARGE =
  "This PDF is too large to send in one go. Split it into smaller files and try again.";

const PROVIDER_BUSY = "The service is busy right now. Wait a moment and try again.";

/**
 * Matched against the provider's text rather than a status code: the same refusal arrives as
 * `context_length_exceeded`, as a 400 with prose, or as a gateway's own paraphrase, and only
 * the wording is reliably present across all three.
 *
 * Every separator is `[_ ]` because those same three shapes disagree on it — a machine code
 * says `file_too_large` where the prose says "file is too large" — and a pattern written for
 * one spelling silently stops recognising the other.
 */
const RULES: { pattern: RegExp; message: string }[] = [
  {
    pattern: /too many pages|maximum of \d+ pages|page[_ ](?:count|limit)/i,
    message: TOO_MANY_PAGES,
  },
  {
    pattern:
      /context[_ ](?:length|window)|maximum context|too many tokens|(?:input|prompt).{0,24}too[_ ](?:long|large)/i,
    message: TOO_MUCH_MATERIAL,
  },
  {
    pattern:
      /file.{0,16}too[_ ]large|maximum file size|(?:payload|request[_ ]entity)[_ ]too[_ ]large|\b413\b/i,
    message: FILE_TOO_LARGE,
  },
  {
    pattern: /rate[_ ]limit|too many requests|\b429\b|overloaded|capacity/i,
    message: PROVIDER_BUSY,
  },
];

/**
 * The provider's own words, dug out of whichever shape arrived: a bare string from a streamed
 * `response.failed`, an SDK error, or an error wrapping the provider's body one level down.
 * Not recursive on purpose — one level covers every shape seen, and a cyclic `cause` chain
 * should not be able to hang a request that is already failing.
 */
export function readFailureText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const source = value as { message?: unknown; code?: unknown; error?: unknown };
  const nested =
    source.error && typeof source.error === "object"
      ? (source.error as { message?: unknown; code?: unknown })
      : null;
  return [source.code, source.message, nested?.code, nested?.message]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(": ");
}

/**
 * The sentence to show the learner, or null when the failure names nothing they can act on
 * and the caller's generic message should stand.
 */
export function describeModelFailure(value: unknown): string | null {
  const text = readFailureText(value);
  if (!text) return null;
  return RULES.find((rule) => rule.pattern.test(text))?.message ?? null;
}

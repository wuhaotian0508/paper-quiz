/**
 * Subjects group uploaded PDFs into courses.
 *
 * The subject is guessed from the file name and then owned by the student: an inferred
 * value is only ever a default for a material that has none. No model call is involved —
 * course codes are regular enough that a regex plus a stop list beats a prompt on both
 * accuracy and latency, and it keeps working offline.
 */

/** Materials whose subject has not been set and could not be guessed. */
export const UNASSIGNED_SUBJECT = "";

export const MAX_SUBJECT_CHARS = 40;

/**
 * `UGBA 117`, `CS61A`, `econ_101` — two to six letters then one to three digits with an
 * optional trailing letter.
 *
 * Uses explicit separators rather than `\b`, because `_` is a regex word character: on
 * `econ_101` a word boundary exists at neither end of the code, so `\b` never matched the
 * underscore-separated names that exports and downloads produce constantly.
 */
const COURSE_CODE = /(?:^|[^A-Za-z0-9])([A-Za-z]{2,6})[\s_-]?(\d{1,3}[A-Za-z]?)(?![A-Za-z0-9])/g;

/**
 * Words that look exactly like a course code once a number follows them. Without this,
 * `Week 3 Notes.pdf` files all land in a subject called "WEEK 3".
 */
const NOT_A_COURSE = new Set([
  "week",
  "ch",
  "chap",
  "chapter",
  "part",
  "day",
  "lec",
  "lect",
  "lecture",
  "set",
  "hw",
  "ps",
  "pset",
  "page",
  "pg",
  "vol",
  "no",
  "num",
  "v",
  "ver",
  "fig",
  "sec",
  "section",
  "unit",
  "test",
  "quiz",
  "exam",
  "final",
  "midterm",
  "note",
  "notes",
  "slide",
  "slides",
  "draft",
  "copy",
  "rev",
  "q",
  "a",
]);

/** `ugba117` and `UGBA 117` are the same course, so both normalise to `UGBA 117`. */
export function normaliseSubject(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_SUBJECT_CHARS);
}

/**
 * Guesses a course code from a file name, or returns `UNASSIGNED_SUBJECT` when nothing in
 * it looks like one. Chinese course names have no comparable pattern, so those materials
 * stay unassigned until the student names the subject — which is better than inventing one.
 */
export function inferSubject(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[a-z0-9]{1,5}$/i, "");
  for (const match of withoutExtension.matchAll(COURSE_CODE)) {
    const [, letters, number] = match;
    if (NOT_A_COURSE.has(letters.toLowerCase())) continue;
    return `${letters.toUpperCase()} ${number.toUpperCase()}`;
  }
  return UNASSIGNED_SUBJECT;
}

/**
 * Orders subjects for display: named subjects alphabetically, unassigned always last so a
 * pile of un-categorised uploads never sits above the courses the student curated.
 */
export function compareSubjects(left: string, right: string): number {
  if (left === right) return 0;
  if (left === UNASSIGNED_SUBJECT) return 1;
  if (right === UNASSIGNED_SUBJECT) return -1;
  return left.localeCompare(right);
}

/**
 * Buckets anything carrying a subject into `{ subject, items }` groups, ordered by
 * `compareSubjects`. Used by the library, the calendar and the daily papers so all three
 * agree on what a subject contains and in what order subjects appear.
 */
export function groupBySubject<T>(
  items: readonly T[],
  subjectOf: (item: T) => string,
): { subject: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const subject = normaliseSubject(subjectOf(item));
    groups.set(subject, [...(groups.get(subject) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([subject, grouped]) => ({ subject, items: grouped }))
    .sort((left, right) => compareSubjects(left.subject, right.subject));
}

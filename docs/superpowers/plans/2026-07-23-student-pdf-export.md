# Student PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export compact, colorful student and answer-key PDFs from Paper Quiz while preserving existing review, mistake-book, and progress exports.

**Architecture:** Keep `jspdf` client-side and replace the single text writer with small layout primitives in `lib/pdf-export.ts`. A `QuizExportMode` union makes answer visibility explicit; React controls pass that mode from clearly labelled buttons. Each export starts a styled page, measures wrapped content before drawing, and repeats a narrow footer after page breaks.

**Tech Stack:** Next.js, React 19, TypeScript, Vitest, Testing Library, jsPDF, Poppler for rendered-PDF inspection.

---

### Task 1: Establish the export-mode contract

**Files:**
- Modify: `lib/pdf-export.ts`
- Create: `lib/pdf-export.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { getQuizExportFileName, type QuizExportMode } from "@/lib/pdf-export";

describe("getQuizExportFileName", () => {
  it.each<[QuizExportMode, string]>([
    ["student", "paper-quiz-student-copy.pdf"],
    ["answer_key", "paper-quiz-answer-key.pdf"],
  ])("names the %s export", (mode, expected) => {
    expect(getQuizExportFileName(mode)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/pdf-export.test.ts`

Expected: FAIL because `getQuizExportFileName` and `QuizExportMode` are not exported.

- [ ] **Step 3: Write the minimal implementation**

```ts
export type QuizExportMode = "student" | "answer_key";

export function getQuizExportFileName(mode: QuizExportMode) {
  return mode === "student" ? "paper-quiz-student-copy.pdf" : "paper-quiz-answer-key.pdf";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/pdf-export.test.ts`

Expected: PASS with 2 passing cases.

### Task 2: Build compact Paper Quiz page primitives

**Files:**
- Modify: `lib/pdf-export.ts`
- Modify: `lib/pdf-export.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("creates student blocks without answer-key-only content", () => {
  const blocks = getQuizPdfBlocks(sampleQuiz, "student");
  expect(blocks.join("\n")).toContain("PAPER QUIZ AI / STUDENT COPY");
  expect(blocks.join("\n")).not.toContain("ANSWER + EXPLANATION");
  expect(blocks.join("\n")).not.toContain("The model memorizes noise");
});

it("adds answers and explanations only to answer-key blocks", () => {
  const blocks = getQuizPdfBlocks(sampleQuiz, "answer_key");
  expect(blocks.join("\n")).toContain("PAPER QUIZ AI / ANSWER KEY");
  expect(blocks.join("\n")).toContain("ANSWER + EXPLANATION");
  expect(blocks.join("\n")).toContain("The model memorizes noise");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/pdf-export.test.ts`

Expected: FAIL because `getQuizPdfBlocks` does not exist.

- [ ] **Step 3: Implement layout helpers and document creation**

```ts
export function createQuizPdf(quiz: Quiz, mode: QuizExportMode) {
  const pdf = new jsPDF({ format: "a4", unit: "mm" });
  const writer = createPageWriter(pdf, quiz.title, mode === "student" ? "STUDENT COPY" : "ANSWER KEY");
  quiz.questions.forEach((question, index) => drawQuizQuestion(writer, question, index + 1, mode));
  writer.finish();
  return pdf;
}

export function getQuizPdfBlocks(quiz: Quiz, mode: QuizExportMode): string[] {
  return [
    `PAPER QUIZ AI / ${mode === "student" ? "STUDENT COPY" : "ANSWER KEY"}`,
    ...quiz.questions.flatMap((question) => mode === "student" ? [question.prompt] : [question.prompt, "ANSWER + EXPLANATION", correctAnswer(question), question.explanation]),
  ];
}
```

Implement `createPageWriter`, `drawQuizQuestion`, `drawMultipleChoiceOptions`, `drawWrittenAnswerLines`, and `drawAnswerKeyPanel` in `lib/pdf-export.ts`. Use 12 mm horizontal margins, a 15 mm header, and a 10 mm footer; use coral, blue, mint, and yellow fill colors; measure all wrapped text before drawing; start a new page before a question block that exceeds the remaining height.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/pdf-export.test.ts`

Expected: PASS; the student block model excludes answer-key-only content and the answer-key block model includes it.

### Task 3: Expose clear export choices in the quiz UI

**Files:**
- Modify: `components/quiz-workspace.tsx`
- Modify: `components/quiz-workspace.test.tsx`

- [ ] **Step 1: Write the failing UI test**

```tsx
it("labels both student and answer-key exports when a quiz is active", async () => {
  render(<QuizWorkspace />);
  // Drive an existing generated-quiz fixture into the quiz view.
  expect(await screen.findByRole("button", { name: "Student copy (no answers)" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Answer key (with answers)" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- components/quiz-workspace.test.tsx`

Expected: FAIL because the buttons are currently named `Export paper PDF` and `Export answers PDF`.

- [ ] **Step 3: Implement explicit controls**

```tsx
<button className="text-button" onClick={() => downloadQuizPdf(quiz, "student")}>Student copy (no answers)</button>
<button className="text-button" onClick={() => downloadQuizPdf(quiz, "answer_key")}>Answer key (with answers)</button>
```

Use those controls in the active-quiz toolbar and result screen. Change `downloadQuizPdf` to accept `QuizExportMode` and save the filename returned by `getQuizExportFileName`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- components/quiz-workspace.test.tsx`

Expected: PASS and the existing upload/transcription tests remain green.

### Task 4: Apply the template to saved-learning exports

**Files:**
- Modify: `lib/pdf-export.ts`
- Modify: `lib/pdf-export.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("creates a Paper Quiz header for a mistake-book export", () => {
  expect(getMistakePdfBlocks(sampleMistakes)[0]).toBe("PAPER QUIZ AI / MISTAKE BOOK");
});

it("creates a Paper Quiz header for a graded-review export", () => {
  expect(getReviewPdfBlocks(sampleSession)[0]).toBe("PAPER QUIZ AI / GRADED REVIEW");
});
```

- [ ] **Step 2: Run test to verify they fail**

Run: `npm test -- lib/pdf-export.test.ts`

Expected: FAIL because the styled export-block functions do not exist.

- [ ] **Step 3: Implement compact saved-learning documents**

```ts
export function createMistakesPdf(entries: MistakeBookEntry[]) {
  return createSavedLearningPdf(getMistakePdfBlocks(entries));
}

export function createReviewPdf(session: StudySession) {
  return createSavedLearningPdf(getReviewPdfBlocks(session));
}
```

Reuse the page header/footer and compact question renderer. Preserve existing mistake feedback, learner answer, correct answer, grade status, and source note.

- [ ] **Step 4: Run test to verify they pass**

Run: `npm test -- lib/pdf-export.test.ts`

Expected: PASS with the existing content preserved under the new headers.

### Task 5: Complete verification and production release

**Files:**
- Modify: `lib/pdf-export.ts`
- Modify: `lib/pdf-export.test.ts`
- Modify: `components/quiz-workspace.tsx`
- Modify: `components/quiz-workspace.test.tsx`

- [ ] **Step 1: Run focused tests**

Run: `npm test -- lib/pdf-export.test.ts components/quiz-workspace.test.tsx`

Expected: PASS with no focused-suite failures.

- [ ] **Step 2: Run all automated checks**

Run: `npm test; npm run typecheck; npm run lint; npm run build`

Expected: all commands exit 0.

- [ ] **Step 3: Produce visual PDF fixtures**

Run: `npx tsx scripts/create-pdf-fixtures.ts; pdftoppm -png tmp/pdfs/student-copy.pdf tmp/pdfs/student-copy; pdftoppm -png tmp/pdfs/answer-key.pdf tmp/pdfs/answer-key`

Expected: PNG pages show compact colored type bands, safe text wrapping, answer lines, answer-key panels, and numbered footers.

- [ ] **Step 4: Deploy and verify production**

Run: `npx vercel --prod --yes; vercel alias set <ready-deployment-url> paper-quiz-ai-amber.vercel.app`

Expected: the canonical URL serves the updated UI and exposes both export choices.

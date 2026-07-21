# English-Only Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an English-only PDF quiz app whose AI output is explicitly required to be English.

**Architecture:** Keep the existing client component as the owner of UI copy and accessibility labels. Keep server-originated validation and generation instructions in the API route, while response-parser errors remain in their dedicated client-response helper.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, Testing Library, OpenAI Responses SDK, Vercel.

---

## File Structure

- Modify: `components/quiz-workspace.tsx` - replace all user-facing client copy with English.
- Modify: `components/quiz-workspace.test.tsx` - assert the English upload experience.
- Modify: `app/page.tsx` - replace shared navigation and footer copy with English.
- Modify: `lib/quiz-response.ts` - translate client-visible response parsing errors.
- Modify: `lib/quiz-response.test.ts` - assert English parsing errors.
- Modify: `lib/quiz.ts` and `lib/quiz.test.ts` - translate settings-validation errors.
- Modify: `lib/quiz-output.ts` and `lib/quiz-output.test.ts` - translate fallback quiz text.
- Create: `lib/quiz-prompt.ts` and `lib/quiz-prompt.test.ts` - build and lock the English-only AI instruction.
- Modify: `app/api/generate-quiz/route.ts` - translate validation errors and require English model output.
- Modify: `app/api/generate-quiz/route.test.ts` - assert English validation output and capture the model instruction.
- Modify: `app/layout.tsx` - set English metadata and document language.

### Task 1: Lock English Client Copy With Tests

**Files:**
- Modify: `components/quiz-workspace.test.tsx`

- [ ] **Step 1: Write the failing UI test**

```tsx
expect(screen.getByRole("heading", { name: /turn a lecture into a quiz/i })).toBeInTheDocument();
expect(screen.getByLabelText("Choose a PDF file")).toBeInTheDocument();
expect(screen.getByRole("button", { name: /Generate quiz/i })).toBeDisabled();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- components/quiz-workspace.test.tsx`

Expected: FAIL because the rendered labels are currently Chinese.

- [ ] **Step 3: Replace client copy with English**

Change all visible strings in `QuizWorkspace` to English, including file
validation, the generation screen, answer feedback, results, accessible labels,
upload instructions, controls, and privacy note. Keep `file.name` unchanged.

- [ ] **Step 4: Run the component test to verify it passes**

Run: `npm test -- components/quiz-workspace.test.tsx`

Expected: PASS with one English-first upload-flow test.

### Task 2: Lock English API and Response Errors With Tests

**Files:**
- Modify: `lib/quiz-response.test.ts`
- Modify: `lib/quiz-response.ts`
- Modify: `app/api/generate-quiz/route.test.ts`
- Modify: `app/api/generate-quiz/route.ts`

- [ ] **Step 1: Write failing tests for English error copy**

```ts
await expect(readQuizResponse(response)).rejects.toThrow(
  "The server returned an HTML error page (HTTP 502). Please try again.",
);

expect(await response.json()).toMatchObject({
  error: "Please select a PDF file first.",
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- lib/quiz-response.test.ts app/api/generate-quiz/route.test.ts`

Expected: FAIL because the current messages are Chinese.

- [ ] **Step 3: Translate errors and require English output**

Use English messages for every `jsonError` branch and exception fallback.
Extract the AI instruction into `buildQuizInstructions` and require that
`title`, `summary`, `prompt`, option text, `explanation`, and `sourceNote` are
written in English.

- [ ] **Step 4: Run focused tests to verify pass**

Run: `npm test -- lib/quiz-response.test.ts app/api/generate-quiz/route.test.ts`

Expected: PASS with English error assertions.

### Task 3: Update Document Metadata

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Set English document metadata**

```tsx
export const metadata: Metadata = {
  title: "Paper Plane Quiz · PDF AI Quiz",
  description: "Turn course PDFs into concise quizzes with answers and explanations.",
};

<html lang="en">
```

- [ ] **Step 2: Run type check**

Run: `npm run typecheck`

Expected: exit code 0.

### Task 4: Verify and Publish

**Files:**
- No code changes.

- [ ] **Step 1: Run the complete local verification suite**

Run: `npm test; npm run typecheck; npm run build`

Expected: all Vitest tests pass, TypeScript exits 0, and Next.js production build succeeds.

- [ ] **Step 2: Deploy production to Vercel**

Run: `npx vercel --prod --yes`

Expected: Vercel reports a READY production deployment and updates the production alias.

- [ ] **Step 3: Verify the deployed API with a smoke PDF**

Run a multipart `POST` to `/api/generate-quiz` using `work/paper-quiz-smoke.pdf`, then assert HTTP 200, JSON content type, five questions, and English text fields.

Expected: the deployed endpoint returns an English quiz instead of a timeout or an HTML error page.

## Plan Self-Review

- Spec coverage: Tasks 1-3 cover UI, metadata, errors, and English-only prompt requirements; Task 4 covers the required deployment and live verification.
- Placeholder scan: no TODO or deferred implementation placeholders remain.
- Type consistency: the plan uses existing `QuizWorkspace`, `readQuizResponse`, `POST`, and `jsonError` boundaries without introducing new interfaces.

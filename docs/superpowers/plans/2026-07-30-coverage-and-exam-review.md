# Coverage-Controlled Quiz and Exam Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent repeated, narrow-topic quiz questions and generate source-grounded exam review sheets.

**Architecture:** Generate a strict source outline before generating a quiz, validate topic and assessment-target distribution before serving it, then provide a separate structured-output review endpoint rendered by the material-detail page.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zod, OpenAI Responses API, Vitest, jsPDF.

---

### Task 1: Add quiz topic metadata and coverage validation

**Files:**
- Modify: `lib/quiz.ts`
- Modify: `lib/quiz-prompt.ts`
- Create: `lib/quiz-coverage.ts`
- Test: `lib/quiz.test.ts`, `lib/quiz-prompt.test.ts`, `lib/quiz-coverage.test.ts`

- [ ] Write failing tests for `topic`, `assessmentTarget`, topic-outline prompt instructions, duplicate prompt/target rejection, unknown topic rejection, and unbalanced counts.
- [ ] Run `npm.cmd test -- lib/quiz.test.ts lib/quiz-prompt.test.ts lib/quiz-coverage.test.ts` and confirm failure due to missing behavior.
- [ ] Add bounded metadata to questions and implement `TopicOutlineSchema`, outline instructions, normalized comparison keys, and `assertQuizCoverage`.
- [ ] Re-run the focused test command and confirm it passes.

### Task 2: Use the coverage validator in quiz generation

**Files:**
- Modify: `app/api/generate-quiz/route.ts`
- Test: `app/api/generate-quiz/route.test.ts`

- [ ] Write a failing test for the new output-validation helper or route error that demonstrates a duplicate quiz does not reach the learner.
- [ ] Run `npm.cmd test -- app/api/generate-quiz/route.test.ts` and confirm the expected failure.
- [ ] Make the first structured-output outline request, use its outline in the quiz request, validate the quiz, and make one corrective retry before returning a clear error.
- [ ] Re-run the route tests and confirm documented input validation behavior remains intact.

### Task 3: Generate and export an exam review

**Files:**
- Create: `lib/exam-review.ts`
- Create: `lib/exam-review.test.ts`
- Create: `app/api/generate-exam-review/route.ts`
- Create: `app/api/generate-exam-review/route.test.ts`
- Modify: `lib/pdf-export.ts`
- Modify: `lib/pdf-export.test.ts`

- [ ] Write failing tests for a 4--8 topic-card review schema and review PDF blocks containing key ideas, common confusion, and source notes.
- [ ] Run `npm.cmd test -- lib/exam-review.test.ts lib/pdf-export.test.ts` and confirm the failure is because the review feature is absent.
- [ ] Implement the strict review schema, English source-grounded prompt, route source validation, structured output parsing, and jsPDF export.
- [ ] Re-run the focused tests and confirm they pass.

### Task 4: Connect material detail to real review generation

**Files:**
- Modify: `components/material-detail-view.tsx`
- Modify: `components/quiz-workspace.tsx`
- Test: `components/material-detail-view.test.tsx`
- Test: `components/quiz-workspace.test.tsx`

- [ ] Write a failing component test that clicks `Generate exam review`, renders topic cards from a successful request, and exposes a retryable error for a failed request.
- [ ] Run `npm.cmd test -- components/material-detail-view.test.tsx components/quiz-workspace.test.tsx` and confirm the feature is absent.
- [ ] Pass restorable source data from the workspace, call the endpoint, render loading/error/success states, and export the returned review sheet.
- [ ] Re-run component tests and confirm they pass.

### Task 5: Verify and commit intentionally

**Files:** all feature, test, specification, and plan files above.

- [ ] Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run format:check`, and `npm.cmd run build`.
- [ ] Review `git diff --check` and `git diff --stat`; stage only the feature files and documentation, preserving the user's existing work.

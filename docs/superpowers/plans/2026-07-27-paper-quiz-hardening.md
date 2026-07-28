# Paper Quiz Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Fix the supplied Paper Quiz audit without losing existing user changes.

**Architecture:** Add shared request/persistence/rate-limit helpers, then make API and UI changes consume those helpers. Keep provider calls isolated and preserve the existing quiz schema.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zod, Vitest, OpenAI Responses API, Vercel.

---

### Task 1: Shared validation and persistence safety

**Files:**
- Create: `lib/request-validation.ts`
- Modify: `lib/study-history.ts`
- Modify: `components/quiz-workspace.tsx`
- Test: `lib/request-validation.test.ts`, `lib/study-history.test.ts`, `components/quiz-workspace.test.tsx`

- [ ] Add failing tests for bounded text, safe history parsing, guarded storage writes, and per-question chat persistence.
- [ ] Implement helpers and update session persistence/opening flows.
- [ ] Run focused tests and then the full test suite.

### Task 2: API boundary hardening and rate limiting

**Files:**
- Create: `lib/rate-limit.ts`
- Modify: `app/api/grade-answer/route.ts`
- Modify: `app/api/question-chat/route.ts`
- Modify: `app/api/generate-quiz/route.ts`
- Modify: `app/api/transcribe/route.ts`
- Test: API route tests and `lib/rate-limit.test.ts`

- [ ] Add failing tests for invalid JSON, oversized files/text, invalid history, unsupported files, and rate-limit responses.
- [ ] Implement shared limits, schema parsing, and bounded file reads before base64 conversion.
- [ ] Add explicit route duration configuration and run focused API tests.

### Task 3: Grading, input UX, and dead-code cleanup

**Files:**
- Modify: `components/quiz-workspace.tsx`
- Modify: `lib/quiz.ts`
- Modify: `app/api/grade-answer/route.ts`
- Modify: `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `README.md`
- Create/modify: formatting configuration and tests as needed

- [ ] Add failing tests for accepted-answer fill-blank grading, zero/over-limit question counts, drag/drop, and model configuration.
- [ ] Implement the smallest behavior changes and remove unused score code.
- [ ] Pin dependencies, align model configuration, update ignores, and run focused checks.

### Task 4: Workspace decomposition and source-reference/cost handling

**Files:**
- Modify/create focused components under `components/`
- Modify: `components/quiz-workspace.tsx`, `lib/openai-stream.ts`
- Modify: route tests and component tests

- [ ] Add regression tests around restored sessions, chat continuity, and loading/error states.
- [ ] Extract upload/quiz/results/history views without changing public behavior.
- [ ] Add bounded source-reference handling and honest progress/timeout behavior.

### Task 5: Final verification

- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd run build`.
- [ ] Review `git diff --check` and `git status --short`.

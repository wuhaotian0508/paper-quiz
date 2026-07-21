# PDF AI Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small, working Next.js website that accepts one PDF and generates an interactive multiple-choice quiz with answers and explanations through OpenAI.

**Architecture:** A single Next.js App Router project serves the UI and one server-only generation endpoint. The endpoint validates multipart input, sends the PDF to the Responses API with structured output, and returns a typed quiz; the browser handles quiz navigation and scoring in memory.

**Tech Stack:** Next.js, React, TypeScript, OpenAI Node SDK, Zod, Vitest, Testing Library, CSS Modules/global CSS.

---

## File Structure

- `package.json`: scripts and runtime/test dependencies.
- `app/page.tsx`: page shell and quiz workspace entry point.
- `app/layout.tsx`: metadata and fonts.
- `app/globals.css`: responsive "Quiet Focus" visual system.
- `app/api/generate-quiz/route.ts`: PDF validation and OpenAI request.
- `components/quiz-workspace.tsx`: upload, generation, quiz, results state machine.
- `lib/quiz.ts`: quiz schema, settings validation, and score calculation.
- `lib/quiz.test.ts`: domain behavior tests.
- `app/api/generate-quiz/route.test.ts`: endpoint validation tests with mocked OpenAI calls.
- `.env.example`: required server environment variables.
- `README.md`: setup and run instructions.

### Task 1: Scaffold the Next.js Application

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `.gitignore`

- [ ] **Step 1: Define scripts and dependencies**

Use scripts `dev`, `build`, `start`, `lint`, `typecheck`, and `test`. Add Next.js, React, OpenAI, Zod, Vitest, jsdom, and Testing Library dependencies.

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: dependencies install successfully and `package-lock.json` is created.

- [ ] **Step 3: Verify the toolchain**

Run: `npm run typecheck`

Expected: TypeScript can load the empty project configuration without configuration errors.

### Task 2: Build and Test the Quiz Domain

**Files:**
- Create: `lib/quiz.test.ts`
- Create: `lib/quiz.ts`

- [ ] **Step 1: Write failing domain tests**

Cover these exact behaviors:

```ts
expect(parseSettings("5", "basic")).toEqual({ count: 5, difficulty: "basic" });
expect(() => parseSettings("7", "basic")).toThrow("题目数量无效");
expect(calculateScore(quiz, { q1: "b" })).toEqual({ correct: 1, total: 1 });
```

- [ ] **Step 2: Run the tests and confirm failure**

Run: `npm test -- lib/quiz.test.ts`

Expected: FAIL because `lib/quiz.ts` does not exist.

- [ ] **Step 3: Implement typed schemas and helpers**

Define `QuizSchema`, `QuestionSchema`, `Quiz`, `Question`, `parseSettings`, and `calculateScore`. Enforce exactly four options and a correct option id that matches one option.

- [ ] **Step 4: Run the domain tests**

Run: `npm test -- lib/quiz.test.ts`

Expected: PASS.

### Task 3: Build and Test the Generation Endpoint

**Files:**
- Create: `app/api/generate-quiz/route.test.ts`
- Create: `app/api/generate-quiz/route.ts`
- Create: `.env.example`

- [ ] **Step 1: Write failing route validation tests**

Test that the endpoint returns status 400 for a missing file, non-PDF file, oversized PDF, and unsupported question settings. Test status 503 when `OPENAI_API_KEY` is absent.

- [ ] **Step 2: Run route tests and confirm failure**

Run: `npm test -- app/api/generate-quiz/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement server validation and OpenAI generation**

Accept `FormData` fields `file`, `count`, and `difficulty`. Reject files over 20 MB. Send the PDF as an `input_file` and request schema-constrained output with `zodTextFormat(QuizSchema, "quiz")`. Read `OPENAI_API_KEY` and `OPENAI_MODEL` only on the server, defaulting the model to `gpt-5.6`.

- [ ] **Step 4: Normalize errors**

Return concise Chinese messages with status 400 for user input, 503 for missing configuration, and 502 for upstream generation failures. Do not include secrets, file contents, or raw provider responses.

- [ ] **Step 5: Run route tests**

Run: `npm test -- app/api/generate-quiz/route.test.ts`

Expected: PASS.

### Task 4: Build the Interactive Quiz UI

**Files:**
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `components/quiz-workspace.tsx`

- [ ] **Step 1: Create the page shell**

Add Chinese metadata and a compact hero explaining "上传讲义，AI 帮你划重点出题".

- [ ] **Step 2: Implement upload and settings states**

Support click-to-upload and drag-and-drop for one PDF, show its name and size, and expose 5/10/15 question and basic/mixed/challenging controls.

- [ ] **Step 3: Implement generation state**

Submit multipart `FormData` to `/api/generate-quiz`, disable duplicate submission, show staged progress copy, and preserve the selected file after retryable errors.

- [ ] **Step 4: Implement quiz and results states**

Show one question at a time. Require selection before submission, reveal the correct answer and explanation after submission, then advance. Calculate and display final accuracy and incorrect-answer review.

### Task 5: Apply the Responsive Visual Direction

**Files:**
- Create: `app/globals.css`

- [ ] **Step 1: Define the design tokens**

Use paper white, mint green, deep ink, and coral accent variables with editorial heading typography, clean reading typography, rounded cards, soft gradients, and a subtle dot pattern.

- [ ] **Step 2: Style all application states**

Cover the upload drop zone, settings pills, progress state, question choices, correct/incorrect feedback, explanation panel, results, and errors.

- [ ] **Step 3: Add responsive behavior**

At widths below 720 px, stack settings and actions, reduce outer padding, keep answer targets at least 44 px high, and prevent horizontal scrolling.

### Task 6: Document and Verify the First Version

**Files:**
- Create: `README.md`

- [ ] **Step 1: Document configuration**

Explain how to copy `.env.example` to `.env.local`, set `OPENAI_API_KEY`, optionally set `OPENAI_MODEL`, install dependencies, and run `npm run dev`.

- [ ] **Step 2: Run automated verification**

Run: `npm test`

Expected: all tests pass.

Run: `npm run typecheck`

Expected: no TypeScript errors.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 3: Verify in a browser**

Open the local site at desktop and mobile widths. Confirm upload validation, settings, missing-key error handling, loading state, answer reveal, next-question navigation, final score, and no horizontal overflow.

## Execution Note

The workspace is not currently a Git repository, so this plan does not initialize Git or create commits. Implementation stays within the existing workspace and leaves repository setup to the user.

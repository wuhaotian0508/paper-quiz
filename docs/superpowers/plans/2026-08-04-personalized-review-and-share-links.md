# Personalized Review and Share Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate PDF-grounded review sheets that prioritize the selected PDF's mistakes, expose them from the Dashboard, and make both quizzes and review sheets easy to share and convert visitors into signed-in users.

**Architecture:** Extend the existing exam-review structured-output contract with material-local mistake references. Keep review generation and PDF export in the current material-detail flow, and add a separate Supabase-backed read-only review-share artifact instead of mixing review payloads with quiz answer keys. Keep public links usable anonymously, with safe return-to login and artifact-specific use/save actions.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest/Testing Library, Supabase RPC + RLS, OpenAI Responses structured output, jsPDF.

---

### Task 1: Extend the source-grounded review contract

**Files:**
- Modify: `lib/exam-review.ts`
- Modify: `lib/exam-review.test.ts`
- Modify: `lib/request-validation.ts`
- Test: `app/api/generate-exam-review/route.test.ts`

- [ ] **Step 1: Write failing schema and prompt tests**

Add a fixture topic containing `relatedMistakeIds` and `mistakeFocus`, assert that the schema
accepts it, and assert that the instruction text says the PDF is the factual authority, mistake
context only sets priority, and IDs must come from the supplied context.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

Run: `npm.cmd test -- lib/exam-review.test.ts app/api/generate-exam-review/route.test.ts`

Expected: the new schema field and prompt assertions fail because the current contract has no
mistake-reference fields.

- [ ] **Step 3: Implement the minimal contract and bounded context parser**

Add `relatedMistakeIds: z.array(z.string().min(1)).max(3)` and
`mistakeFocus: z.string().trim().max(500)` to each topic. Add a parser for an optional JSON array
bounded to the existing persisted mistake count and containing only the fields required for
personalization: `id`, `prompt`, `answer`, `referenceAnswer`, `feedback`, `status`, `sourceNote`.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm.cmd test -- lib/exam-review.test.ts app/api/generate-exam-review/route.test.ts`

Expected: all focused schema/prompt tests pass.

- [ ] **Step 5: Commit the contract change**

Run: `git add lib/exam-review.ts lib/exam-review.test.ts lib/request-validation.ts app/api/generate-exam-review/route.test.ts; git commit -m "feat: add mistake context to exam review contract"`.

### Task 2: Generate a personalized review from one material

**Files:**
- Modify: `app/api/generate-exam-review/route.ts`
- Modify: `components/material-detail-view.tsx`
- Modify: `components/material-detail-view.test.tsx`

- [ ] **Step 1: Write a failing route/UI regression test**

Post a material with one saved mistake and assert the form contains serialized mistake context;
return a topic referencing that mistake and assert the UI renders the original missed prompt,
learner answer, feedback, and `mistakeFocus`. Add cases for no mistakes and invalid generated IDs.

- [ ] **Step 2: Run the focused test and verify it fails for the missing behavior**

Run: `npm.cmd test -- components/material-detail-view.test.tsx app/api/generate-exam-review/route.test.ts`

Expected: the request lacks the mistakes field and the rendered topic lacks the personalized
mistake section.

- [ ] **Step 3: Implement minimal route validation and prompt context**

Read `mistakes` from `FormData`, parse the bounded context, append it in a delimited
`<learner_mistakes>` block, and parse the structured result. Filter `relatedMistakeIds` against
the supplied IDs; source-only requests produce no references. Preserve existing source-file,
transcript, OpenAI, timeout, and early-stream errors.

- [ ] **Step 4: Implement the material-detail flow**

Send only `material.mistakes` with the selected material's source, rename the action to
`Generate personalized review sheet`, render linked mistake details, and practice only the
referenced entries. Keep the count-based sheet under `Show practice summary`.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `npm.cmd test -- components/material-detail-view.test.tsx app/api/generate-exam-review/route.test.ts`

Expected: all personalized, source-only, and missing-source cases pass.

- [ ] **Step 6: Commit the personalized flow**

Run: `git add app/api/generate-exam-review/route.ts components/material-detail-view.tsx components/material-detail-view.test.tsx; git commit -m "feat: personalize PDF review sheets with mistakes"`.

### Task 3: Export personalized reviews as PDFs and share artifacts

**Files:**
- Modify: `lib/pdf-export.ts`
- Modify: `lib/pdf-export.test.ts`
- Create: `lib/shared-review.ts`
- Create: `lib/shared-review.test.ts`
- Create: `lib/shared-review-client.ts`
- Create: `lib/shared-review-client.test.ts`
- Create: `supabase/migrations/20260804000000_shared_review_sheets.sql`
- Create: `supabase/migrations/20260804000000_shared_review_sheets.test.ts`

- [ ] **Step 1: Write failing export, payload, and migration tests**

Assert PDF blocks contain `mistakeFocus` and the referenced missed question. Assert the review
payload strips private mistake-book fields and produces a review-specific slug URL. Assert the
migration creates an owner-scoped review table, RLS, security-definer create/get RPCs, and anon /
authenticated execute grants while never exposing quiz answer keys.

- [ ] **Step 2: Run the focused tests and verify the expected failures**

Run: `npm.cmd test -- lib/pdf-export.test.ts lib/shared-review.test.ts lib/shared-review-client.test.ts supabase/migrations/20260804000000_shared_review_sheets.test.ts`

Expected: the new review share helpers, export text, and migration assertions fail.

- [ ] **Step 3: Implement the minimal review-share model and RPC migration**

Create a `paper_quiz_shared_review_sheets` table with owner, slug, title, review JSON, active flag,
expiry, and timestamps. Add owner-only management policies and security-definer RPCs that permit
anonymous read of active, unexpired public review content. Grant table DML to `authenticated` and
explicit RPC execution to `authenticated`/`anon`; keep review JSON separate from any answer key.

- [ ] **Step 4: Implement export and client helpers**

Add personalized blocks to `lib/pdf-export.ts`, `createSharedReview`, `loadSharedReview`, and
`getSharedReviewUrl`, preserving only public review fields and source notes.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run the Task 3 test command again. Expected: all export, privacy, slug, and migration tests pass.

- [ ] **Step 6: Commit the review export/share foundation**

Run: `git add lib/pdf-export.ts lib/pdf-export.test.ts lib/shared-review.ts lib/shared-review.test.ts lib/shared-review-client.ts lib/shared-review-client.test.ts supabase/migrations/20260804000000_shared_review_sheets.sql supabase/migrations/20260804000000_shared_review_sheets.test.ts; git commit -m "feat: export and share personalized reviews"`.

### Task 4: Add public review pages and login/use actions

**Files:**
- Create: `app/review/[slug]/page.tsx`
- Create: `components/shared-review-view.tsx`
- Create: `components/shared-review-view.test.tsx`
- Modify: `components/shared-challenge-view.tsx`
- Modify: `components/shared-challenge-view.test.tsx`
- Modify: `app/login/page.tsx`
- Modify: `components/login-view.tsx`
- Modify: `app/auth/callback/route.ts`
- Modify: related login tests

- [ ] **Step 1: Write failing public-page and auth-return tests**

Assert a public review page loads without a session, renders source notes and mistake-focus text,
shows `Sign in` and `Use this review`, and links sign-in with a safe `returnTo`. Add equivalent
quiz-page assertions for `Sign in` and `Use this quiz`, plus a callback test proving a validated
relative return path is preserved and an external URL is rejected.

- [ ] **Step 2: Run the focused tests and verify the expected failures**

Run: `npm.cmd test -- components/shared-review-view.test.tsx components/shared-challenge-view.test.tsx app/login/page.test.tsx components/login-view.test.tsx app/auth/callback/route.test.ts`

Expected: the review route, CTA labels, and return-to behavior are absent.

- [ ] **Step 3: Implement the public review route/view**

Load the review through the anonymous-safe RPC, render the existing review-card visual language,
and use `/login?returnTo=<current-relative-path>` for `Sign in`. Make `Use this review` a clear
read-only study action; if the visitor wants to save or copy it, direct them to sign in.

- [ ] **Step 4: Polish the existing public quiz page**

Add the same `Sign in` CTA and `Use this quiz` label while retaining anonymous answering and the
existing answer-key isolation. Keep the seven-day note visible.

- [ ] **Step 5: Preserve safe auth return paths**

Pass `returnTo` through the login page and Supabase redirect URL. In the callback, accept only a
relative path beginning with `/` and redirect to `/` for missing or external values.

- [ ] **Step 6: Run the focused tests and verify they pass**

Run the Task 4 test command again. Expected: public access, CTA semantics, and safe auth return
tests pass.

- [ ] **Step 7: Commit the public share/auth flow**

Run: `git add app/review components/shared-review-view.tsx components/shared-review-view.test.tsx components/shared-challenge-view.tsx components/shared-challenge-view.test.tsx app/login/page.tsx components/login-view.tsx app/auth/callback/route.ts app/login/page.test.tsx components/login-view.test.tsx app/auth/callback/route.test.ts; git commit -m "feat: add sign-in actions to shared study links"`.

### Task 5: Make sharing visible in results and review UI

**Files:**
- Modify: `components/results-view.tsx`
- Modify: `components/results-view.test.tsx`
- Modify: `components/material-detail-view.tsx`
- Modify: `components/material-detail-view.test.tsx`
- Modify: `components/quiz-workspace.tsx`
- Modify: `components/upload-view.tsx` and its test
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing interaction tests**

Assert results separates `Downloads` and `Share`, calls `Create share link`, then renders the
copyable URL, `Copy link`, `Open link`, and expiry. Assert material review renders
`Share review link` after generation and handles clipboard/open actions.

- [ ] **Step 2: Run focused UI tests and verify they fail**

Run: `npm.cmd test -- components/results-view.test.tsx components/material-detail-view.test.tsx components/upload-view.test.tsx`

Expected: the current text-only share button and absent review-share controls fail these assertions.

- [ ] **Step 3: Implement state and controls**

Track the created quiz/review URLs in workspace/material-detail state, copy only when the browser
clipboard is available, expose the URL in a read-only field, and keep status/error text accessible.
Use separate `Downloads` and `Share` groups with responsive styles and artifact-specific labels.

- [ ] **Step 4: Add the Dashboard Review focus card**

Pass grouped `materials` and an `onOpenMaterial` callback into `UploadView`. Show up to three
recent materials with mistake counts and `Open review`; show an empty state when no saved material
has mistakes. Opening a row routes to the existing material detail view.

- [ ] **Step 5: Run focused tests and commit**

Run the Task 5 test command again, then:
`git add components/results-view.tsx components/results-view.test.tsx components/material-detail-view.tsx components/material-detail-view.test.tsx components/quiz-workspace.tsx components/upload-view.tsx components/upload-view.test.tsx app/globals.css; git commit -m "feat: surface quiz and review sharing"`.

### Task 6: Full verification and scope audit

**Files:**
- Verify all files changed by Tasks 1-5; do not stage the pre-existing unrelated worktree changes.

- [ ] **Step 1: Run the complete test suite**

Run: `npm.cmd test`

Expected: Vitest exits 0 with zero failed tests.

- [ ] **Step 2: Run typecheck, lint, and production build**

Run: `npm.cmd run typecheck; npm.cmd run lint; npm.cmd run build`

Expected: each command exits 0 without TypeScript, ESLint, or Next.js build errors.

- [ ] **Step 3: Audit privacy and scope**

Confirm review links contain no uploaded PDF bytes, private answer keys, learner answers outside
the generated public review, or cross-material mistake IDs. Confirm share URLs show their expiry,
public pages offer `Sign in` and the correct `Use this ...` label, and pre-existing unrelated
changes remain unstaged.

- [ ] **Step 4: Commit only verified feature changes**

Run `git status --short` and `git diff --cached --check`; stage only the feature files if any
verification fixes remain, then commit with `feat: ship personalized review and share links`.

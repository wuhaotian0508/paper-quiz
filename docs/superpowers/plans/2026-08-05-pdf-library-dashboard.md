# PDF Library Dashboard Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with tests at each checkpoint.

**Goal:** Make each uploaded PDF a persistent library item and present its review sheet as a document card on the dashboard.

**Architecture:** Keep the existing `StudyMaterial` grouping for sessions and mistakes, and add a small local-storage library registry for uploads that have not produced a session yet. The dashboard will render a persistent library sidebar and a document-card review section; opening a card reuses the existing material detail/review flow.

**Tech Stack:** React, Next.js, TypeScript, Vitest, localStorage.

---

### Task 1: Persist uploaded PDF library metadata

**Files:** `lib/study-library.ts`, `lib/study-library.test.ts`, `components/quiz-workspace.tsx`

- [ ] Add a schema-bounded library record with id, name, uploadedAt, and lastOpenedAt.
- [ ] Add read/write/upsert helpers using a dedicated localStorage key.
- [ ] Write a failing test for adding and reading a PDF record without a quiz session.
- [ ] Hydrate library records in `QuizWorkspace` and upsert records from accepted files.

### Task 2: Build the document review-card section

**Files:** `components/review-library.tsx`, `components/review-library.test.tsx`, `components/upload-view.tsx`

- [ ] Add a failing test for document cards showing mistakes, mastery, last practiced date, and an Open Review Sheet action.
- [ ] Implement the card component from `StudyMaterial` plus library metadata.
- [ ] Render an empty state and preserve the existing dashboard actions.

### Task 3: Add the persistent Your Library sidebar

**Files:** `components/dashboard-navigation.tsx`, `components/dashboard-navigation.test.tsx`, `app/globals.css`

- [ ] Add a library prop and a compact recent-PDF list with `+ New` and `View all` actions.
- [ ] Add responsive styles matching the supplied reference while preserving current navigation behavior.
- [ ] Cover the visible library labels in tests.

### Task 4: Verify integration

- [ ] Run focused library, dashboard, and workspace tests.
- [ ] Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build`.
- [ ] Run `git diff --check` and inspect the final diff for unrelated changes.

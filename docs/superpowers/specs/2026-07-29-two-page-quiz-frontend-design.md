# Two-page quiz frontend design

## Goal

Create a new, isolated frontend preview for PaperQuiz AI. It demonstrates a less crowded
study flow without replacing the current home page or changing quiz-generation, storage,
authentication, or synchronization behavior.

The visual system follows the approved reference: a blue-to-violet primary accent, light and
dark themes with identical layout, a compact step indicator, and a clickable brand that returns
to the first screen.

## Route and boundaries

- Add a separate preview route rather than modifying `app/page.tsx`.
- Keep the current `QuizWorkspace` and all existing production interactions unchanged.
- The preview is client-side and uses representative data only; it does not upload files or
  generate questions yet.
- No API routes, database schema, authentication behavior, or saved-study data change in this
  work.

## Page 1: Upload and Configure

This screen only shows the input stage, so it does not contain question preview content.

- Header: brand link, four-step progress indicator, theme switch, and feedback affordance.
- Brand link always returns to Page 1 and scrolls to its top.
- Upload card: PDF/audio drop zone and a selected-file status row. Copy acknowledges current
  supported inputs: PDF, MP3, M4A, WAV, WebM, and MP4.
- Quiz configuration: visible preset question-type buttons, focus-area and difficulty fields,
  explanation and challenge switches, and one primary generate action.
- Existing precise per-type counts and custom question formats are represented by a compact
  `Advanced options` affordance so the default screen remains uncluttered.

## Page 2: Review and Explore

This screen contains generated material only, giving question content its own full-width space.

- A material selector sits above the summary. It identifies the active PDF and lets the learner
  switch among PDFs that already have generated quiz content.
- The selector updates the active-material label in the preview. In the production integration it
  will select the matching saved material/session and replace all overview, question, export, and
  practice data as a single unit.
- Summary: question count, topic count, difficulty coverage, estimated duration, and topic tags.
- Question review: one readable sample question, answer choices, and a separate explanation pane.
- Action bar: export, answer key, and sharing affordances.

## Interaction model

- Page tabs are explicit preview controls; the actual flow transitions from Page 1 after generate
  succeeds to Page 2, with the step indicator advancing to `Review & Explore`.
- Light and dark themes are switched manually and share one token-based component layout.
- On narrow screens the header step labels collapse, fields stack, metrics become two columns,
  and action items stack vertically.
- The preview does not claim that the material selector has loaded real data; it is visually and
  behaviorally isolated until a later integration task.

## Files and component design

- `app/frontend-preview/page.tsx`: server route shell and metadata.
- `components/frontend-preview.tsx`: client-side page/theme/material selection state and preview
  markup. This is separate from `QuizWorkspace` to avoid destabilizing the current workflow.
- `app/globals.css`: a tightly namespaced `frontend-preview-*` section with theme variables and
  responsive styles, avoiding edits to existing component rules.

## Validation

- Add a focused component test for page switching, theme switching, the brand returning to Page 1,
  and the active material label changing when the selector changes.
- Run the targeted test, then the existing full test suite, lint, typecheck, and production build.
- Manually verify the route at desktop and narrow mobile widths in both themes.

## Non-goals

- This task does not replace the existing home page.
- This task does not wire the preview controls to file uploads, generation, Supabase, exports, or
  live sessions.
- This task does not remove current UI, study-history, materials, mistake-book, or help features.

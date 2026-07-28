# Student PDF Export Design

## Goal

Replace Paper Quiz's plain-text PDF exports with compact, colorful student-facing paper templates and give every quiz export an explicit choice between a student copy without answers and an answer key with answers and explanations.

## Confirmed Direction

Use the approved Paper Quiz Studio visual direction: coral, blue, mint, and yellow accents; a compact layout; and an encouraging student tone. The template is colorful on screen and still readable when printed. It is not a decorative cover page followed by plain text.

## Export Variants

### Student Copy

- Export label: `Student copy (no answers)`.
- Contains quiz title, practice-set metadata, name/date fields, a short encouragement, type sections, question prompts, multiple-choice options, and answer space for written questions.
- Never contains correct options, reference answers, grading notes, explanations, source notes, user answers, or scores.
- Uses two columns for four multiple-choice options and one or two ruled lines for fill blanks. Written responses use four compact ruled lines and continue naturally on a later page when necessary.

### Answer Key

- Export label: `Answer key (with answers)`.
- Reuses the same page header, section labels, prompt styling, and type colors as the student copy.
- Adds a compact answer/explanation panel below every question, including the answer, explanation, and source note.
- Avoids repeating enlarged prompts or excess whitespace.

### Existing Review Exports

- Graded review and mistake-book PDFs use the same visual primitives: colored heading strip, compact question block, feedback panel, narrow header/footer, and page number.
- Their content stays unchanged: graded review includes student answers and grades; mistake book includes the saved answer and feedback.

## Layout Rules

- A4 portrait pages with narrow printable margins.
- Reserve space for a small header and footer on every page; footer includes `Paper Quiz AI` and page number.
- Keep individual question blocks together where possible. Add a new page before a block that cannot fit, and repeat the compact header on that page.
- The primary layout target is four to six multiple-choice questions per page or two to three questions with written-response space.
- Long prompts, options, answer keys, or explanations wrap safely and trigger a page break before overflow.

## Interface

- Replace ambiguous `Export paper PDF` controls with an export choice containing both variants.
- Keep existing entry points in active quizzes and results. The result page must show both export choices directly.
- Mistake-book, graded-review, and progress exports retain their existing actions but use the new template styling.

## Architecture

- Keep browser-side PDF generation in `lib/pdf-export.ts` using `jspdf`.
- Extract pure layout helpers for metadata, page headers/footers, wrapped text, question blocks, and answer panels. They accept a `jsPDF` instance and return the next vertical coordinate.
- Keep download functions as thin public wrappers so React components do not need knowledge of PDF layout.
- Add focused unit tests for public export configuration and document content calls. Add a small generated-PDF smoke test that confirms a student copy omits answer-key-only text while an answer key includes it.

## Error Handling

- Exports work solely from in-memory quiz, history, and mistake data; no material is uploaded or persisted.
- Missing optional grade data produces `Not graded` rather than failing the export.
- Empty mistake/history lists retain disabled buttons and do not attempt downloads.

## Verification

- Test student and answer-key content separation plus export control labels.
- Run all tests, typecheck, lint, and production build.
- Generate both variants from representative mixed questions, render pages to PNG with Poppler, and inspect headers, page breaks, colored blocks, answer-line spacing, and footer page numbers.
- Deploy to Vercel, explicitly refresh the canonical production alias if needed, and inspect the live export controls.

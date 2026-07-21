# English-Only Quiz Design

## Goal

Make the PDF quiz product English-only, including its browser UI, metadata,
server validation errors, and the language required from the AI generator.

## User Experience

- The page uses `lang="en"` and English title/description metadata.
- Every static label, instruction, progress state, feedback message, and result
  message appears in English.
- The generator explicitly requires English questions, options, explanations,
  quiz title, summary, and source notes, even when the uploaded PDF is written
  in another language.
- File names remain unchanged because they are user-provided data.

## Implementation Boundaries

- `components/quiz-workspace.tsx` owns all client-side wording and accessible
  labels.
- `app/api/generate-quiz/route.ts` owns server errors and the English-only
  generation instruction.
- `app/layout.tsx` and `app/page.tsx` own document language, metadata, and
  shared shell copy.
- `lib/quiz.ts` and `lib/quiz-output.ts` own user-visible validation and
  fallback quiz text.
- Existing quiz data structures, generation settings, API credentials, and
  visual styling stay unchanged.

## Error Handling

All error messages shown to the user are English. Non-JSON upstream responses
continue to be handled by `lib/quiz-response.ts`; its messages are translated
along with the rest of the client-facing flow.

## Verification

- Component tests assert English upload controls and the absence of the legacy
  Chinese prompt.
- Unit tests assert English response-parser errors.
- Route and prompt tests assert English request-validation errors and the required
  English-only generation prompt.
- The full test suite, type check, production build, Vercel deploy, and a live
  multipart request verify the change end to end.

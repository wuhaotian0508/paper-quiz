# PDF AI Quiz Website Design

## Goal

Build a lively but focused exam-review website where a student uploads one PDF and receives multiple-choice questions grounded in that document. Every question includes four choices, one correct answer, and a clear explanation.

## Product Scope

### Included in the first version

- Upload one PDF from the home page.
- Configure question count: 5, 10, or 15.
- Configure difficulty: basic, mixed, or challenging.
- Generate questions from the actual PDF with the OpenAI Responses API.
- Present one question at a time.
- Reveal the correct answer and explanation only after the student submits an answer.
- Show progress, score, completion summary, and a review of incorrect answers.
- Handle invalid files, oversized files, missing API configuration, generation failures, and malformed model output.
- Keep API credentials on the server.

### Excluded from the first version

- User accounts and authentication.
- Database persistence or cloud-synced history.
- Payments, subscriptions, or usage quotas.
- Multiple-PDF knowledge bases.
- Teacher dashboards or collaborative sharing.

## Visual Direction

The selected direction is "Quiet Focus." The interface uses warm paper white, mint green, deep ink, and a restrained coral accent. Typography combines an expressive editorial heading face with a clean sans-serif reading face. The page background uses soft gradient fields and a subtle dot texture rather than a flat color.

The experience should feel encouraging and playful without becoming noisy. Rounded panels, small hand-drawn marks, and gentle page transitions provide personality. The quiz screen avoids dense dashboards: it centers one question, a clear progress indicator, and four large answer choices.

## User Flow

1. The landing page explains the product in one sentence and presents a large PDF drop zone.
2. After a valid file is selected, the student chooses question count and difficulty.
3. The student starts generation and sees a staged progress view while the server processes the PDF.
4. The quiz opens on question one. The student selects one option and submits it.
5. The interface locks the answer, marks the correct option, and expands the explanation.
6. The student moves to the next question.
7. The completion screen shows the score, accuracy, and incorrect questions with explanations.
8. The student may restart the same quiz or return to upload another PDF.

## Architecture

Use a Next.js application with TypeScript and the App Router. The browser owns file selection, settings, quiz navigation, scoring, and local session state. A server route owns file validation, the OpenAI API call, schema validation, and safe error responses.

The server sends the PDF as an OpenAI `input_file` to the Responses API together with generation instructions. The requested output follows a strict JSON schema with:

- quiz title;
- source summary;
- questions;
- four options per question;
- correct option identifier;
- explanation;
- source-grounding note for each question.

The model name is configured through `OPENAI_MODEL`, with `gpt-5.6` as the initial default. The API key is read only from `OPENAI_API_KEY` on the server.

## Component Boundaries

- `UploadPanel`: drag-and-drop, file picker, filename, and validation feedback.
- `QuizSettings`: question-count and difficulty controls.
- `GenerationProgress`: staged loading state and cancel-safe UI.
- `QuestionCard`: prompt, option selection, submission, answer state, and explanation.
- `QuizProgress`: current question and completion percentage.
- `ResultsView`: score summary and incorrect-answer review.
- `QuizWorkspace`: state machine coordinating upload, generation, quiz, and results.
- `/api/generate-quiz`: validates input, calls OpenAI, parses structured output, and maps errors.

Each component receives typed data and callbacks. Only the API route imports the OpenAI SDK or accesses secrets.

## Data Flow

1. The browser validates that the selected file is a PDF within the application size limit.
2. The browser submits a `FormData` request containing the PDF, question count, and difficulty.
3. The server repeats all validation because client checks are not trusted.
4. The server converts the PDF to the supported OpenAI file input and requests schema-constrained quiz JSON.
5. The server validates the returned structure before sending it to the browser.
6. The browser stores the generated quiz only in memory and runs the answer/review flow locally.

## Error Handling

- Non-PDF or oversized file: reject before generation and explain the accepted format and limit.
- Missing `OPENAI_API_KEY`: return a setup-specific server error without exposing environment details.
- OpenAI authentication or quota failure: show a concise configuration or billing message.
- Unsupported or unreadable PDF: ask the student to export or scan the document again.
- Timeout or transient API failure: offer a retry while preserving the selected file and settings.
- Invalid structured output: return a generation error and allow retry; never render partial unsafe data.

## Security and Privacy

- Never expose `OPENAI_API_KEY` through client code, browser storage, logs, or responses.
- Accept PDFs only through the server route and do not persist uploads to disk.
- Enforce MIME type, filename extension, request size, count, and difficulty on the server.
- Avoid logging PDF contents or model responses.
- Include an interface note that uploaded content is sent to OpenAI for quiz generation.

## Testing and Verification

- Unit-test quiz schema validation, settings validation, and score calculation.
- Route-test missing key, invalid file, invalid settings, model failure, and successful generation with a mocked OpenAI client.
- Component-test answer submission, explanation reveal, next-question flow, and final score.
- Run lint, type checking, and production build.
- Test the complete flow in a browser at desktop and mobile widths.
- Verify that the API key does not appear in the browser bundle or network response.

## Success Criteria

- A student can upload a valid PDF and generate a complete quiz using a configured OpenAI Platform API key.
- Every generated question has exactly four options, one valid correct answer, and a non-empty explanation.
- The answer remains hidden until submission.
- The final score matches the submitted answers.
- The site works without layout breakage on common desktop and mobile widths.
- API credentials remain server-only.

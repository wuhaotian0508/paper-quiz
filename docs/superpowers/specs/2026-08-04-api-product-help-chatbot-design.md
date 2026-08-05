# API Product Help Chatbot Design

## Goal

Replace PaperQuiz's local keyword-based Help replies with an OpenAI-backed product-support chatbot. It helps a learner who does not know a feature by naming the exact visible buttons to click, while keeping academic tutoring and study material outside this feature.

## Scope

The signed-in dashboard's existing `Help` link and floating help launcher remain the two entry points. Both open the same product-support conversation.

The chatbot can explain the real PaperQuiz flows for:

- Uploading a PDF or lecture recording and generating a quiz.
- Selecting question types, quantities, and difficulty.
- Answering, grading, and question-specific tutoring boundaries.
- Mistake Book, Progress, History, review sheets, and PDF exports.
- Sign-in, sharing, privacy, and Feedback.

It must not read, receive, retain, or answer from an uploaded file, transcript, quiz question, answer, grade, or the existing per-question tutor history. It must not answer academic questions or grade work.

## Architecture

### Product map

A server-only product map describes the verified dashboard destinations, button labels, and feature boundaries. It is context for the model, not a keyword-to-answer implementation. It includes exact labels such as `Mistake Book`, `Progress`, `History`, `Generate quiz`, and `Feedback` only where they exist in the current UI.

The map is kept separate from the chat route so its facts can be unit-tested and updated when UI labels change.

### API route

`POST /api/product-help` receives a JSON body with:

- `message`: the learner's product-use question, bounded to a small safe length.
- `history`: up to eight prior product-help turns, with bounded per-message content.
- `currentView`: a constrained label describing the active product screen.

The route validates the body with Zod, obtains the existing server-only OpenAI configuration, and calls the Responses API using the configured model. Its prompt supplies the product map and these rules:

1. Answer only how to use PaperQuiz.
2. Give a short numbered click path when it helps the learner act.
3. Name only buttons or destinations provided by the product map.
4. Do not request or use learning material, answers, grades, or personal data.
5. For academic, unsupported, or uncertain questions, say that the chatbot cannot help with that and direct the learner to `Feedback`.

The response is JSON `{ reply: string, needsFeedback: boolean }`. Empty model replies and provider failures become safe, user-readable error responses. No product-help conversation is saved to localStorage, Supabase, or the study-session record.

### Client chat

`ProductHelpChat` keeps its session-only React message list but replaces its local response function with `fetch('/api/product-help')`. It sends only the sanitized product-help history and a view label inferred from the page hash. It displays:

- A pending assistant message while the API call is in flight.
- The returned guidance, including step-by-step button names.
- A `Send feedback` link whenever `needsFeedback` is true.
- A retryable error message when the API cannot respond.

The widget must continue to close with Escape, remain mobile-safe, and never call `/api/question-chat`.

### Help center

The current full-screen Help page becomes a chatbot-focused landing surface: it keeps the prominent question input and directs learners into the same API-backed conversation. Static explanatory content may remain as secondary reference material, but it cannot generate the chatbot answer or be represented as an AI answer.

## Error Handling

- Invalid input returns HTTP 400 without calling OpenAI.
- A missing API key returns HTTP 503 with the established configuration message.
- A provider failure returns HTTP 502 with a retry-friendly message.
- Client-side network or timeout failures leave prior messages intact and offer the learner a retry path.
- Unsupported requests have a normal model response with `needsFeedback: true`, not an API error.

## Testing

- Unit-test product-map validation and API request parsing.
- Route-test normal API responses, invalid bodies, missing configuration, provider errors, and prompt boundaries.
- Component-test that the widget calls only `/api/product-help`, renders API guidance, shows loading/error states, and exposes Feedback when requested.
- Assert product-help requests contain no `File`, `FormData`, source-file id, transcript, quiz question, answer, or grade.
- Keep the existing per-question `/api/question-chat` tests unchanged as a regression boundary.

## Out of Scope

- Autonomous browser interaction or click automation.
- Academic tutoring, grading, or using a learner's source material.
- Persisting product-support conversations or analytics.
- Changing the existing quiz-generation, grading, or question-chat APIs.

# Help Center and Product Chatbot Design

## Goal

Give Paper Plane Quiz students a clear, friendly way to learn how to use the product without confusing it with the existing lecture-grounded question tutor.

## Scope

The feature has two entry points:

- A `Help` link in the main navigation that opens a dedicated help center.
- A colorful fixed `Help` button that opens a compact product-support chat window from any primary study view.

The help center covers these English-language topics:

1. Getting started: upload a PDF or lecture recording, review a transcript, and generate a quiz.
2. Question setup: choose multiple choice, fill-in-the-blank, written, or custom question types and counts.
3. Answering and grading: immediate multiple-choice feedback and AI grading for written responses.
4. Mistake book: saved mistakes, reviewing, practising, and clearing browser-local entries.
5. PDF exports: student copy versus answer key and review/progress exports.
6. Study history and calendar: finding a prior attempt and opening read-only review.
7. Privacy and feedback: material is used for the active study flow, records are browser-local, and feedback is sent to the existing mail link.

## Product Chatbot Boundary

The product chatbot answers only questions about using Paper Plane Quiz. It obtains answers from the same structured help articles used by the help-center page.

It must not:

- answer academic questions or grade student work;
- use an uploaded PDF, transcript, quiz answers, or the existing per-question chat history;
- persist a conversation locally or remotely after the chat panel closes;
- invent support for a feature not present in the help knowledge base.

If no article supports an answer, the chatbot says that it does not have a documented answer and points the user to the existing `Feedback` mail link.

The existing per-question chat remains unchanged. It stays available only after a question is submitted and remains grounded in the current question and learning material.

## Architecture

### Shared help knowledge

Create a small typed help-article module with article IDs, titles, summaries, searchable keywords, section names, and body content. The help center renders those articles directly. The chatbot uses the same data to rank relevant articles by normalized keyword overlap.

This keeps support text and chatbot behavior in sync without a second remote knowledge source or account integration.

### Help center

Add a client-side help-center view to the current workspace navigation. It provides category navigation and a search field. Search filters articles by title, summary, keywords, and body. Empty search results show the feedback action rather than a misleading answer.

### Floating help panel

Add a client-side panel with:

- welcome text and compact suggested questions;
- a scrollable, session-only message list;
- a text input and send button;
- a local response generated from matching help articles;
- an explicit fallback with the feedback mail link when no good match exists.

No backend endpoint or API key is needed. This makes ordinary product help dependable when the user is offline and prevents accidental exposure of learning materials.

## Visual Direction

The help controls follow the current colorful student-facing Paper Plane Quiz style: a playful coral/sky/yellow accent button, high contrast, clear text labels, and mobile-safe spacing. The fixed button does not obscure submit, navigation, or PDF export actions at narrow widths.

## Error Handling and Accessibility

- The panel can be opened or closed with a labelled button and closes with Escape.
- The message stream announces new assistant answers accessibly.
- Search and chat inputs have visible labels for screen readers.
- The fallback support path always retains a working `mailto:` link.
- Long answers are contained and scroll inside the panel, rather than expanding over the quiz.

## Tests

- Unit-test help search and response selection, including unsupported questions.
- Component-test navigation to the help center, article search, suggested question submission, custom question submission, and feedback fallback.
- Assert the product-support chat does not call the lecture question-chat endpoint or require uploaded material.
- Keep the existing question-specific chat test coverage as a regression boundary.

## Out of Scope

- Google Forms export.
- Google sign-in or external support accounts.
- Academic tutoring outside the existing per-question, lecture-grounded chat.
- Persistent support-chat transcripts or analytics.

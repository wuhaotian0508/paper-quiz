# Personalized PDF Review Sheet Design

## Goal

Give a learner a review sheet for one specific saved PDF that remains grounded in that PDF while
prioritizing the concepts they answered incorrectly or only partly correctly. Make the capability
discoverable from the Dashboard as well as the material history.

## Scope and user flow

The Dashboard gains a **Review focus** card. It lists up to three recently practiced PDF
materials, their saved mistake counts, and an **Open review** action. The action opens that
material's existing detail view; it does not silently call an AI endpoint or generate a review for
the wrong material.

On the material detail page, replace the ambiguous `Generate exam review` action with
`Generate personalized review sheet`. It is available only when PaperQuiz still has the original
saved PDF source or transcript. The existing local, count-based `Generate review sheet` becomes
`Show practice summary`, so learners can distinguish the offline history summary from the
source-grounded AI review.

Generating a personalized review sends the selected material's saved source plus only that
material's saved mistakes. It renders four to eight topic cards with source notes. Topic cards
that correspond to learner mistakes also display the original question, the learner's submitted
answer, the correct answer, feedback, and a targeted corrective tip. The existing practice action
uses only the referenced mistakes. If the material has no saved mistakes, generation still works
as a source-grounded PDF review and says that there are no recorded mistakes to personalize.

## Data and API design

`ExamReviewTopic` gains a `relatedMistakeIds` array and a `mistakeFocus` string. The endpoint
accepts an optional, bounded JSON list of mistake context: id, prompt, learner answer, correct
answer, feedback, status, and source note. It validates this input before calling OpenAI and
includes it in clearly delimited text alongside the saved source. The prompt states that the PDF
or transcript is the sole factual authority, mistake context only determines priority, and every
returned ID must come from the supplied list.

After structured-output parsing, the route rejects or removes unknown/malformed mistake IDs so
the UI never associates a generated topic with another PDF's mistake. Source-only requests pass
an empty context and require empty related ID lists. No review or extra source content is stored;
the response remains an in-memory result until the learner exports it.

## UI behavior and resilience

The current review-card visual style remains. A topic with related mistakes gets an accessible
`Your missed question` section and the targeted tip; a topic without one remains a normal
source-grounded concept card. A loading label prevents duplicate requests. Existing API error
messages stay visible, including missing saved source and timeouts. The PDF export includes the
topic's mistake focus and referenced mistake details when present.

## Testing and acceptance criteria

Tests will be written before production changes and will prove that:

1. the prompt/schema preserve source grounding and correctly carry valid, material-local mistake
   identifiers;
2. invalid or cross-material identifiers cannot be rendered as mistake references;
3. the material-detail interaction posts the selected material's mistakes, renders linked details,
   and gracefully supports no mistakes or no saved source;
4. the Dashboard lists eligible material review entries and opens the selected material;
5. review PDF output includes personalized mistake content without regressing existing exports.

Focused tests, the full test suite, typecheck, lint, and production build are required before the
feature is reported complete.

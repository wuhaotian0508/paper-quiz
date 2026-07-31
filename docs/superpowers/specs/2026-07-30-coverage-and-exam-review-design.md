# Coverage-controlled Quiz and Exam Review Design

## Goal

Generate a study quiz that deliberately covers distinct concepts in the uploaded material, and
generate a concise, source-grounded pre-exam review sheet from that material.

## Quiz Coverage and Duplicate Prevention

Quiz generation has two model stages. First, PaperQuiz requests a compact topic outline from the
source: each topic has a distinct title, a testable concept list, and a source note. The requested
question count bounds the outline size.

Second, PaperQuiz provides the outline with the source material and asks for exactly the requested
questions. Every question includes `topic` and `assessmentTarget`. Questions must use distinct
assessment targets and spread across topics before reusing one.

Before a quiz reaches the learner, the server rejects repeated normalized prompts, repeated
normalized assessment targets, outline-external topics, and topic-count spreads greater than one.
It makes one corrective regeneration request with the validation problem, then returns a retry
error rather than serving duplicates if the corrected response remains invalid.

`topic` and `assessmentTarget` are saved question metadata. They are not required in the current
answering UI, but provide a stable foundation for later coverage and mastery views.

## Exam Review Sheet

The material detail page receives a `Generate exam review` action when its original source is
available. It calls a dedicated endpoint that returns 4--8 source-grounded topic cards. Each card
contains a topic, essential ideas, a formula or procedure when present, a common confusion, and a
source note. It is an exam revision aid and makes no claim that the learner may bring it into an
exam.

The UI renders the result in the existing review-sheet style and uses the existing jsPDF renderer
to export a normal A4 document with source notes. It does not pretend the output will fit one page.

## Boundaries and Tests

The new routes retain existing PDF/transcript limits, temporary-source cleanup, source-file reuse,
OpenAI configuration, and duration rules. New tests prove the schema and prompt contracts,
duplicate and imbalance rejection, exam-review parsing and export, route validation, and the
material-detail user flow.

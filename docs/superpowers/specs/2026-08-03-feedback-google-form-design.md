# Google Form Feedback Link Design

## Goal

Send every PaperQuiz feedback action to the supplied public Google Form instead
of opening a pre-addressed email draft.

## Scope

`lib/feedback.ts` remains the single source for feedback destinations. Its
`createFeedbackHref` function will return this exact responder URL:

`https://docs.google.com/forms/d/e/1FAIpQLSdgqSIBtVjXqOVEsb586N1_vdIAcYz-ce-54pfxERikOGudRQ/viewform`

The Help Center's empty-search action and the Product Help Chat's unsupported-
question action already consume this function, so both will open the form
without component-specific links or duplicate constants.

## Behavior

- Selecting any `Send feedback` action opens the Google Form in the browser.
- Existing feedback context, such as the unmatched Help search or chatbot
  question, is not appended to the URL because this form has no verified
  prefill field mapping.
- The feedback helper's optional context argument can remain compatible with
  existing callers while no longer changing the destination.

## Testing

- Update the feedback-helper unit test to assert the exact Google Form URL.
- Update the Help Center and Product Help Chat component tests to assert that
  their feedback links use that same URL.
- Run the affected tests, then the repository's normal typecheck, lint,
  formatting, and production build checks.

## Out Of Scope

- Changing the Google Form questions or access settings.
- Adding Google Forms prefill parameters, analytics, or a backend endpoint.
- Changing any unrelated styling or user-owned uncommitted files.

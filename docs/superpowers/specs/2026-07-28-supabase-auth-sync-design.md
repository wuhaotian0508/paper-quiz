# Supabase Auth and Cross-Device Study Sync Design

## Goal

Let students sign in with either an email Magic Link or Google, then securely sync their Paper Plane Quiz practice history and Mistake book across devices.

## Scope

- Keep guest use available. A student can still generate and practise quizzes before signing in.
- Add Email Magic Link and Google OAuth to the same Supabase account system.
- On first sign-in, automatically migrate the current browser's stored practice history and Mistake book into the signed-in account.
- Sync future changes to practice history and mistakes across devices.
- Keep original uploaded PDF and audio files out of Supabase.
- Keep the existing question-specific tutor and the local product-help chatbot unchanged.

## Authentication Experience

The header shows a `Sign in` action for guests. It opens a compact authentication panel with two choices:

1. Enter an email address to receive a Magic Link.
2. Continue with Google.

Both providers return to `/auth/callback`, which exchanges the code for a Supabase session and returns the user to the quiz home page. Once signed in, the header displays the student's email or Google identity and a `Sign out` action.

If the Email provider or Google provider reports a failure, the panel keeps the user's email entry and shows an actionable message. Signing out ends cloud synchronization but deliberately keeps the browser's local study data.

## Cloud Data Model

Use two public-schema tables with typed JSON payloads:

- `paper_quiz_sessions`: `user_id uuid`, `id text`, `payload jsonb`, `updated_at timestamptz`.
- `paper_quiz_mistakes`: `user_id uuid`, `id text`, `payload jsonb`, `updated_at timestamptz`.

Each table has a composite primary key of `(user_id, id)`. Every select, insert, update, and delete policy uses `auth.uid() = user_id`. The browser uses only the public Supabase URL and publishable key; no service-role key is added to Vercel or browser code.

`payload` stores the existing persisted session or mistake entry unchanged. This preserves questions, answers, grades, and source metadata without a data-model rewrite. The original study file is never stored in Supabase. A stored transcript may be part of existing session metadata and therefore is synced only after the user signs in and accepts the automatic migration described in this design.

## Sync Rules

At startup, the workspace still loads its existing localStorage values immediately. After a user session is available:

1. Read that user's remote sessions and mistakes.
2. Merge local and remote values by record ID, choosing the later `updated_at` or existing entry timestamp when both exist.
3. Write the merged result to localStorage so the current device has an offline copy.
4. Upsert merged records to Supabase and remove remote rows only when the user explicitly clears the corresponding local entry.
5. Debounce subsequent changes after practice grading, mistake updates, or clear actions.

The workspace displays `Synced`, `Syncing`, or `Could not sync` beside the account action. A failed sync never deletes local study data. A second device receives remote records on its next page load or explicit refresh.

## Data Boundaries

- The sync covers practice history, answers, grades, questions, Mistake book records, and existing source metadata.
- The sync does not upload the original PDF or audio recording.
- OpenAI file IDs are not portable between devices. A restored subjective question may still require the user to upload its original study material before it can be graded again.
- Product Help remains local-only and does not access Supabase study data.

## Configuration

Add the following browser-safe environment variables locally and to Vercel Production and Preview:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Configure both Email and Google providers in Supabase Auth. Add the local development origin and the production canonical URL as redirect URLs, including `/auth/callback`.

## Testing

- Unit-test local/remote merge behavior, later-record conflict resolution, and remote-row removals.
- Component-test the guest header, Magic Link submission, Google action, signed-in state, sign-out, and sync-state display.
- Mock the Supabase browser client in UI tests; no test uses a production credential.
- Add route tests for callback exchange errors and successful redirect handling.
- Verify RLS with a second test user: one account cannot read or write another account's rows.
- Run the full existing test suite, typecheck, lint, format check, production build, and a real Magic Link plus Google callback before release.

## Out of Scope

- Password-based auth.
- Syncing raw PDF or audio uploads.
- Sharing study data between accounts.
- Replacing the existing OpenAI source-file workflow.

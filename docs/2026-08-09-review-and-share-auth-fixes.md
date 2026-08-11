# Review Sheet and Shared-Link Fixes

## User-visible problems

1. A library item can exist with zero saved questions or practice sets. It previously gave no
   way to attach its original PDF, so its Review Sheet controls stayed disabled.
2. An English interface could still generate an English Review Sheet after the learner requested
   Chinese in the optional brief.
3. A visitor opening a shared quiz or review and choosing **Sign in** should arrive at the
   Dashboard after authentication, rather than being sent back to the shared, read-only page.

## Completed work to verify

- Empty library items can attach their original PDF and use that file to generate a Review Sheet.
- A clear language request in the Review Sheet brief overrides the interface locale. The server
  retries an output that fails the resolved language check and rejects a second mismatch.

## Shared-link authentication work

### Agent A: authentication return target (completed)

- Trace the shared quiz/review **Sign in** link, login page, and `/auth/callback` route.
- Change the return target so an authentication flow initiated from a shared read-only link ends
  at the Dashboard (`/`), without opening redirect abuse.
- Add focused callback/login regression tests.

### Agent B: shared-entry contract and regression audit (completed)

- Trace the shared challenge and shared review surfaces that render the **Sign in** action.
- Ensure both construct the same dashboard-return intent and preserve normal direct login behavior.
- Add or update focused component/page tests; do not change callback logic unless coordinated.

The two shared entry points now link to a clean `/login`, and the callback always redirects to `/`.

## Acceptance checks

- Anonymous shared quiz: Sign in -> successful auth callback -> `/`.
- Anonymous shared review: Sign in -> successful auth callback -> `/`.
- Normal login still lands on `/` and rejected/external redirect targets cannot be used.
- Focused tests, typecheck, lint, format check, and build are recorded separately; existing
  unrelated failures must be identified explicitly rather than hidden.

# Paper Plane Quiz Login Page Design

## Goal

Separate authentication from the study workspace. A visitor without a Supabase session sees only a dedicated `/login` page; the existing dashboard, quiz workspace, help chat, and footer render only after authentication. Signing out returns the visitor to `/login`.

## Visual direction

Use the supplied reference as the visual direction: a warm paper background, navy serif headline, coral primary action, soft mint/yellow accents, and a centered two-column card on desktop. The left panel communicates the product value with “Turn your lectures into better quizzes.” The right panel contains the auth form. On small screens, stack the value panel above the form and keep the form usable without horizontal scrolling.

## Architecture and data flow

- `app/page.tsx` becomes a server-rendered gate. It calls the Supabase server client, checks `auth.getUser()`, and redirects unauthenticated requests to `/login`.
- `app/login/page.tsx` is the public route and renders the dedicated login experience.
- `components/login-view.tsx` owns client-side email magic-link and Google OAuth actions, reusing the current callback route and displaying loading/error/success feedback.
- `components/dashboard-navigation.tsx` keeps the signed-in account and sign-out control for the workspace. `AuthMenu` redirects to `/login` after a successful sign-out.
- The login route stays free of workspace navigation and `ProductHelpChat`, preventing an accidental mixed state.

## Auth behavior

- Email uses Supabase `signInWithOtp` and redirects to `/auth/callback`.
- Google uses Supabase `signInWithOAuth` and redirects to `/auth/callback`.
- Callback errors render a clear alert on `/login?authError=callback`.
- Missing Supabase configuration renders a non-blocking configuration message rather than a broken form.

## Verification

- Typecheck, lint, and the existing Vitest suite pass.
- The public login route contains no dashboard navigation/workspace DOM.
- A signed-out visit to `/` redirects to `/login`; a signed-in visit renders the existing workspace.
- Desktop and narrow viewport screenshots confirm the two-column/stacked responsive layouts.

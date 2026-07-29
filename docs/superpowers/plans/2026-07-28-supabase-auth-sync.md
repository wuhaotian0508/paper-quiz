# Supabase Auth and Study Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Email Magic Link and Google sign-in, then securely synchronize Paper Plane Quiz sessions and Mistake book entries across a user's devices.

**Architecture:** Supabase Auth owns the browser session and `/auth/callback` exchanges OAuth and Magic Link codes for cookies. Existing localStorage remains the offline cache. A pure merge module combines local and remote records by ID and timestamp, while a client hook loads, pushes, and reports the state of user-scoped Supabase rows protected by RLS.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, `@supabase/ssr`, `@supabase/supabase-js`, Supabase Postgres/Auth, Vitest, Testing Library.

---

## File Structure

- Create: `supabase/migrations/20260728000000_paper_quiz_sync.sql` - user-scoped session and mistake tables plus RLS policies.
- Create: `lib/supabase/browser.ts` - singleton browser client using only public Supabase settings.
- Create: `lib/supabase/server.ts` - cookie-aware server client for the callback route.
- Create: `app/auth/callback/route.ts` - exchanges Auth codes and returns to the app.
- Create: `components/auth-menu.tsx` - Email Magic Link, Google action, account display, sign-out, and sync status.
- Create: `components/auth-menu.test.tsx` - auth-panel behavior with a mocked Supabase browser client.
- Create: `lib/study-sync.ts` - data transfer types and deterministic local/remote merge helpers.
- Create: `lib/study-sync.test.ts` - merge and deletion-candidate coverage.
- Create: `hooks/use-study-sync.ts` - authenticated read/merge/write lifecycle and status.
- Create: `hooks/use-study-sync.test.tsx` - hook-level remote load and failed-sync coverage.
- Modify: `.env.example`, `app/page.tsx`, `components/quiz-workspace.tsx`, `components/quiz-workspace.test.tsx`, `package.json`, `package-lock.json`.

### Task 1: Add public Supabase configuration and secure tables

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Create: `supabase/migrations/20260728000000_paper_quiz_sync.sql`

- [ ] **Step 1: Write the failing configuration test**

Create `lib/supabase/config.test.ts`:

```ts
import { expect, it } from "vitest";
import { getSupabasePublicConfig } from "./config";

it("requires both browser-safe Supabase settings", () => {
  expect(() => getSupabasePublicConfig({})).toThrow("Supabase is not configured");
  expect(
    getSupabasePublicConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
    }),
  ).toEqual({ url: "https://example.supabase.co", publishableKey: "public-key" });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- lib/supabase/config.test.ts`

Expected: FAIL because `lib/supabase/config.ts` does not exist.

- [ ] **Step 3: Install Supabase packages and add the configuration helper**

Run:

```powershell
npm.cmd install @supabase/ssr @supabase/supabase-js
```

Create `lib/supabase/config.ts`:

```ts
type PublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

export function getSupabasePublicConfig(env: PublicEnv = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase is not configured");
  return { url, publishableKey };
}
```

Append to `.env.example`:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Create the SQL migration:

```sql
create table public.paper_quiz_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.paper_quiz_mistakes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.paper_quiz_sessions enable row level security;
alter table public.paper_quiz_mistakes enable row level security;

create policy "Users manage their own quiz sessions" on public.paper_quiz_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage their own quiz mistakes" on public.paper_quiz_mistakes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 4: Run the configuration test to verify it passes**

Run: `npm.cmd test -- lib/supabase/config.test.ts`

Expected: PASS with one configuration-contract test.

- [ ] **Step 5: Configure Supabase and Vercel before testing real auth**

In Supabase Dashboard, enable Email and Google providers. Set the redirect URLs to:

```text
http://localhost:3000/auth/callback
https://paper-quiz-ai-amber.vercel.app/auth/callback
```

Run the SQL migration in Supabase SQL Editor. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`, then add the same public values to Vercel Production and Preview environments. Never add a service-role key.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json .env.example lib/supabase/config.ts lib/supabase/config.test.ts supabase/migrations/20260728000000_paper_quiz_sync.sql
git commit -m "feat: configure Supabase study sync"
```

### Task 2: Define and test deterministic sync merging

**Files:**
- Create: `lib/study-sync.ts`
- Create: `lib/study-sync.test.ts`

- [ ] **Step 1: Write failing merge tests**

```ts
import { expect, it } from "vitest";
import { mergeStudyRecords } from "./study-sync";

const record = (id: string, updatedAt: string) => ({ id, updatedAt, value: id });

it("keeps the newest record when two devices changed the same id", () => {
  expect(
    mergeStudyRecords([record("s1", "2026-07-28T10:00:00Z")], [record("s1", "2026-07-28T11:00:00Z")]),
  ).toEqual([record("s1", "2026-07-28T11:00:00Z")]);
});

it("keeps records that exist on only one device", () => {
  expect(
    mergeStudyRecords([record("local", "2026-07-28T10:00:00Z")], [record("remote", "2026-07-28T11:00:00Z")]),
  ).toHaveLength(2);
});
```

- [ ] **Step 2: Run the merge test to verify it fails**

Run: `npm.cmd test -- lib/study-sync.test.ts`

Expected: FAIL because `mergeStudyRecords` does not exist.

- [ ] **Step 3: Implement the merge contract**

```ts
export type SyncRecord = { id: string; updatedAt: string };

export function mergeStudyRecords<T extends SyncRecord>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of [...local, ...remote]) {
    const current = byId.get(item.id);
    if (!current || item.updatedAt > current.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
```

Add adapters that map Supabase rows to `StudySession` and `MistakeBookEntry`, using `createdAt` for legacy sessions that have no update timestamp. Return the union plus a `remoteIdsToDelete` array only for rows the user explicitly removed locally after the initial authenticated merge.

- [ ] **Step 4: Run the merge tests to verify they pass**

Run: `npm.cmd test -- lib/study-sync.test.ts`

Expected: PASS with newer-record and one-device-record coverage.

- [ ] **Step 5: Commit**

```powershell
git add lib/study-sync.ts lib/study-sync.test.ts
git commit -m "feat: merge local and remote study records"
```

### Task 3: Implement Supabase Auth entry points

**Files:**
- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/server.ts`
- Create: `app/auth/callback/route.ts`
- Create: `components/auth-menu.tsx`
- Create: `components/auth-menu.test.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write failing Auth menu tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AuthMenu } from "./auth-menu";

it("sends a Magic Link to the entered email", async () => {
  const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
  render(<AuthMenu client={{ auth: { signInWithOtp } } as never} />);
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "student@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
  expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "student@example.com" }));
});
```

- [ ] **Step 2: Run the Auth menu test to verify it fails**

Run: `npm.cmd test -- components/auth-menu.test.tsx`

Expected: FAIL because `AuthMenu` does not exist.

- [ ] **Step 3: Add browser/server clients, callback, and UI**

Create the browser singleton:

```ts
import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "./config";

let client: ReturnType<typeof createBrowserClient> | undefined;
export function getSupabaseBrowserClient() {
  if (!client) {
    const { url, publishableKey } = getSupabasePublicConfig();
    client = createBrowserClient(url, publishableKey);
  }
  return client;
}
```

Create a cookie-aware server client in `lib/supabase/server.ts` with `createServerClient`, `cookies()`, and `setAll` guarded for Server Component rendering. In `app/auth/callback/route.ts`, exchange `searchParams.get("code")` with `supabase.auth.exchangeCodeForSession(code)`, then redirect to `/`; redirect to `/?authError=callback` when the code is absent or exchange returns an error.

Implement `AuthMenu` as a client component. It subscribes with `onAuthStateChange`, invokes:

```ts
await client.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
});
await client.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: `${window.location.origin}/auth/callback` },
});
```

It renders `Sign in` for guests, `Email me a sign-in link`, `Continue with Google`, email confirmation/error text, and a signed-in email plus `Sign out` action. Add `<AuthMenu />` to the main navigation in `app/page.tsx`.

- [ ] **Step 4: Run tests to verify Auth UI and callback**

Run: `npm.cmd test -- components/auth-menu.test.tsx app/auth/callback/route.test.ts`

Expected: PASS for Magic Link request, Google redirect request, callback success, and callback failure redirect.

- [ ] **Step 5: Commit**

```powershell
git add lib/supabase/browser.ts lib/supabase/server.ts app/auth/callback/route.ts app/auth/callback/route.test.ts components/auth-menu.tsx components/auth-menu.test.tsx app/page.tsx app/page.test.tsx app/globals.css
git commit -m "feat: add Supabase email and Google sign in"
```

### Task 4: Synchronize authenticated study state

**Files:**
- Create: `hooks/use-study-sync.ts`
- Create: `hooks/use-study-sync.test.tsx`
- Modify: `components/quiz-workspace.tsx`
- Modify: `components/quiz-workspace.test.tsx`

- [ ] **Step 1: Write failing lifecycle tests**

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useStudySync } from "./use-study-sync";

it("merges local records after a signed-in user's remote records load", async () => {
  const onHydrate = vi.fn();
  renderHook(() =>
    useStudySync({
      client: fakeSupabaseClientWithUser("user-1", { sessions: [{ id: "remote", createdAt: "2026-07-28" }], mistakes: [] }),
      ready: true,
      sessions: [{ id: "local", createdAt: "2026-07-27" }],
      mistakes: [],
      onHydrate,
    }),
  );
  await waitFor(() => expect(onHydrate).toHaveBeenCalled());
  expect(onHydrate.mock.calls[0][0].sessions.map((item: { id: string }) => item.id)).toEqual(["remote", "local"]);
});
```

- [ ] **Step 2: Run the lifecycle test to verify it fails**

Run: `npm.cmd test -- hooks/use-study-sync.test.tsx`

Expected: FAIL because `useStudySync` does not exist.

- [ ] **Step 3: Implement the hook and wire the workspace**

The hook accepts `{ client, ready, sessions, mistakes, onHydrate }` and returns `{ user, status, refresh, signOut }`. When `ready` and `user` are true, fetch both tables filtered by the authenticated user's RLS policy, merge records through `mergeStudyRecords`, and call `onHydrate` exactly once per user ID. Debounce an upsert of both collections by 600 ms after local mutations. Set status to `syncing`, `synced`, or `error`; preserve local arrays when a fetch or upsert fails.

In `QuizWorkspace`, add a `storageReady` state. Set it only after the current localStorage read effect completes. Pass memoized `onHydrate` to the hook; it must update React state and the existing `MISTAKE_BOOK_KEY` and `STUDY_HISTORY_KEY` local cache with `safeStorageSet`. Render the returned sync status beside the account control without blocking quiz generation, transcription, grading, Help, or the question tutor.

- [ ] **Step 4: Run workspace and hook tests to verify they pass**

Run: `npm.cmd test -- hooks/use-study-sync.test.tsx components/quiz-workspace.test.tsx`

Expected: PASS for automatic local migration, remote merge, offline preservation after a failed sync, and existing quiz behavior.

- [ ] **Step 5: Commit**

```powershell
git add hooks/use-study-sync.ts hooks/use-study-sync.test.tsx components/quiz-workspace.tsx components/quiz-workspace.test.tsx app/globals.css
git commit -m "feat: sync study history across devices"
```

### Task 5: Verify actual Supabase behavior and release

**Files:**
- Modify only if required by a verification failure: files introduced in Tasks 1-4.

- [ ] **Step 1: Run feature tests**

Run:

```powershell
npm.cmd test -- lib/supabase/config.test.ts lib/study-sync.test.ts components/auth-menu.test.tsx app/auth/callback/route.test.ts hooks/use-study-sync.test.tsx components/quiz-workspace.test.tsx
```

Expected: PASS for configuration validation, record merging, both auth entry points, callback handling, sync errors, and existing workspace flows.

- [ ] **Step 2: Run the complete quality gate**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run build
```

Expected: every command exits with code 0.

- [ ] **Step 3: Verify Supabase dashboard and RLS with two real users**

1. Open the deployed app in a fresh browser session and request an Email Magic Link.
2. Complete callback and confirm the header shows the signed-in address.
3. Create one practice record and one mistake, wait for `Synced`, then confirm both rows are visible only under that first user's ID in Supabase Table Editor.
4. Sign in as a second user and confirm neither first-user row can be read or written.
5. Return to the first user on a second device or browser session and confirm the record is restored.
6. Test Google OAuth from the same canonical production URL and confirm its callback creates the same signed-in UI.

- [ ] **Step 4: Deploy and verify production**

Run:

```powershell
npx.cmd vercel --prod --yes
```

Expected: deployment status is `Ready`; the canonical alias is `https://paper-quiz-ai-amber.vercel.app`; Email and Google controls render; a real signed-in user can sync records without browser-console errors.

- [ ] **Step 5: Commit any verification fix**

```powershell
git add .
git commit -m "fix: polish Supabase auth sync"
```

Only stage files that belong to this feature; do not stage unrelated existing changes in the dirty working tree.

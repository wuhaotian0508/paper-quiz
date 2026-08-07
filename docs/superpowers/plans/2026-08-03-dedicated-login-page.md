# Dedicated Login Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a dedicated public login page and protect the existing study workspace behind a Supabase session.

**Architecture:** `app/page.tsx` performs the server-side session gate and redirects signed-out visitors to `/login`. A focused client component owns magic-link/Google actions on the public login route, while the existing workspace navigation retains the signed-in account and logout action.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase SSR/browser clients, Vitest, Testing Library.

---

## File Structure

- Create: `app/login/page.tsx` - public login route and callback-error query handling.
- Create: `app/login/page.test.tsx` - route-level presentation and error regression tests.
- Create: `components/login-view.tsx` - client-side magic-link and Google OAuth UI.
- Create: `components/login-view.test.tsx` - login action and configuration tests.
- Modify: `app/page.tsx` - server-side session gate around the current workspace.
- Modify: `app/page.test.tsx` - signed-out redirect and signed-in workspace tests.
- Modify: `app/auth/callback/route.ts` and `app/auth/callback/route.test.ts` - return callback errors to `/login`.
- Modify: `components/auth-menu.tsx` and `components/auth-menu.test.tsx` - route logout back to `/login`.
- Modify: `app/globals.css` - dedicated responsive login-page presentation.

### Task 1: Add route-gate regression tests

**Files:**
- Modify: `app/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient }));
vi.mock("next/navigation", () => ({ redirect }));

it("redirects a visitor without a session to the login route", async () => {
  getSupabaseServerClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
  await Home({ searchParams: Promise.resolve({}) });
  expect(redirect).toHaveBeenCalledWith("/login");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- app/page.test.tsx`

Expected: FAIL because `Home` does not request a session or redirect.

- [ ] **Step 3: Add the smallest session gate**

```tsx
const supabase = await getSupabaseServerClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- app/page.test.tsx`

Expected: PASS.

### Task 2: Add the standalone login view with tests

**Files:**
- Create: `components/login-view.tsx`
- Create: `components/login-view.test.tsx`
- Create: `app/login/page.tsx`
- Create: `app/login/page.test.tsx`

- [ ] **Step 1: Write failing component and route tests**

```tsx
render(<LoginView client={client} />);
expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- components/login-view.test.tsx app/login/page.test.tsx`

Expected: FAIL because neither the component nor route exists.

- [ ] **Step 3: Implement the focused public auth form**

```tsx
<main className="login-page">
  <section className="login-card">
    <div className="login-story">...</div>
    <LoginView authError={authError === "callback"} />
  </section>
</main>
```

The form must use `signInWithOtp` and `signInWithOAuth` with `/auth/callback`, show API/configuration feedback, and contain no workspace navigation or help-chat components.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- components/login-view.test.tsx app/login/page.test.tsx`

Expected: PASS.

### Task 3: Align callback and sign-out behavior with the public route

**Files:**
- Modify: `app/auth/callback/route.ts`
- Modify: `app/auth/callback/route.test.ts`
- Modify: `components/auth-menu.tsx`
- Modify: `components/auth-menu.test.tsx`

- [ ] **Step 1: Write failing callback/logout assertions**

```tsx
expect(response.headers.get("location")).toBe(
  "https://paper-quiz-ai-amber.vercel.app/login?authError=callback",
);
```

```tsx
await user.click(screen.getByRole("button", { name: "Sign out" }));
expect(window.location.assign).toHaveBeenCalledWith("/login");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/auth/callback/route.test.ts components/auth-menu.test.tsx`

Expected: FAIL because callback errors route to `/` and logout only closes the menu.

- [ ] **Step 3: Implement the route updates**

```ts
return NextResponse.redirect(new URL("/login?authError=callback", trustedOrigin(request)));
```

```ts
window.location.assign("/login");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/auth/callback/route.test.ts components/auth-menu.test.tsx`

Expected: PASS.

### Task 4: Add responsive presentation and validate the application

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Write the failing CSS contract test**

```tsx
expect(stylesheet).toContain(".login-page {");
expect(stylesheet).toContain("@media (max-width: 760px)");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- components/login-view.test.tsx`

Expected: FAIL because the dedicated classes do not exist.

- [ ] **Step 3: Implement the warm two-column desktop and stacked mobile styles**

Use CSS variables already present in `app/globals.css`; preserve light/dark color readability and do not modify unrelated dashboard rules.

- [ ] **Step 4: Run full validation**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: every command exits `0`.

- [ ] **Step 5: Visually validate both breakpoints**

Run the development server, open `/login`, and capture desktop plus narrow viewport screenshots. Confirm the workspace is absent from the login route, then confirm a sessionless `/` request redirects to `/login`.

- [ ] **Step 6: Commit only feature-owned files**

```bash
git add app/page.tsx app/page.test.tsx app/login components/login-view.tsx components/login-view.test.tsx app/auth/callback/route.ts app/auth/callback/route.test.ts components/auth-menu.tsx components/auth-menu.test.tsx app/globals.css docs/superpowers/plans/2026-08-03-dedicated-login-page.md
git commit -m "feat: separate login from study workspace"
```

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthMenu, type AuthClient } from "./auth-menu";

function createClient(): AuthClient {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("sends a Magic Link to the entered email", async () => {
  const client = createClient();
  render(<AuthMenu client={client} />);

  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "student@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

  await waitFor(() =>
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "student@example.com",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
    }),
  );
  expect(screen.getByText("Check your inbox for a sign-in link.")).toBeInTheDocument();
});

it("starts Google OAuth with the app callback URL", async () => {
  const client = createClient();
  render(<AuthMenu client={client} />);

  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

  await waitFor(() =>
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback" },
    }),
  );
});

it("shows the signed-in email from the initial browser session", async () => {
  const client = createClient();
  client.auth.getSession = vi.fn().mockResolvedValue({
    data: { session: { user: { email: "student@example.com" } } },
  });
  render(<AuthMenu client={client} />);

  expect(await screen.findByText("student@example.com")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
});

it("shows sync status only after a user has signed in", async () => {
  const client = createClient();
  client.auth.getSession = vi.fn().mockResolvedValue({
    data: { session: { user: { email: "student@example.com" } } },
  });
  render(<AuthMenu client={client} />);

  expect(await screen.findByText("Sync ready")).toBeInTheDocument();
  window.dispatchEvent(new CustomEvent("paper-quiz-sync-status", { detail: "synced" }));
  expect(await screen.findByText("Synced")).toBeInTheDocument();
});

it("explains when Supabase sign-in is unavailable", () => {
  render(<AuthMenu unavailableReason="Supabase is not configured" />);

  expect(screen.getByText("Sign-in unavailable")).toBeInTheDocument();
  expect(screen.getByText(/configure Supabase/i)).toBeInTheDocument();
});

it("uses theme variables instead of fixed light Auth menu backgrounds", () => {
  const stylesheet = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
  const authStart = stylesheet.indexOf(".auth-menu {");
  const authStyles = stylesheet.slice(authStart, stylesheet.indexOf(".site-footer", authStart));

  expect(authStyles).toContain("background: var(--white);");
  expect(authStyles).not.toContain("#fffdf8");
  expect(authStyles).not.toContain("rgba(255, 255, 255, 0.78)");
});

it("keeps Progress cards and their text readable in dark mode", () => {
  const stylesheet = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
  const darkThemeStart = stylesheet.indexOf(':root[data-theme="dark"] {');
  const darkThemeStyles = stylesheet.slice(
    darkThemeStart,
    stylesheet.indexOf("@media", darkThemeStart),
  );

  expect(darkThemeStyles).toContain("--ink: #f4f1e8;");
  expect(darkThemeStyles).toContain("--muted: #b4b8c5;");
  expect(stylesheet).toContain(
    ':root[data-theme="dark"] .progress-card {\n  background: rgba(36, 41, 54, 0.84);\n}',
  );
});

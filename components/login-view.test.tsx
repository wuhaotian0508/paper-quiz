import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LoginView } from "./login-view";
import type { AuthClient } from "./auth-menu";

function createClient(): AuthClient {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: vi
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve(
          name === "paper_quiz_email_for_login"
            ? { data: "student@example.com", error: null }
            : { data: true, error: null },
        ),
      ),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("renders a standalone sign-in form without workspace navigation", () => {
  render(<LoginView client={createClient()} />);

  expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Log in" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Register" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
});

it("logs in with an email and password", async () => {
  const client = createClient();
  const assign = vi.fn();
  render(<LoginView client={client} returnTo="/review/review-123" onAuthenticated={assign} />);

  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "student@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "correct-horse-battery" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));

  await waitFor(() =>
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "student@example.com",
      password: "correct-horse-battery",
    }),
  );
  expect(assign).toHaveBeenCalledWith("/review/review-123");
});

it("signs in without the database function that password login used to need", async () => {
  const client = createClient();
  render(<LoginView client={client} />);

  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "student@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));

  // Resolving a username through `paper_quiz_email_for_login` failed for every learner,
  // because the migration defining it was never applied. Sign-in must not depend on it.
  await waitFor(() => expect(client.auth.signInWithPassword).toHaveBeenCalled());
  expect(client.rpc).not.toHaveBeenCalled();
});

it("asks for an email rather than a username on the password login tab", () => {
  render(<LoginView client={createClient()} />);

  expect(screen.getByLabelText("Email")).toBeInTheDocument();
  expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
});

it("surfaces a rejected sign-in without navigating", async () => {
  const client = createClient();
  client.auth.signInWithPassword = vi
    .fn()
    .mockResolvedValue({ error: { message: "Invalid login credentials" } });
  const assign = vi.fn();
  render(<LoginView client={client} onAuthenticated={assign} />);

  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "student@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));

  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Invalid login credentials"),
  );
  expect(assign).not.toHaveBeenCalled();
});

it("registers with an email and a password", async () => {
  const client = createClient();
  render(<LoginView client={client} returnTo="/review/review-123" />);

  fireEvent.click(screen.getByRole("tab", { name: "Register" }));
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "student@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "correct-horse-battery" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() =>
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "student@example.com",
      password: "correct-horse-battery",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback?returnTo=%2Freview%2Freview-123",
      },
    }),
  );
});

it("asks for no username on either tab, and checks none in the database", async () => {
  const client = createClient();
  render(<LoginView client={client} />);

  expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Register" }));
  expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw1234" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  // `paper_quiz_username_available` and the profile table it guarded were never applied,
  // so the check always passed and the name was never stored.
  await waitFor(() => expect(client.auth.signUp).toHaveBeenCalled());
  expect(client.rpc).not.toHaveBeenCalled();
});

it("can send a magic link back to the shared artifact", async () => {
  const client = createClient();
  render(<LoginView client={client} returnTo="/review/review-123" />);

  fireEvent.click(screen.getByRole("tab", { name: "Email link" }));
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "student@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));

  await waitFor(() =>
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "student@example.com",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback?returnTo=%2Freview%2Freview-123",
      },
    }),
  );
});

it("starts Google OAuth from the dedicated login page", async () => {
  const client = createClient();
  render(<LoginView client={client} returnTo="/challenge/share-123" />);

  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

  await waitFor(() =>
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/auth/callback?returnTo=%2Fchallenge%2Fshare-123",
      },
    }),
  );
});

it("shows callback errors as an alert", () => {
  render(<LoginView client={createClient()} authError />);

  expect(screen.getByRole("alert")).toHaveTextContent(/sign-in didn't finish/i);
});

it("shows a configuration message when Supabase is unavailable", () => {
  render(<LoginView unavailableReason="Supabase is not configured" />);

  expect(screen.getByText("Sign-in unavailable")).toBeInTheDocument();
  expect(screen.getByText(/configure Supabase/i)).toBeInTheDocument();
});

it("defines responsive styles for the isolated login layout", () => {
  const stylesheet = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

  expect(stylesheet).toContain(".login-page {");
  expect(stylesheet).toContain(".login-card {");
  expect(stylesheet).toContain("@media (max-width: 760px)");
});

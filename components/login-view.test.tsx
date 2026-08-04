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
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("renders a standalone sign-in form without workspace navigation", () => {
  render(<LoginView client={createClient()} />);

  expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
});

it("sends a magic link to the entered email", async () => {
  const client = createClient();
  render(<LoginView client={client} />);

  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "student@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));

  await waitFor(() =>
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "student@example.com",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
    }),
  );
  expect(screen.getByRole("status")).toHaveTextContent(/check your inbox/i);
});

it("starts Google OAuth from the dedicated login page", async () => {
  const client = createClient();
  render(<LoginView client={client} />);

  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

  await waitFor(() =>
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback" },
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

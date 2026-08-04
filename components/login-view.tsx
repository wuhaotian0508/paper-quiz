"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AuthClient } from "@/components/auth-menu";

type LoginViewProps = {
  client?: AuthClient;
  unavailableReason?: string;
  authError?: boolean;
};

export function LoginView({ client, unavailableReason, authError = false }: LoginViewProps) {
  const [authClient, setAuthClient] = useState<AuthClient | null>(client ?? null);
  const [configurationError, setConfigurationError] = useState(unavailableReason ?? "");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (unavailableReason || client) return;

    try {
      setAuthClient(getSupabaseBrowserClient() as unknown as AuthClient);
    } catch (error) {
      setConfigurationError(error instanceof Error ? error.message : "Supabase is unavailable");
    }
  }, [client, unavailableReason]);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setMessage("Enter your email address to receive a sign-in link.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    const { error } = await authClient.auth.signInWithOtp({
      email: trimmedEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setIsSubmitting(false);
    setMessage(error ? error.message : "Check your inbox for a sign-in link.");
  }

  async function signInWithGoogle() {
    if (!authClient) return;

    setIsSubmitting(true);
    setMessage("");
    const { error } = await authClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    setIsSubmitting(false);
    if (error) setMessage(error.message);
  }

  return (
    <div className="login-form-panel">
      <div className="login-form-heading">
        <p className="login-kicker">Your study space</p>
        <h1>Welcome back!</h1>
        <p>Log in to continue to your account.</p>
      </div>
      {authError ? (
        <p className="login-alert" role="alert">
          Sign-in didn&apos;t finish. Please try again.
        </p>
      ) : null}
      {configurationError ? (
        <div className="login-unavailable" role="status">
          <strong>Sign-in unavailable</strong>
          <span>Configure Supabase to enable account sync.</span>
        </div>
      ) : (
        <>
          <form className="login-form" onSubmit={(event) => void sendMagicLink(event)}>
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
            <p className="login-field-note">We&apos;ll send a secure sign-in link to your inbox.</p>
            <button type="submit" className="login-primary-button" disabled={isSubmitting || !authClient}>
              {isSubmitting ? "Sending..." : "Log in"}
            </button>
          </form>
          <div className="login-divider" aria-hidden="true">
            <span>or continue with</span>
          </div>
          <button
            type="button"
            className="login-provider-button"
            onClick={() => void signInWithGoogle()}
            disabled={isSubmitting || !authClient}
          >
            <span className="login-provider-icon" aria-hidden="true">
              G
            </span>
            Continue with Google
          </button>
          {message ? (
            <p className="login-message" role="status">
              {message}
            </p>
          ) : null}
        </>
      )}
      <p className="login-legal">
        By logging in, you agree to our <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.
      </p>
    </div>
  );
}


"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AuthClient } from "@/components/auth-menu";

type LoginViewProps = {
  client?: AuthClient;
  unavailableReason?: string;
  authError?: boolean;
  returnTo?: string;
  onAuthenticated?: (destination: string) => void;
};

type LoginMethod = "password" | "magic-link";

export function LoginView({
  client,
  unavailableReason,
  authError = false,
  returnTo = "",
  onAuthenticated,
}: LoginViewProps) {
  const [authClient, setAuthClient] = useState<AuthClient | null>(client ?? null);
  const [configurationError, setConfigurationError] = useState(unavailableReason ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");
  const [isSignUp, setIsSignUp] = useState(false);
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
      options: { emailRedirectTo: authRedirectUrl(returnTo) },
    });
    setIsSubmitting(false);
    setMessage(error ? error.message : "Check your inbox for a sign-in link.");
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage("Enter your email and password.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    const result = isSignUp
      ? await authClient.auth.signUp({
          email: trimmedEmail,
          password,
          options: { emailRedirectTo: authRedirectUrl(returnTo) },
        })
      : await authClient.auth.signInWithPassword({ email: trimmedEmail, password });
    setIsSubmitting(false);
    if (result.error) {
      setMessage(result.error.message);
    } else if (isSignUp) {
      setMessage("Account created. Check your inbox if email confirmation is required.");
    } else {
      (onAuthenticated ?? ((destination: string) => window.location.assign(destination)))(
        safeReturnTo(returnTo),
      );
    }
  }

  async function signInWithGoogle() {
    if (!authClient) return;

    setIsSubmitting(true);
    setMessage("");
    const { error } = await authClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authRedirectUrl(returnTo) },
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
          <div className="login-method-switch" role="tablist" aria-label="Sign-in method">
            <button
              type="button"
              role="tab"
              aria-selected={loginMethod === "password"}
              className={loginMethod === "password" ? "is-active" : ""}
              onClick={() => setLoginMethod("password")}
            >
              Password
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={loginMethod === "magic-link"}
              className={loginMethod === "magic-link" ? "is-active" : ""}
              onClick={() => setLoginMethod("magic-link")}
            >
              Email link
            </button>
          </div>
          <form
            className="login-form"
            onSubmit={(event) =>
              void (loginMethod === "password" ? submitPassword(event) : sendMagicLink(event))
            }
          >
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
            {loginMethod === "password" ? (
              <>
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  minLength={6}
                  required
                />
                <p className="login-field-note">Use at least 6 characters.</p>
              </>
            ) : (
              <p className="login-field-note">
                We&apos;ll send a secure sign-in link to your inbox.
              </p>
            )}
            <button
              type="submit"
              className="login-primary-button"
              disabled={isSubmitting || !authClient}
            >
              {isSubmitting
                ? loginMethod === "magic-link"
                  ? "Sending..."
                  : "Working..."
                : isSignUp
                  ? "Create account"
                  : "Log in"}
            </button>
          </form>
          {loginMethod === "password" ? (
            <button
              type="button"
              className="login-text-button"
              onClick={() => setIsSignUp((value) => !value)}
            >
              {isSignUp ? "Already have an account? Log in" : "New here? Create an account"}
            </button>
          ) : null}
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
        By logging in, you agree to our <a href="#terms">Terms of Service</a> and{" "}
        <a href="#privacy">Privacy Policy</a>.
      </p>
    </div>
  );
}

function authRedirectUrl(returnTo: string) {
  const callback = new URL("/auth/callback", window.location.origin);
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    callback.searchParams.set("returnTo", returnTo);
  }
  return callback.toString();
}

function safeReturnTo(returnTo: string) {
  return returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthSession = { user: { email?: string | null } } | null;
type AuthResult = { error: { message: string } | null };

export type AuthClient = {
  auth: {
    getSession: () => Promise<{ data: { session: AuthSession } }>;
    onAuthStateChange: (callback: (event: string, session: AuthSession) => void) => {
      data: { subscription: { unsubscribe: () => void } };
    };
    signInWithOtp: (options: {
      email: string;
      options: { emailRedirectTo: string };
    }) => Promise<AuthResult>;
    signInWithOAuth: (options: {
      provider: "google";
      options: { redirectTo: string };
    }) => Promise<AuthResult>;
    signOut: () => Promise<AuthResult>;
  };
};

type AuthMenuProps = {
  client?: AuthClient;
  unavailableReason?: string;
  authError?: boolean;
  onSignedOut?: () => void;
};

type SyncStatus = "idle" | "syncing" | "synced" | "error";

const syncStatusLabels: Record<SyncStatus, string> = {
  idle: "Sync ready",
  syncing: "Syncing",
  synced: "Synced",
  error: "Sync error",
};

export function AuthMenu({
  client,
  unavailableReason,
  authError = false,
  onSignedOut,
}: AuthMenuProps) {
  const [authClient, setAuthClient] = useState<AuthClient | null>(client ?? null);
  const [configurationError, setConfigurationError] = useState(unavailableReason ?? "");
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  useEffect(() => {
    function updateSyncStatus(event: Event) {
      const status = (event as CustomEvent<unknown>).detail;
      if (status === "idle" || status === "syncing" || status === "synced" || status === "error") {
        setSyncStatus(status);
      }
    }

    window.addEventListener("paper-quiz-sync-status", updateSyncStatus);
    return () => window.removeEventListener("paper-quiz-sync-status", updateSyncStatus);
  }, []);

  useEffect(() => {
    if (unavailableReason) return;

    let active = true;
    let resolvedClient = client;
    if (!resolvedClient) {
      try {
        resolvedClient = getSupabaseBrowserClient() as unknown as AuthClient;
      } catch (error) {
        if (active) {
          setConfigurationError(error instanceof Error ? error.message : "Supabase is unavailable");
        }
        return;
      }
    }

    setAuthClient(resolvedClient);
    const {
      data: { subscription },
    } = resolvedClient.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserEmail(session?.user.email ?? null);
      if (session) setIsOpen(false);
    });

    void resolvedClient.auth.getSession().then(({ data }) => {
      if (active) setUserEmail(data.session?.user.email ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
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

  async function signOut() {
    if (!authClient) return;

    setIsSubmitting(true);
    const { error } = await authClient.auth.signOut();
    setIsSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setUserEmail(null);
    setIsOpen(false);
    setMessage("");
    if (onSignedOut) {
      onSignedOut();
    } else {
      window.location.assign("/login");
    }
  }

  if (configurationError) {
    return (
      <div className="auth-menu auth-menu-unavailable" role="status">
        <strong>Sign-in unavailable</strong>
        {authError ? (
          <span className="auth-error" role="alert">
            Sign-in didn&apos;t finish. Please try again.
          </span>
        ) : null}
        <span>Configure Supabase to enable account sync.</span>
      </div>
    );
  }

  if (userEmail) {
    return (
      <div className="auth-menu auth-menu-signed-in">
        <span title={userEmail}>{userEmail}</span>
        <span className={`auth-sync-status auth-sync-status-${syncStatus}`} role="status">
          {syncStatusLabels[syncStatus]}
        </span>
        <button type="button" onClick={() => void signOut()} disabled={isSubmitting}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="auth-menu">
      {authError ? (
        <span className="auth-error" role="alert">
          Sign-in didn&apos;t finish. Please try again.
        </span>
      ) : null}
      <button type="button" className="auth-trigger" onClick={() => setIsOpen((open) => !open)}>
        Sign in
      </button>
      {isOpen ? (
        <div className="auth-panel">
          <strong>Keep your study progress</strong>
          <p>Sign in to sync your practice history and mistake book across devices.</p>
          <form onSubmit={(event) => void sendMagicLink(event)}>
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
            <button type="submit" className="primary-button" disabled={isSubmitting || !authClient}>
              Email me a sign-in link
            </button>
          </form>
          <div className="auth-divider">or</div>
          <button
            type="button"
            className="auth-google-button"
            onClick={() => void signInWithGoogle()}
            disabled={isSubmitting || !authClient}
          >
            Continue with Google
          </button>
          {message ? (
            <p className="auth-message" role="status">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

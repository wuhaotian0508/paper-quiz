"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useLocale } from "@/hooks/use-locale";
import type { MessageKey } from "@/lib/i18n";

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
    signInWithPassword: (options: { email: string; password: string }) => Promise<AuthResult>;
    signUp: (options: {
      email: string;
      password: string;
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

const syncStatusLabels: Record<SyncStatus, MessageKey> = {
  idle: "auth.syncIdle",
  syncing: "auth.syncSyncing",
  synced: "auth.syncSynced",
  error: "auth.syncError",
};

export function AuthMenu({
  client,
  unavailableReason,
  authError = false,
  onSignedOut,
}: AuthMenuProps) {
  const { t } = useLocale();
  const [authClient, setAuthClient] = useState<AuthClient | null>(client ?? null);
  const [configurationError, setConfigurationError] = useState(unavailableReason ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMethod, setLoginMethod] = useState<"password" | "magic-link">("password");
  const [isSignUp, setIsSignUp] = useState(false);
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
          setConfigurationError(
            error instanceof Error ? error.message : t("auth.supabaseUnavailable"),
          );
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
  }, [client, t, unavailableReason]);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setMessage(t("auth.enterEmailForLink"));
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    const { error } = await authClient.auth.signInWithOtp({
      email: trimmedEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setIsSubmitting(false);
    setMessage(error ? error.message : t("auth.checkInbox"));
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

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage(t("auth.enterEmailAndPassword"));
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    const result = isSignUp
      ? await authClient.auth.signUp({
          email: trimmedEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
      : await authClient.auth.signInWithPassword({ email: trimmedEmail, password });
    setIsSubmitting(false);
    setMessage(
      result.error
        ? result.error.message
        : isSignUp
          ? t("auth.accountCreated")
          : t("auth.loggedIn"),
    );
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
        <strong>{t("auth.unavailable")}</strong>
        {authError ? (
          <span className="auth-error" role="alert">
            {t("auth.unfinished")}
          </span>
        ) : null}
        <span>{t("auth.configureSupabase")}</span>
      </div>
    );
  }

  if (userEmail) {
    return (
      <div className="auth-menu auth-menu-signed-in">
        <span title={userEmail}>{userEmail}</span>
        <span className={`auth-sync-status auth-sync-status-${syncStatus}`} role="status">
          {t(syncStatusLabels[syncStatus])}
        </span>
        <button type="button" onClick={() => void signOut()} disabled={isSubmitting}>
          {t("auth.signOut")}
        </button>
      </div>
    );
  }

  return (
    <div className="auth-menu">
      {authError ? (
        <span className="auth-error" role="alert">
          {t("auth.unfinished")}
        </span>
      ) : null}
      <button type="button" className="auth-trigger" onClick={() => setIsOpen((open) => !open)}>
        {t("auth.signIn")}
      </button>
      {isOpen ? (
        <div className="auth-panel">
          <strong>{t("auth.panelTitle")}</strong>
          <p>{t("auth.panelNote")}</p>
          <div className="auth-method-switch" role="tablist" aria-label={t("auth.methodAria")}>
            <button
              type="button"
              role="tab"
              aria-selected={loginMethod === "password"}
              className={loginMethod === "password" ? "is-active" : ""}
              onClick={() => setLoginMethod("password")}
            >
              {t("auth.password")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={loginMethod === "magic-link"}
              className={loginMethod === "magic-link" ? "is-active" : ""}
              onClick={() => setLoginMethod("magic-link")}
            >
              {t("auth.emailLink")}
            </button>
          </div>
          <form
            onSubmit={(event) =>
              void (loginMethod === "password" ? submitPassword(event) : sendMagicLink(event))
            }
          >
            <label htmlFor="auth-email">{t("auth.emailAddress")}</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
            {loginMethod === "password" ? (
              <>
                <label htmlFor="auth-password">{t("auth.password")}</label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  minLength={6}
                  required
                />
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSubmitting || !authClient}
                >
                  {isSubmitting
                    ? t("auth.working")
                    : isSignUp
                      ? t("auth.createAccount")
                      : t("auth.logIn")}
                </button>
              </>
            ) : (
              <button
                type="submit"
                className="primary-button"
                disabled={isSubmitting || !authClient}
              >
                {isSubmitting ? t("auth.sending") : t("auth.emailMeLink")}
              </button>
            )}
          </form>
          {loginMethod === "password" ? (
            <button
              type="button"
              className="auth-text-button"
              onClick={() => setIsSignUp((value) => !value)}
            >
              {isSignUp ? t("auth.haveAccount") : t("auth.newHere")}
            </button>
          ) : null}
          <div className="auth-divider">{t("auth.or")}</div>
          <button
            type="button"
            className="auth-google-button"
            onClick={() => void signInWithGoogle()}
            disabled={isSubmitting || !authClient}
          >
            {t("auth.continueWithGoogle")}
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

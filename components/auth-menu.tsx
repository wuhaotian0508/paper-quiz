"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useLocale } from "@/hooks/use-locale";
import type { MessageKey } from "@/lib/i18n";
import {
  EMPTY_USAGE,
  formatCost,
  freeAllowance,
  readUsage,
  usageProgress,
  USAGE_METER_KEY,
  USAGE_METER_UPDATED_EVENT,
  type UsageTotals,
} from "@/lib/usage-meter";
import { CREDIT_OPTIONS } from "@/lib/credit-options";

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
      options: { emailRedirectTo: string; data?: Record<string, string> };
    }) => Promise<AuthResult>;
    signInWithOAuth: (options: {
      provider: "google";
      options: { redirectTo: string };
    }) => Promise<AuthResult>;
    signOut: () => Promise<AuthResult>;
  };
  /** Username lookups run through security-definer functions; see the profiles migration. */
  rpc?: (
    name: string,
    params: Record<string, string>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
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
  const [usage, setUsage] = useState<UsageTotals>(EMPTY_USAGE);
  /** The account row is a usage bar by default; identity and sign-out sit behind Settings. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState("");

  /**
   * Buying credit ahead of billing. Practice stays free and unlimited, so this is never a
   * gate the learner has to pass - it is only offered inside Settings.
   */
  const startCheckout = async (option: string) => {
    setCheckoutStatus(t("usage.openingCheckout"));
    try {
      const body = new FormData();
      body.set("option", option);
      const response = await fetch("/api/checkout", { method: "POST", body });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || t("usage.checkoutFailed"));
      window.location.assign(data.url);
    } catch (cause) {
      setCheckoutStatus(cause instanceof Error ? cause.message : t("usage.checkoutFailed"));
    }
  };

  useEffect(() => {
    const syncUsage = () => setUsage(readUsage(window.localStorage.getItem(USAGE_METER_KEY)));
    syncUsage();
    window.addEventListener(USAGE_METER_UPDATED_EVENT, syncUsage);
    window.addEventListener("storage", syncUsage);
    return () => {
      window.removeEventListener(USAGE_METER_UPDATED_EVENT, syncUsage);
      window.removeEventListener("storage", syncUsage);
    };
  }, []);

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
    const allowance = freeAllowance();
    const overAllowance = usage.cost > allowance;
    return (
      <div className="auth-menu auth-menu-signed-in">
        <button
          type="button"
          className="auth-settings-toggle"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          {t("auth.settings")}
        </button>
        {settingsOpen ? (
          <div className="auth-settings-panel">
            <div className="usage-bar-block">
              <div className="usage-bar-row">
                <span>{t("usage.thisBrowser")}</span>
                <strong>{formatCost(usage.cost)}</strong>
              </div>
              <div
                className="usage-bar-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(usageProgress(usage.cost, allowance) * 100)}
                aria-label={t("usage.barAria")}
              >
                <span
                  className={`usage-bar-fill ${overAllowance ? "is-over" : ""}`}
                  style={{ width: `${usageProgress(usage.cost, allowance) * 100}%` }}
                />
              </div>
              <small>
                {overAllowance
                  ? t("usage.overAllowance")
                  : t("usage.ofAllowance", { allowance: formatCost(allowance) })}
              </small>
              {/* Deliberately not a checkout: paying is not wired up, and a button that looked
              like it was would be worse than saying plainly that nothing is charged. */}
              <small className="usage-bar-note">{t("usage.notChargedShort")}</small>
            </div>
            <div className="usage-topup">
              <small>{t("usage.addCredit")}</small>
              <div className="usage-topup-options">
                {CREDIT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => void startCheckout(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {checkoutStatus ? (
                <small role="status" className="usage-topup-status">
                  {checkoutStatus}
                </small>
              ) : null}
            </div>
            <span className="auth-settings-email" title={userEmail}>
              {userEmail}
            </span>
            <span className={`auth-sync-status auth-sync-status-${syncStatus}`} role="status">
              {t(syncStatusLabels[syncStatus])}
            </span>
            <button type="button" onClick={() => void signOut()} disabled={isSubmitting}>
              {t("auth.signOut")}
            </button>
          </div>
        ) : null}
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

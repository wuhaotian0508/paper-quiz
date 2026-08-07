"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AuthClient } from "@/components/auth-menu";
import { normalizeUsername, usernameError } from "@/lib/auth-username";
import { useLocale } from "@/hooks/use-locale";

type LoginViewProps = {
  client?: AuthClient;
  unavailableReason?: string;
  authError?: boolean;
  returnTo?: string;
  onAuthenticated?: (destination: string) => void;
};

type AuthMode = "login" | "register";
type LoginMethod = "password" | "magic-link";

export function LoginView({
  client,
  unavailableReason,
  authError = false,
  returnTo = "",
  onAuthenticated,
}: LoginViewProps) {
  const { t } = useLocale();
  const [authClient, setAuthClient] = useState<AuthClient | null>(client ?? null);
  const [configurationError, setConfigurationError] = useState(unavailableReason ?? "");
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (unavailableReason || client) return;

    try {
      setAuthClient(getSupabaseBrowserClient() as unknown as AuthClient);
    } catch (error) {
      setConfigurationError(error instanceof Error ? error.message : t("auth.supabaseUnavailable"));
    }
  }, [client, t, unavailableReason]);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setMessage("");
    if (next === "register") setLoginMethod("password");
  };

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
      options: { emailRedirectTo: authRedirectUrl(returnTo) },
    });
    setIsSubmitting(false);
    setMessage(error ? error.message : t("auth.checkInbox"));
  }

  async function logIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient) return;

    const name = normalizeUsername(username);
    if (!name || !password) {
      setMessage(t("auth.enterUsernameAndPassword"));
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    // The account is keyed by email in Supabase Auth, so resolve the username first.
    // The function only answers once the password checks out, so a wrong password and
    // an unknown username are indistinguishable from here.
    const lookup = await authClient.rpc?.("paper_quiz_email_for_login", {
      p_username: name,
      p_password: password,
    });
    const resolvedEmail = typeof lookup?.data === "string" ? lookup.data : "";
    if (lookup?.error || !resolvedEmail) {
      setIsSubmitting(false);
      setMessage(lookup?.error?.message || t("auth.usernameNotFound"));
      return;
    }

    const { error } = await authClient.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });
    setIsSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    (onAuthenticated ?? ((destination: string) => window.location.assign(destination)))(
      safeReturnTo(returnTo),
    );
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient) return;

    const invalid = usernameError(username);
    if (invalid) {
      setMessage(t(invalid));
      return;
    }
    const name = normalizeUsername(username);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage(t("auth.enterEmailAndPassword"));
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    // Checked up front so the common collision produces a clear message rather than a
    // unique-constraint failure from the trigger that creates the profile row.
    const availability = await authClient.rpc?.("paper_quiz_username_available", {
      p_username: name,
    });
    if (availability?.data === false) {
      setIsSubmitting(false);
      setMessage(t("auth.usernameTaken"));
      return;
    }

    const { error } = await authClient.auth.signUp({
      email: trimmedEmail,
      password,
      options: { emailRedirectTo: authRedirectUrl(returnTo), data: { username: name } },
    });
    setIsSubmitting(false);
    setMessage(error ? error.message : t("auth.accountCreated"));
    if (!error) setMode("login");
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

  const registering = mode === "register";
  const submitLabel = isSubmitting
    ? loginMethod === "magic-link"
      ? t("auth.sending")
      : t("auth.working")
    : registering
      ? t("auth.createAccount")
      : t("auth.logIn");

  return (
    <div className="login-form-panel">
      <div className="login-form-heading">
        <p className="login-kicker">{t("login.kicker")}</p>
        <h1>{registering ? t("auth.registerHeading") : t("login.heading")}</h1>
        <p>{registering ? t("auth.registerSubheading") : t("login.subheading")}</p>
      </div>
      {authError ? (
        <p className="login-alert" role="alert">
          {t("auth.unfinished")}
        </p>
      ) : null}
      {configurationError ? (
        <div className="login-unavailable" role="status">
          <strong>{t("auth.unavailable")}</strong>
          <span>{t("auth.configureSupabase")}</span>
        </div>
      ) : (
        <>
          <div className="login-mode-switch" role="tablist" aria-label={t("auth.tabsAria")}>
            <button
              type="button"
              role="tab"
              aria-selected={!registering}
              className={!registering ? "is-active" : ""}
              onClick={() => switchMode("login")}
            >
              {t("auth.tabLogIn")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={registering}
              className={registering ? "is-active" : ""}
              onClick={() => switchMode("register")}
            >
              {t("auth.tabRegister")}
            </button>
          </div>
          {!registering ? (
            <div className="login-method-switch" role="tablist" aria-label={t("auth.methodAria")}>
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
          ) : null}
          <form
            className="login-form"
            onSubmit={(event) =>
              void (registering
                ? register(event)
                : loginMethod === "password"
                  ? logIn(event)
                  : sendMagicLink(event))
            }
          >
            {registering || loginMethod === "password" ? (
              <>
                <label htmlFor="login-username">{t("auth.username")}</label>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  placeholder={t("auth.usernamePlaceholder")}
                  required
                />
                {registering ? <p className="login-field-note">{t("auth.usernameNote")}</p> : null}
              </>
            ) : null}
            {registering || loginMethod === "magic-link" ? (
              <>
                <label htmlFor="login-email">{t("login.email")}</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder={t("login.emailPlaceholder")}
                  required
                />
                {registering ? (
                  <p className="login-field-note">{t("auth.emailForRecovery")}</p>
                ) : null}
              </>
            ) : null}
            {registering || loginMethod === "password" ? (
              <>
                <label htmlFor="login-password">{t("auth.password")}</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={registering ? "new-password" : "current-password"}
                  minLength={6}
                  required
                />
                <p className="login-field-note">{t("login.passwordNote")}</p>
              </>
            ) : (
              <p className="login-field-note">{t("login.magicLinkNote")}</p>
            )}
            <button
              type="submit"
              className="login-primary-button"
              disabled={isSubmitting || !authClient}
            >
              {submitLabel}
            </button>
          </form>
          <div className="login-divider" aria-hidden="true">
            <span>{t("login.orContinueWith")}</span>
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
            {t("auth.continueWithGoogle")}
          </button>
          {message ? (
            <p className="login-message" role="status">
              {message}
            </p>
          ) : null}
        </>
      )}
      <p className="login-legal">
        {t("login.legalPrefix")} <a href="#terms">{t("login.terms")}</a> {t("login.and")}{" "}
        <a href="#privacy">{t("login.privacy")}</a>.
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

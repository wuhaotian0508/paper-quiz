"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AuthClient } from "@/components/auth-menu";
import { useLocale } from "@/hooks/use-locale";

type LoginViewProps = {
  client?: AuthClient;
  unavailableReason?: string;
  authError?: boolean;
  onAuthenticated?: (destination: string) => void;
};

/**
 * Sign-in always ends on the dashboard. The form used to accept a `returnTo` and hand the
 * learner back to the shared review or quiz they came from, which reads as a failed sign-in:
 * the shared page is public and looks the same either way.
 */
const AFTER_SIGN_IN = "/";

type AuthMode = "login" | "register";
type LoginMethod = "password" | "magic-link";

export function LoginView({
  client,
  unavailableReason,
  authError = false,
  onAuthenticated,
}: LoginViewProps) {
  const { t } = useLocale();
  const [authClient, setAuthClient] = useState<AuthClient | null>(client ?? null);
  const [configurationError, setConfigurationError] = useState(unavailableReason ?? "");
  const [mode, setMode] = useState<AuthMode>("login");
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
      options: { emailRedirectTo: authRedirectUrl() },
    });
    setIsSubmitting(false);
    setMessage(error ? error.message : t("auth.checkInbox"));
  }

  async function logIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage(t("auth.enterEmailAndPassword"));
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    // Signs in against Supabase Auth directly, which is keyed by email.
    //
    // This used to take a username and resolve it to an email through a
    // `paper_quiz_email_for_login` function. That function lives in a migration that was
    // never applied, so every password login failed on a missing-function error while the
    // form still asked for a username. Going straight to the email removes the dependency
    // rather than leaving sign-in resting on schema that may not be deployed.
    const { error } = await authClient.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    setIsSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    (onAuthenticated ?? ((destination: string) => window.location.assign(destination)))(
      AFTER_SIGN_IN,
    );
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage(t("auth.enterEmailAndPassword"));
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    // An account is an email and a password. Registration used to also take a username,
    // checked and stored through a `paper_quiz_profiles` table and two functions that were
    // never applied to the database: the duplicate check silently passed and the name was
    // never saved, so the field asked for something the account never carried.
    const { error } = await authClient.auth.signUp({
      email: trimmedEmail,
      password,
      options: { emailRedirectTo: authRedirectUrl() },
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
      options: { redirectTo: authRedirectUrl() },
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
            {/* An account is an email and a password, on both tabs. */}
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
            {registering ? <p className="login-field-note">{t("auth.emailForRecovery")}</p> : null}
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

function authRedirectUrl() {
  return new URL("/auth/callback", window.location.origin).toString();
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AuthClient } from "@/components/auth-menu";
import { useLocale } from "@/hooks/use-locale";

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
  const { t } = useLocale();
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
      setConfigurationError(error instanceof Error ? error.message : t("auth.supabaseUnavailable"));
    }
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
      options: { emailRedirectTo: authRedirectUrl(returnTo) },
    });
    setIsSubmitting(false);
    setMessage(error ? error.message : t("auth.checkInbox"));
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
          options: { emailRedirectTo: authRedirectUrl(returnTo) },
        })
      : await authClient.auth.signInWithPassword({ email: trimmedEmail, password });
    setIsSubmitting(false);
    if (result.error) {
      setMessage(result.error.message);
    } else if (isSignUp) {
      setMessage(t("auth.accountCreated"));
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
        <p className="login-kicker">{t("login.kicker")}</p>
        <h1>{t("login.heading")}</h1>
        <p>{t("login.subheading")}</p>
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
          <form
            className="login-form"
            onSubmit={(event) =>
              void (loginMethod === "password" ? submitPassword(event) : sendMagicLink(event))
            }
          >
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
            {loginMethod === "password" ? (
              <>
                <label htmlFor="login-password">{t("auth.password")}</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
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
              {isSubmitting
                ? loginMethod === "magic-link"
                  ? t("auth.sending")
                  : t("auth.working")
                : isSignUp
                  ? t("auth.createAccount")
                  : t("auth.logIn")}
            </button>
          </form>
          {loginMethod === "password" ? (
            <button
              type="button"
              className="login-text-button"
              onClick={() => setIsSignUp((value) => !value)}
            >
              {isSignUp ? t("auth.haveAccount") : t("auth.newHere")}
            </button>
          ) : null}
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

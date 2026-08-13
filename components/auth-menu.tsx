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
import { CREDIT_OPTIONS, MAX_RMB_TOPUP, rmbToCents } from "@/lib/credit-options";
import { formatCredit } from "@/lib/credit-ledger";

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
  /** Null while unknown - a balance we could not read must not be drawn as "$0.00". */
  const [creditCents, setCreditCents] = useState<number | null>(null);
  /**
   * Whether this page load is the return trip from a paid checkout. Read once, at the first
   * render, because the effect below strips the parameter as soon as it has announced it.
   */
  const [returningFromCheckout] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("checkout") === "success",
  );

  const [alipayOpen, setAlipayOpen] = useState(false);
  const [alipayQr, setAlipayQr] = useState("");
  /**
   * The yuan figure the learner says they paid, as typed.
   *
   * Free entry rather than a fixed list, because the receive code carries no amount: whatever
   * the panel offered, Alipay would still let them pay something else, and a ledger that could
   * only record three figures would be wrong the first time somebody did. The presets are
   * shortcuts into this field, not a menu it has to choose from.
   */
  const [alipayRmb, setAlipayRmb] = useState(String(CREDIT_OPTIONS[1].rmb));

  /**
   * Opens the Alipay receive code, fetching it the first time it is asked for.
   *
   * The code is a personal one, so paying it moves money without telling this app anything -
   * see `app/api/alipay/route.ts`.
   */
  const openAlipay = async () => {
    if (alipayOpen) {
      setAlipayOpen(false);
      return;
    }

    setAlipayOpen(true);
    if (alipayQr) return;

    setCheckoutStatus(t("usage.alipayLoading"));
    try {
      const response = await fetch("/api/alipay");
      const data = (await response.json()) as { qrDataUrl?: string; error?: string };
      if (!response.ok || !data.qrDataUrl) {
        throw new Error(data.error || t("usage.alipayUnavailable"));
      }
      setAlipayQr(data.qrDataUrl);
      setCheckoutStatus("");
    } catch (cause) {
      setAlipayOpen(false);
      setCheckoutStatus(cause instanceof Error ? cause.message : t("usage.alipayUnavailable"));
    }
  };

  /** Takes the learner's word that they paid, and writes the ledger row that follows from it. */
  const confirmAlipay = async () => {
    setCheckoutStatus(t("usage.alipayConfirming"));
    try {
      const body = new FormData();
      body.set("rmb", alipayRmb);
      const response = await fetch("/api/alipay", { method: "POST", body });
      const data = (await response.json()) as {
        creditedCents?: number;
        balanceCents?: number;
        error?: string;
      };
      if (!response.ok || typeof data.creditedCents !== "number") {
        throw new Error(data.error || t("usage.alipayFailed"));
      }
      if (typeof data.balanceCents === "number") setCreditCents(data.balanceCents);
      setAlipayOpen(false);
      setCheckoutStatus(t("usage.creditAdded", { amount: formatCredit(data.creditedCents) }));
    } catch (cause) {
      setCheckoutStatus(cause instanceof Error ? cause.message : t("usage.alipayFailed"));
    }
  };

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

  /**
   * Says something when the learner comes back from Stripe.
   *
   * Before this, a payment ended on the home page with no acknowledgement at all, which
   * reads as "did that work?". The parameter is stripped once announced so a later refresh
   * does not re-announce a payment that has long since landed.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (outcome !== "success" && outcome !== "cancelled") return;

    setSettingsOpen(true);
    setCheckoutStatus(
      outcome === "success" ? t("usage.creditPending") : t("usage.checkoutCancelled"),
    );
    params.delete("checkout");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [t]);

  /**
   * Reads the balance the webhook writes, retrying just after a checkout.
   *
   * Stripe redirects the browser back the moment the payment is taken, which can be a second
   * or two before its webhook reaches us, so the first read after a purchase is not to be
   * believed on its own. Everywhere else one read is enough.
   */
  useEffect(() => {
    if (!userEmail) {
      setCreditCents(null);
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attemptsLeft = returningFromCheckout ? 6 : 1;
    let firstRead: number | null = null;

    const read = async () => {
      let cents: number;
      try {
        const response = await fetch("/api/credit");
        if (!response.ok) throw new Error("unavailable");
        const data = (await response.json()) as { balanceCents?: number };
        cents = typeof data.balanceCents === "number" ? data.balanceCents : 0;
      } catch {
        // Left blank rather than shown as zero: a balance we cannot read looks, drawn as
        // "$0.00", exactly like a payment that went missing.
        if (active) setCreditCents(null);
        return;
      }

      if (!active) return;
      setCreditCents(cents);
      if (firstRead === null) {
        firstRead = cents;
      } else if (cents > firstRead) {
        setCheckoutStatus(t("usage.creditAdded", { amount: formatCredit(cents - firstRead) }));
        return;
      }
      if (--attemptsLeft > 0) timer = setTimeout(() => void read(), 2000);
    };

    void read();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [returningFromCheckout, t, userEmail]);

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
        {/* The collapsed row shows the running cost: a bare "Settings" gave no sign that
            usage and top-up were inside it, and they went unnoticed. */}
        <button
          type="button"
          className="auth-settings-toggle"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <span>{t("auth.settings")}</span>
          <span className="auth-settings-cost">{formatCost(usage.cost)}</span>
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
              <small className="usage-bar-note">{t("usage.notChargedShort")}</small>
            </div>
            <div className="usage-topup">
              {creditCents === null ? null : (
                <div className="usage-credit-row">
                  <small>{t("usage.creditBalance")}</small>
                  <strong>{formatCredit(creditCents)}</strong>
                </div>
              )}
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
              {/* Alipay sits behind its own toggle rather than beside the amounts: it is a
                  second way to pay, not a fourth amount, and folding it in read as one. */}
              <button
                type="button"
                className="usage-alipay-toggle"
                aria-expanded={alipayOpen}
                onClick={() => void openAlipay()}
              >
                {alipayOpen ? t("usage.alipayHide") : t("usage.payWithAlipay")}
              </button>
              {alipayOpen && alipayQr ? (
                <div className="usage-alipay">
                  <small>{t("usage.alipayChooseAmount")}</small>
                  {/* Shortcuts into the field below, not a menu: the code takes any amount,
                      so the field is the real input and these only save some typing. */}
                  <div className="usage-topup-options">
                    {CREDIT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={alipayRmb === String(option.rmb)}
                        className={alipayRmb === String(option.rmb) ? "is-chosen" : ""}
                        onClick={() => setAlipayRmb(String(option.rmb))}
                      >
                        {option.rmbLabel}
                      </button>
                    ))}
                  </div>
                  <label className="usage-alipay-amount" htmlFor="alipay-rmb">
                    <span>{t("usage.alipayAmountLabel")}</span>
                    <input
                      id="alipay-rmb"
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={MAX_RMB_TOPUP}
                      step="0.01"
                      value={alipayRmb}
                      onChange={(event) => setAlipayRmb(event.target.value)}
                    />
                  </label>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a data URL has no
                      remote source for the image loader to optimise. */}
                  <img className="usage-alipay-qr" src={alipayQr} alt={t("usage.alipayQrAlt")} />
                  <small>{t("usage.alipayScanHint", { amount: `¥${alipayRmb || "0"}` })}</small>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!rmbToCents(alipayRmb)}
                    onClick={() => void confirmAlipay()}
                  >
                    {t("usage.alipayConfirm", { amount: `¥${alipayRmb || "0"}` })}
                  </button>
                  <small className="usage-alipay-note">{t("usage.alipayDemoNote")}</small>
                </div>
              ) : null}
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

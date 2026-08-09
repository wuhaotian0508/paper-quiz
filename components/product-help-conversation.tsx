"use client";

import { useState } from "react";
import { createFeedbackHref } from "@/lib/feedback";
import { useLocale } from "@/hooks/use-locale";
import type { MessageKey } from "@/lib/i18n";

type Message = {
  role: "user" | "assistant";
  text: string;
  needsFeedback?: boolean;
};

type HelpResponse = {
  reply?: string;
  needsFeedback?: boolean;
  error?: string;
};

const suggestionKeys: MessageKey[] = [
  "help.suggestionUpload",
  "help.suggestionTypes",
  "help.suggestionMistakes",
  "help.suggestionExport",
];

/**
 * Mirrors the workspace's own hash routing, so the chatbot is told the screen the learner
 * is actually looking at. The legacy hashes fold into `library` exactly as the workspace
 * folds them, and an unknown hash falls back to the dashboard.
 */
function currentView() {
  const value = window.location.hash.replace("#", "");
  if (value === "progress") return "calendar";
  if (["history", "review-sheets", "materials"].includes(value)) return "library";
  if (
    [
      "dashboard",
      "quiz-lab",
      "mistake-book",
      "calendar",
      "library",
      "quiz",
      "results",
      "help",
    ].includes(value)
  )
    return value;
  return "dashboard";
}

export function ProductHelpConversation() {
  const { locale, t } = useLocale();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const send = async (question: string) => {
    const message = question.trim();
    if (!message || sending) return;
    const history = messages.map(({ role, text }) => ({ role, content: text })).slice(-8);
    setMessages((items) => [...items, { role: "user", text: message }]);
    setInput("");
    setError("");
    setSending(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch("/api/product-help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history, currentView: currentView(), locale }),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as HelpResponse;
      if (!response.ok || !payload.reply)
        throw new Error(payload.error || t("help.failedShort"));
      setMessages((items) => [
        ...items,
        { role: "assistant", text: payload.reply!, needsFeedback: Boolean(payload.needsFeedback) },
      ]);
    } catch (cause) {
      setError(
        cause instanceof DOMException && cause.name === "AbortError"
          ? t("help.timeout")
          : cause instanceof Error
            ? cause.message
            : t("help.failed"),
      );
    } finally {
      window.clearTimeout(timeout);
      setSending(false);
    }
  };

  return (
    <div className="product-help-conversation">
      <div className="product-help-messages" aria-live="polite">
        {messages.length === 0 && (
          <p>{t("help.emptyPrompt")}</p>
        )}
        {messages.map((message, index) => (
          <div className={`product-help-message ${message.role}`} key={`${message.role}-${index}`}>
            {message.text}
            {message.needsFeedback && <a href={createFeedbackHref()}>{t("help.sendFeedback")}</a>}
          </div>
        ))}
        {sending && (
          <div className="product-help-pending" role="status">
            {t("help.thinking")}
          </div>
        )}
      </div>
      {error && (
        <p className="product-help-error" role="alert">
          {error}
        </p>
      )}
      <div className="product-help-suggestions">
        {suggestionKeys.map((key) => (
          <button key={key} disabled={sending} onClick={() => void send(t(key))}>
            {t(key)}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <label className="sr-only" htmlFor="product-help-question">
          {t("help.inputLabel")}
        </label>
        <input
          id="product-help-question"
          aria-label={t("help.inputLabel")}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("help.inputPlaceholder")}
        />
        <button
          type="submit"
          aria-label={t("help.sendAria")}
          disabled={sending || !input.trim()}
        >
          {sending ? t("help.thinking") : t("help.send")}
        </button>
      </form>
    </div>
  );
}

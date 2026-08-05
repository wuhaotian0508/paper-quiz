"use client";

import { useState } from "react";
import { createFeedbackHref } from "@/lib/feedback";

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

const suggestions = [
  "How do I upload a lecture?",
  "How do I choose question types?",
  "Where is my mistake book?",
  "How do I export a PDF?",
];

function currentView() {
  const value = window.location.hash.replace("#", "");
  if (value === "progress") return "calendar";
  if (
    [
      "dashboard",
      "quiz-lab",
      "mistake-book",
      "calendar",
      "history",
      "quiz",
      "results",
      "help",
    ].includes(value)
  )
    return value;
  return "dashboard";
}

export function ProductHelpConversation() {
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
    try {
      const response = await fetch("/api/product-help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history, currentView: currentView() }),
      });
      const payload = (await response.json()) as HelpResponse;
      if (!response.ok || !payload.reply) throw new Error(payload.error || "Product help failed.");
      setMessages((items) => [
        ...items,
        { role: "assistant", text: payload.reply!, needsFeedback: Boolean(payload.needsFeedback) },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Product help failed. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="product-help-conversation">
      <div className="product-help-messages" aria-live="polite">
        {messages.length === 0 && (
          <p>Ask what you want to do and I will point you to the right PaperQuiz buttons.</p>
        )}
        {messages.map((message, index) => (
          <div className={`product-help-message ${message.role}`} key={`${message.role}-${index}`}>
            {message.text}
            {message.needsFeedback && <a href={createFeedbackHref()}>Send feedback</a>}
          </div>
        ))}
        {sending && (
          <div className="product-help-pending" role="status">
            Thinking…
          </div>
        )}
      </div>
      {error && (
        <p className="product-help-error" role="alert">
          {error}
        </p>
      )}
      <div className="product-help-suggestions">
        {suggestions.map((question) => (
          <button key={question} disabled={sending} onClick={() => void send(question)}>
            {question}
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
          Ask how to use PaperQuiz
        </label>
        <input
          id="product-help-question"
          aria-label="Ask how to use PaperQuiz"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="e.g. where do I start?"
        />
        <button type="submit" aria-label="Send help question" disabled={sending || !input.trim()}>
          {sending ? "Thinking…" : "Send"}
        </button>
      </form>
    </div>
  );
}

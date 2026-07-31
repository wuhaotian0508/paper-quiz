"use client";

import { useEffect, useRef, useState } from "react";
import { createFeedbackHref } from "@/lib/feedback";
import { getProductHelpReply } from "@/lib/product-help";

type Message = {
  role: "user" | "assistant";
  text: string;
  fallback?: boolean;
  feedbackContext?: string;
};

const suggestions = [
  "How do I upload a lecture?",
  "How do I choose question types?",
  "Where is my mistake book?",
  "How do I export a PDF?",
];

export function ProductHelpChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const send = (question: string) => {
    const text = question.trim();
    if (!text) return;
    const reply = getProductHelpReply(text);
    setMessages((items) => [
      ...items,
      { role: "user", text },
      {
        role: "assistant",
        text: reply.text,
        fallback: reply.kind === "fallback",
        feedbackContext: text,
      },
    ]);
    setInput("");
  };

  return (
    <aside className="product-help-widget">
      <button
        className="product-help-launcher"
        aria-expanded={open}
        aria-controls="product-help-panel"
        onClick={() => setOpen((value) => !value)}
      >
        Help
      </button>
      {open && (
        <section
          id="product-help-panel"
          className="product-help-panel"
          aria-label="Product help chat"
        >
          <header>
            <div>
              <strong>Paper Plane Help</strong>
              <span>Questions about using the app</span>
            </div>
            <button aria-label="Close help" onClick={() => setOpen(false)}>
              x
            </button>
          </header>
          <div className="product-help-messages" aria-live="polite">
            {messages.length === 0 && (
              <p>Ask about uploads, question types, your mistake book, or PDF exports.</p>
            )}
            {messages.map((message, index) => (
              <div
                className={`product-help-message ${message.role}`}
                key={`${message.role}-${index}`}
              >
                {message.text}
                {message.fallback && (
                  <a href={createFeedbackHref(`Chatbot question: ${message.feedbackContext}`)}>
                    Send feedback
                  </a>
                )}
              </div>
            ))}
          </div>
          <div className="product-help-suggestions">
            {suggestions.map((question) => (
              <button key={question} onClick={() => send(question)}>
                {question}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
          >
            <label className="sr-only" htmlFor="product-help-question">
              Ask about using Paper Plane Quiz
            </label>
            <input
              ref={inputRef}
              id="product-help-question"
              aria-label="Ask about using Paper Plane Quiz"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button type="submit" aria-label="Send help question" disabled={!input.trim()}>
              Send
            </button>
          </form>
        </section>
      )}
    </aside>
  );
}

"use client";

import { ProductHelpConversation } from "@/components/product-help-conversation";

export function HelpCenter({ onBack }: { onBack: () => void }) {
  return (
    <section className="help-page">
      <header className="help-heading">
        <div>
          <div className="eyebrow">PaperQuiz chatbot</div>
          <h1>How can PaperQuiz help?</h1>
          <p className="muted-copy">
            Tell me what you want to do and I will point you to the right buttons.
          </p>
        </div>
        <button className="text-button" onClick={onBack}>
          Back to quiz
        </button>
      </header>
      <section className="help-chat-page" aria-label="Product help chat">
        <ProductHelpConversation />
      </section>
    </section>
  );
}

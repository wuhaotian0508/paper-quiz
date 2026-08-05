"use client";

import { useEffect, useState } from "react";
import { ProductHelpConversation } from "@/components/product-help-conversation";

export function ProductHelpChat() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

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
              <strong>PaperQuiz chatbot</strong>
              <span>Ask how to use the app</span>
            </div>
            <button aria-label="Close help" onClick={() => setOpen(false)}>
              x
            </button>
          </header>
          <ProductHelpConversation />
        </section>
      )}
    </aside>
  );
}

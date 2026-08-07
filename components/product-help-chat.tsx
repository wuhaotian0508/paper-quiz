"use client";

import { useEffect, useState } from "react";
import { ProductHelpConversation } from "@/components/product-help-conversation";
import { useLocale } from "@/hooks/use-locale";

export function ProductHelpChat() {
  const { t } = useLocale();
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
        {t("help.launcher")}
      </button>
      {open && (
        <section
          id="product-help-panel"
          className="product-help-panel"
          aria-label={t("help.chatAria")}
        >
          <header>
            <div>
              <strong>{t("help.widgetTitle")}</strong>
              <span>{t("help.widgetSubtitle")}</span>
            </div>
            <button aria-label={t("help.closeAria")} onClick={() => setOpen(false)}>
              x
            </button>
          </header>
          <ProductHelpConversation />
        </section>
      )}
    </aside>
  );
}

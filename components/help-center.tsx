"use client";

import { ProductHelpConversation } from "@/components/product-help-conversation";
import { useLocale } from "@/hooks/use-locale";

export function HelpCenter({ onBack }: { onBack: () => void }) {
  const { t } = useLocale();
  return (
    <section className="help-page">
      <header className="help-heading">
        <div>
          <div className="eyebrow">{t("help.eyebrow")}</div>
          <h1>{t("help.heading")}</h1>
          <p className="muted-copy">{t("help.note")}</p>
        </div>
        <button className="text-button" onClick={onBack}>
          {t("help.backToQuiz")}
        </button>
      </header>
      <section className="help-chat-page" aria-label={t("help.chatAria")}>
        <ProductHelpConversation />
      </section>
    </section>
  );
}

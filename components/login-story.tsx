"use client";

import { useLocale } from "@/hooks/use-locale";

export function LoginStory() {
  const { t } = useLocale();
  return (
    <section className="login-story" aria-labelledby="login-story-heading">
      <div className="login-brand">
        <span aria-hidden="true">*</span> {t("nav.brand")}
      </div>
      <div className="login-story-copy">
        <p className="login-kicker">{t("login.storyKicker")}</p>
        <h2 id="login-story-heading">
          {t("login.storyHeadingPrefix")} <em>{t("login.storyHeadingEmphasis")}</em>
        </h2>
        <p>{t("login.storyBody")}</p>
      </div>
      <div className="login-story-art" aria-hidden="true">
        <span className="login-art-paper">PDF</span>
        <span className="login-art-wave">~ ~ ~</span>
        <span className="login-art-plane">➤</span>
        <span className="login-art-question">?</span>
      </div>
      <blockquote>
        <span aria-hidden="true">“</span>
        <p>{t("login.quote")}</p>
        <cite>{t("login.quoteAuthor")}</cite>
      </blockquote>
    </section>
  );
}

export function LoginFeatures() {
  const { t } = useLocale();
  return (
    <div className="login-features" aria-label={t("login.featuresAria")}>
      <span>
        <b>{t("login.featureUploadLead")}</b> {t("login.featureUpload")}
      </span>
      <span>
        <b>{t("login.featureGenerateLead")}</b> {t("login.featureGenerate")}
      </span>
      <span>
        <b>{t("login.featureImproveLead")}</b> {t("login.featureImprove")}
      </span>
    </div>
  );
}

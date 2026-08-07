"use client";

import { useLocale } from "@/hooks/use-locale";

export function SiteFooter() {
  const { t } = useLocale();
  return (
    <footer className="site-footer">
      <span>{t("footer.mood")}</span>
      <span>{t("footer.privacy")}</span>
    </footer>
  );
}

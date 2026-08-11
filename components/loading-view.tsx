"use client";

import { useEffect, useState } from "react";
import { QUIZ_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from "@/lib/api-client";
import { useLocale } from "@/hooks/use-locale";
import type { MessageKey } from "@/lib/i18n";

const copy: Record<"generating", { eyebrow: MessageKey; heading: MessageKey }> = {
  generating: {
    eyebrow: "loading.generatingEyebrow",
    heading: "loading.generatingHeading",
  },
};

/**
 * Shows real elapsed time rather than an open-ended spinner, and warns as the request
 * approaches the server's own deadline so a timeout is not a surprise.
 */
export function LoadingView({ mode }: { mode: "generating" }) {
  const { t } = useLocale();
  const [elapsed, setElapsed] = useState(0);
  const limit = Math.round((mode === "generating" ? QUIZ_TIMEOUT_MS : REQUEST_TIMEOUT_MS) / 1000);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="generation-card">
      <div className="eyebrow">{t(copy[mode].eyebrow)}</div>
      <div className="loader-orbit">
        <span />
        <span />
        <span />
      </div>
      <h1>{t(copy[mode].heading)}</h1>
      <p className="muted-copy" role="status">
        {t("loading.elapsed", { elapsed })}
        {elapsed >= limit - 15
          ? t("loading.nearLimit", { limit })
          : t("loading.underLimit", { limit })}
      </p>
    </section>
  );
}

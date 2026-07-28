"use client";

import { useEffect, useState } from "react";
import { REQUEST_TIMEOUT_MS } from "@/lib/api-client";

const copy = {
  transcribing: {
    eyebrow: "Transcribing your lecture",
    heading: "Turning spoken ideas into review material.",
  },
  generating: {
    eyebrow: "Preparing your personal quiz",
    heading: "Writing your focused practice set.",
  },
} as const;

/**
 * Shows real elapsed time rather than an open-ended spinner, and warns as the request
 * approaches the server's own deadline so a timeout is not a surprise.
 */
export function LoadingView({ mode }: { mode: "transcribing" | "generating" }) {
  const [elapsed, setElapsed] = useState(0);
  const limit = Math.round(REQUEST_TIMEOUT_MS / 1000);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="generation-card">
      <div className="eyebrow">{copy[mode].eyebrow}</div>
      <div className="loader-orbit">
        <span />
        <span />
        <span />
      </div>
      <h1>{copy[mode].heading}</h1>
      <p className="muted-copy" role="status">
        {elapsed}s elapsed
        {elapsed >= limit - 15
          ? ` - this request stops at ${limit}s. A shorter lecture or fewer questions will finish sooner.`
          : ` - most requests finish well under ${limit}s.`}
      </p>
    </section>
  );
}

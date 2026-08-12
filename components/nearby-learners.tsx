"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/hooks/use-locale";
import {
  bandLabelKey,
  EMPTY_NEARBY,
  minutesLeft,
  sortNearby,
  splitRemaining,
  type NearbyState,
} from "@/lib/nearby";
import {
  findNearbyLearners,
  requestContactById,
  shareLocation,
  stopSharingLocation,
} from "@/lib/nearby-client";
import type { ContactsClient } from "@/lib/contacts-client";

type Props = {
  client: ContactsClient | null;
  /** Re-reads the contact list, so a request sent from here shows up as pending next door. */
  onContactRequested: () => void | Promise<void>;
};

/**
 * Who else is around, in bands.
 *
 * Sharing starts as soon as this panel opens rather than waiting for a press. The browser's
 * own permission prompt is still the gate — no coordinate is read until the learner allows
 * it there, and refusing leaves the panel showing the button and the reason. What the opening
 * press used to buy was a second confirmation on top of that one, not the only one.
 */
export function NearbyLearners({ client, onContactRequested }: Props) {
  const { t } = useLocale();
  const [state, setState] = useState<NearbyState>(EMPTY_NEARBY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Ids we have just asked, so the row reads "Asked" before the next reload confirms it. */
  const [asked, setAsked] = useState<string[]>([]);

  const currentPosition = () =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error(t("nearby.unsupported")));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, (cause) => {
        reject(
          new Error(
            cause.code === cause.PERMISSION_DENIED ? t("nearby.denied") : t("nearby.failed"),
          ),
        );
      });
    });

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("nearby.failed"));
    } finally {
      setBusy(false);
    }
  };

  /** Throws rather than reporting: whether a failure is worth a line depends on the caller. */
  const refresh = useCallback(async () => {
    if (!client) return undefined;
    const next = await findNearbyLearners(client);
    setState(next);
    return next;
  }, [client]);

  /**
   * On open: read the list, then start or refresh sharing.
   *
   * The two failures are reported differently on purpose. A list that will not load broke for
   * a reason that broke the contact panel beside it too — signed out, offline — and that panel
   * already says so, so a second copy of the same sentence is swallowed here. A refused or
   * failed location is specific to this panel and nothing else will mention it, so it is shown
   * and the button comes back as the way to try again.
   */
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await refresh();
      } catch {
        return; // Reported next door.
      }
      if (!active || !client) return;
      try {
        const position = await currentPosition();
        if (!active) return;
        await shareLocation(client, position.coords.latitude, position.coords.longitude);
        if (active) await refresh();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : t("nearby.failed"));
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, refresh]);

  const start = () =>
    run(async () => {
      if (!client) return;
      const position = await currentPosition();
      await shareLocation(client, position.coords.latitude, position.coords.longitude);
      await refresh();
    });

  const stop = () =>
    run(async () => {
      if (!client) return;
      setState(await stopSharingLocation(client));
      setAsked([]);
    });

  const add = (userId: string) =>
    run(async () => {
      if (!client) return;
      await requestContactById(client, userId);
      setAsked((previous) => [...previous, userId]);
      await Promise.all([refresh(), onContactRequested()]);
    });

  const remaining = state.sharing ? minutesLeft(state.expiresAt) : null;
  const learners = sortNearby(state.nearby);

  return (
    <section className="nearby-panel" aria-labelledby="nearby-heading">
      <h2 id="nearby-heading">{t("nearby.heading")}</h2>
      <p className="nearby-note">{t("nearby.note")}</p>

      {error ? (
        <p className="nearby-error" role="alert">
          {error}
        </p>
      ) : null}

      {!state.sharing ? (
        <button
          className="nearby-start"
          disabled={busy || !client}
          onClick={() => void start()}
          type="button"
        >
          {busy ? t("nearby.locating") : t("nearby.start")}
        </button>
      ) : (
        <>
          <div className="nearby-status">
            <span className="nearby-status-line">
              {remaining === null
                ? t("nearby.sharingSoon", { minutes: 0 })
                : remaining >= 60
                  ? t("nearby.sharingFor", splitRemaining(remaining))
                  : t("nearby.sharingSoon", { minutes: remaining })}
            </span>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void stop()}
              type="button"
            >
              {t("nearby.stop")}
            </button>
          </div>

          {!learners.length ? (
            <p className="nearby-empty">{t("nearby.empty")}</p>
          ) : (
            <ul className="nearby-list" aria-label={t("nearby.listAria")}>
              {learners.map((learner) => (
                <li className="nearby-row" key={learner.userId}>
                  <span className="nearby-name">{learner.name}</span>
                  <span className="nearby-band">{t(bandLabelKey(learner.distance))}</span>
                  {learner.relation === "contact" ? (
                    <span className="nearby-state">{t("nearby.alreadyContact")}</span>
                  ) : learner.relation === "pending" || asked.includes(learner.userId) ? (
                    <span className="nearby-state">{t("nearby.asked")}</span>
                  ) : (
                    <button
                      aria-label={t("nearby.addAria", { name: learner.name })}
                      className="nearby-add"
                      disabled={busy}
                      onClick={() => void add(learner.userId)}
                      type="button"
                    >
                      {t("nearby.add")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

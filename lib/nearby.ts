import type { MessageKey } from "@/lib/i18n";

/**
 * Shapes and rules for the nearby-learners panel. Pure, like `lib/nearby-client.ts`'s
 * counterpart in `lib/contacts.ts`: the database calls live next door.
 *
 * Nothing here ever handles another person's coordinates, because the server never sends
 * any. A band is the whole of what arrives.
 */

/** How coarse a stored coordinate is. Three decimals is roughly 110 m. */
export const LOCATION_DECIMALS = 3;

/** Matches the four-hour expiry in `share_location`. */
export const SHARE_DURATION_MS = 4 * 60 * 60 * 1000;

export type DistanceBand = "here" | "nearby" | "city";
export type NearbyRelation = "none" | "pending" | "contact";

export type NearbyLearner = {
  userId: string;
  /** The local part of an address, never the address. */
  name: string;
  distance: DistanceBand;
  relation: NearbyRelation;
};

export type NearbyState = {
  sharing: boolean;
  /** Empty while not sharing. */
  expiresAt: string;
  nearby: NearbyLearner[];
};

export const EMPTY_NEARBY: NearbyState = { sharing: false, expiresAt: "", nearby: [] };

const BANDS: Record<DistanceBand, { rank: number; key: MessageKey }> = {
  here: { rank: 1, key: "nearby.bandHere" },
  nearby: { rank: 2, key: "nearby.bandNearby" },
  city: { rank: 3, key: "nearby.bandCity" },
};

const RELATIONS: NearbyRelation[] = ["none", "pending", "contact"];

export function bandLabelKey(band: DistanceBand) {
  return BANDS[band].key;
}

/**
 * Rounds the way the database will, so the browser never holds a sharper reading than the
 * one it is about to store.
 */
export function snapCoordinate(value: number) {
  const factor = 10 ** LOCATION_DECIMALS;
  return Math.round(value * factor) / factor;
}

export function isCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** Closest band first, then by name. Never by a distance, because we are not sent one. */
export function sortNearby(learners: NearbyLearner[]) {
  return [...learners].sort(
    (left, right) =>
      BANDS[left.distance].rank - BANDS[right.distance].rank || left.name.localeCompare(right.name),
  );
}

/**
 * Whole minutes left before sharing lapses, or null once it has. Drives the line that keeps
 * "I forgot I left this on" from being possible.
 */
export function minutesLeft(expiresAt: string, now: number = Date.now()) {
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) return null;
  const remaining = Math.floor((expiry - now) / 60000);
  return remaining > 0 ? remaining : null;
}

/** `{hours, minutes}` for the countdown, so the copy can read "3 h 42 m" in either language. */
export function splitRemaining(totalMinutes: number) {
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/**
 * Parses what `find_nearby_learners()` returned. Defensive for the same reason
 * `readContactList` is: this arrives as untyped jsonb, and a panel that renders empty beats
 * one that throws and takes the contacts page down with it.
 */
export function readNearbyState(value: unknown): NearbyState {
  const record = asRecord(value);
  return {
    sharing: record.sharing === true,
    expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : "",
    nearby: (Array.isArray(record.nearby) ? record.nearby : [])
      .map(readLearner)
      .filter((learner) => learner.userId && learner.name),
  };
}

function readLearner(value: unknown): NearbyLearner {
  const record = asRecord(value);
  const distance = record.distance;
  const relation = record.relation;
  return {
    userId: typeof record.userId === "string" ? record.userId : "",
    name: typeof record.name === "string" ? record.name : "",
    // An unknown band is treated as the vaguest one rather than dropped: the person is
    // genuinely there, and "somewhere in the city" is never an overstatement.
    distance:
      distance === "here" || distance === "nearby" || distance === "city" ? distance : "city",
    relation: RELATIONS.includes(relation as NearbyRelation)
      ? (relation as NearbyRelation)
      : "none",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

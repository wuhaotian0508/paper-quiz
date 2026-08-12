import { describe, expect, it } from "vitest";
import {
  bandLabelKey,
  EMPTY_NEARBY,
  isCoordinate,
  minutesLeft,
  readNearbyState,
  snapCoordinate,
  sortNearby,
  splitRemaining,
  type NearbyLearner,
} from "@/lib/nearby";

function learner(overrides: Partial<NearbyLearner>): NearbyLearner {
  return { userId: "u1", name: "ada", distance: "here", relation: "none", ...overrides };
}

describe("coordinates", () => {
  it("rounds to the same three decimals the database stores", () => {
    expect(snapCoordinate(37.87159274)).toBe(37.872);
    expect(snapCoordinate(-122.2584937)).toBe(-122.258);
    expect(snapCoordinate(0)).toBe(0);
  });

  it("turns away anything that is not a point on the map", () => {
    expect(isCoordinate(37.872, -122.258)).toBe(true);
    expect(isCoordinate(-90, 180)).toBe(true);
    expect(isCoordinate(91, 0)).toBe(false);
    expect(isCoordinate(0, 181)).toBe(false);
    expect(isCoordinate(Number.NaN, 0)).toBe(false);
    expect(isCoordinate(Number.POSITIVE_INFINITY, 0)).toBe(false);
  });
});

describe("ordering", () => {
  it("puts the closest band first and sorts by name inside it", () => {
    const sorted = sortNearby([
      learner({ userId: "far", name: "zoe", distance: "city" }),
      learner({ userId: "close-b", name: "bea", distance: "here" }),
      learner({ userId: "mid", name: "ann", distance: "nearby" }),
      learner({ userId: "close-a", name: "ada", distance: "here" }),
    ]);

    expect(sorted.map((entry) => entry.userId)).toEqual(["close-a", "close-b", "mid", "far"]);
  });

  it("leaves the caller's array alone", () => {
    const list = [learner({ userId: "a", distance: "city" }), learner({ userId: "b" })];
    sortNearby(list);
    expect(list.map((entry) => entry.userId)).toEqual(["a", "b"]);
  });

  it("names a copy key for every band", () => {
    expect(bandLabelKey("here")).toBe("nearby.bandHere");
    expect(bandLabelKey("nearby")).toBe("nearby.bandNearby");
    expect(bandLabelKey("city")).toBe("nearby.bandCity");
  });
});

describe("the countdown that stops sharing being forgotten", () => {
  const now = Date.parse("2026-08-14T10:00:00Z");

  it("counts whole minutes left", () => {
    expect(minutesLeft("2026-08-14T13:42:30Z", now)).toBe(222);
  });

  it("reads as lapsed once the moment has passed", () => {
    expect(minutesLeft("2026-08-14T09:59:00Z", now)).toBeNull();
    expect(minutesLeft("2026-08-14T10:00:00Z", now)).toBeNull();
  });

  it("reads as lapsed rather than throwing on a missing or broken timestamp", () => {
    expect(minutesLeft("", now)).toBeNull();
    expect(minutesLeft("soon", now)).toBeNull();
  });

  it("splits into hours and minutes for the copy", () => {
    expect(splitRemaining(222)).toEqual({ hours: 3, minutes: 42 });
    expect(splitRemaining(59)).toEqual({ hours: 0, minutes: 59 });
  });
});

describe("reading what the database returned", () => {
  it("parses a sharing state with people in it", () => {
    const state = readNearbyState({
      sharing: true,
      expiresAt: "2026-08-14T14:00:00+00:00",
      nearby: [
        { userId: "u1", name: "ada", distance: "here", relation: "none" },
        { userId: "u2", name: "grace", distance: "city", relation: "contact" },
      ],
    });

    expect(state.sharing).toBe(true);
    expect(state.expiresAt).toBe("2026-08-14T14:00:00+00:00");
    expect(state.nearby).toHaveLength(2);
    expect(state.nearby[1].relation).toBe("contact");
  });

  it("reads a caller who is not sharing as seeing nobody", () => {
    const state = readNearbyState({ sharing: false, expiresAt: null, nearby: [] });
    expect(state).toEqual(EMPTY_NEARBY);
  });

  it("renders empty rather than throwing when the payload is not what we expected", () => {
    expect(readNearbyState(null)).toEqual(EMPTY_NEARBY);
    expect(readNearbyState("unavailable")).toEqual(EMPTY_NEARBY);
    expect(readNearbyState({ sharing: true, nearby: "broken" })).toEqual({
      sharing: true,
      expiresAt: "",
      nearby: [],
    });
  });

  it("drops a row it could not name or act on", () => {
    const state = readNearbyState({ sharing: true, nearby: [{ userId: "u1" }, { name: "ada" }] });
    expect(state.nearby).toEqual([]);
  });

  it("treats an unrecognised band as the vaguest one rather than dropping the person", () => {
    const state = readNearbyState({
      sharing: true,
      nearby: [{ userId: "u1", name: "ada", distance: "next-door", relation: "friend" }],
    });

    expect(state.nearby).toEqual([
      { userId: "u1", name: "ada", distance: "city", relation: "none" },
    ]);
  });
});

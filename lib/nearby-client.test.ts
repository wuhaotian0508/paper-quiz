import { describe, expect, it, vi } from "vitest";
import {
  findNearbyLearners,
  requestContactById,
  shareLocation,
  stopSharingLocation,
} from "@/lib/nearby-client";
import type { ContactsClient } from "@/lib/contacts-client";

const ada = "22222222-2222-4222-8222-222222222222";

function createClient(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as ContactsClient, rpc };
}

describe("sharing where you are", () => {
  it("blunts the coordinate before it leaves the browser", async () => {
    const { client, rpc } = createClient({
      data: { sharing: true, expiresAt: "2026-08-14T14:00:00+00:00", nearby: [] },
      error: null,
    });

    const state = await shareLocation(client, 37.87159274, -122.2584937);

    expect(rpc).toHaveBeenCalledWith("share_location", {
      p_latitude: 37.872,
      p_longitude: -122.258,
    });
    expect(state.sharing).toBe(true);
  });

  it("refuses a point that is not on the map", async () => {
    const { client, rpc } = createClient({ data: null, error: null });

    await expect(shareLocation(client, 999, 0)).rejects.toThrow("That location is not on the map.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stops sharing without arguments", async () => {
    const { client, rpc } = createClient({
      data: { sharing: false, expiresAt: null, nearby: [] },
      error: null,
    });

    const state = await stopSharingLocation(client);

    expect(rpc).toHaveBeenCalledWith("stop_sharing_location", {});
    expect(state.sharing).toBe(false);
  });
});

describe("finding people", () => {
  it("parses the bands and never asks for anything finer", async () => {
    const { client, rpc } = createClient({
      data: {
        sharing: true,
        expiresAt: "2026-08-14T14:00:00+00:00",
        nearby: [{ userId: ada, name: "ada", distance: "here", relation: "none" }],
      },
      error: null,
    });

    const state = await findNearbyLearners(client);

    expect(rpc).toHaveBeenCalledWith("find_nearby_learners", {});
    expect(state.nearby[0]).toEqual({
      userId: ada,
      name: "ada",
      distance: "here",
      relation: "none",
    });
  });

  it("surfaces a database error instead of looking like an empty room", async () => {
    const { client } = createClient({ data: null, error: { message: "Sign in first." } });

    await expect(findNearbyLearners(client)).rejects.toThrow("Sign in first.");
  });
});

describe("adding someone met through proximity", () => {
  it("asks by id, because the nearby list is never given an address", async () => {
    const { client, rpc } = createClient({ data: { status: "sent" }, error: null });

    await requestContactById(client, ada);

    expect(rpc).toHaveBeenCalledWith("request_contact", { p_user_id: ada });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("@");
  });

  it("will not send something that is not a user id", async () => {
    const { client, rpc } = createClient({ data: { status: "sent" }, error: null });

    await expect(requestContactById(client, "ada@example.edu")).rejects.toThrow("Unknown learner.");
    expect(rpc).not.toHaveBeenCalled();
  });
});

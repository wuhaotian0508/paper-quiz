import { isCoordinate, readNearbyState, snapCoordinate, type NearbyState } from "@/lib/nearby";
import type { ContactsClient } from "@/lib/contacts-client";

/**
 * The database calls behind the nearby panel.
 *
 * Reuses `ContactsClient` rather than declaring a second narrow client: every call here is
 * an RPC, and the contacts page already hands the same object around. All four are
 * security-definer functions — there is no table for this feature that a browser may touch.
 */
type RpcResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

/**
 * Starts or refreshes sharing. The coordinate is snapped here as well as in the RPC, so the
 * sharper reading the browser was handed never crosses the network in the first place.
 */
export async function shareLocation(
  client: ContactsClient,
  latitude: number,
  longitude: number,
): Promise<NearbyState> {
  if (!isCoordinate(latitude, longitude)) throw new Error("That location is not on the map.");
  return readNearbyState(
    await callRpc(client, "share_location", {
      p_latitude: snapCoordinate(latitude),
      p_longitude: snapCoordinate(longitude),
    }),
  );
}

export async function stopSharingLocation(client: ContactsClient): Promise<NearbyState> {
  return readNearbyState(await callRpc(client, "stop_sharing_location"));
}

export async function findNearbyLearners(client: ContactsClient): Promise<NearbyState> {
  return readNearbyState(await callRpc(client, "find_nearby_learners"));
}

/** Adds someone met through proximity. By id: the nearby list is never given an address. */
export async function requestContactById(client: ContactsClient, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Unknown learner.");
  await callRpc(client, "request_contact", { p_user_id: userId });
}

async function callRpc<T>(
  client: ContactsClient,
  functionName: string,
  parameters: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = (await client.rpc<T>(functionName, parameters)) as Awaited<RpcResult<T>>;
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Nearby classmates are unavailable.");
  return data;
}

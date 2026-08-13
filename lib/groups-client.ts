import {
  isGroupName,
  MAX_GROUP_MESSAGE_CHARS,
  MAX_REPORT_NOTE_CHARS,
  normalizeGroupName,
  readGroupList,
  readGroupRoom,
  type GroupList,
  type GroupRoom,
} from "@/lib/groups";
import type { ContactsClient } from "@/lib/contacts-client";

/**
 * The database calls behind course groups.
 *
 * Reuses `ContactsClient`: the same narrow `rpc`/`from` pair the contacts page already passes
 * around. Rooms, rosters and invitations go through security-definer RPCs because they read
 * auth.users for a name; messages go straight at the table, because "only a joined member may
 * read or write" is an RLS policy and a definer function would step around it.
 */
export const GROUP_MESSAGES_TABLE = "paper_quiz_group_messages";
export const GROUP_MEMBERS_TABLE = "paper_quiz_group_members";
export const GROUP_REPORTS_TABLE = "paper_quiz_group_message_reports";

export async function listGroups(client: ContactsClient): Promise<GroupList> {
  return readGroupList(await callRpc<unknown>(client, "list_groups"));
}

export async function createGroup(client: ContactsClient, name: string) {
  if (!isGroupName(name)) throw new Error("Give the group a course name.");
  await callRpc(client, "create_group", { p_name: normalizeGroupName(name) });
}

/**
 * Walks into a room. A plain insert rather than an RPC: `user_id` defaults to auth.uid() and
 * the policy checks only that it is you, so the rule "you may join yourself and nobody else"
 * lives in the database as a policy rather than in a function that could forget it.
 */
export async function joinGroup(client: ContactsClient, groupId: string) {
  const { error } = await client.from(GROUP_MEMBERS_TABLE).insert({ group_id: groupId });
  if (error) throw new Error(error.message);
}

export async function leaveGroup(client: ContactsClient, groupId: string) {
  await callRpc(client, "leave_group", { p_group_id: groupId });
}

export async function readGroup(client: ContactsClient, groupId: string): Promise<GroupRoom> {
  return readGroupRoom(await callRpc<unknown>(client, "read_group", { p_group_id: groupId }));
}

/**
 * Posts to the room. `sender_id` defaults to auth.uid() and the insert policy checks
 * membership, so neither is named here.
 */
export async function sendGroupMessage(client: ContactsClient, groupId: string, body: string) {
  const trimmed = body.trim().slice(0, MAX_GROUP_MESSAGE_CHARS);
  if (!trimmed) throw new Error("Write a message first.");

  const { error } = await client
    .from(GROUP_MESSAGES_TABLE)
    .insert({ group_id: groupId, body: trimmed });
  if (error) throw new Error(error.message);
}

/** Reporting is write-only; there is nothing to read back and nothing to show but a thank-you. */
export async function reportGroupMessage(client: ContactsClient, messageId: string, note: string) {
  const { error } = await client
    .from(GROUP_REPORTS_TABLE)
    .insert({ message_id: messageId, note: note.trim().slice(0, MAX_REPORT_NOTE_CHARS) });
  if (error) throw new Error(error.message);
}

async function callRpc<T>(
  client: ContactsClient,
  functionName: string,
  parameters: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client.rpc<T>(functionName, parameters);
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Groups are unavailable.");
  return data;
}

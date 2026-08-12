import {
  isContactEmail,
  MAX_MESSAGE_CHARS,
  normalizeContactEmail,
  readContactList,
  readDirectMessages,
  type ContactList,
  type DirectMessage,
} from "@/lib/contacts";

/**
 * The database calls behind the contacts page, against the narrowest client that can make
 * them. Same shape as `lib/shared-challenge-client.ts`: a test hands in a fake with an `rpc`
 * and a `from`, and nothing here ever needs a real Supabase connection.
 *
 * Relationships go through security-definer RPCs because they have to read auth.users for
 * an address. Messages go straight at the table, because their rules - only an accepted
 * contact may write, only a recipient may mark read - are RLS policies, and a definer
 * function would step around exactly the checks worth relying on.
 */
type QueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

export type MessageQuery = QueryResult<unknown[]> & {
  select: (columns: string) => MessageQuery;
  insert: (row: Record<string, string>) => MessageQuery;
  update: (values: Record<string, string>) => MessageQuery;
  or: (filter: string) => MessageQuery;
  eq: (column: string, value: string) => MessageQuery;
  is: (column: string, value: null) => MessageQuery;
  order: (column: string, options: { ascending: boolean }) => MessageQuery;
  limit: (count: number) => MessageQuery;
  single: () => QueryResult<unknown>;
};

export type ContactsClient = {
  rpc: <T>(name: string, parameters?: Record<string, unknown>) => QueryResult<T>;
  from: (table: string) => MessageQuery;
};

export const MESSAGES_TABLE = "paper_quiz_messages";
const MESSAGE_COLUMNS = "id, sender_id, recipient_id, body, created_at, read_at";

/**
 * How far back a thread is read. Long enough that no real study conversation hits it, small
 * enough that opening a contact is one quick request.
 */
export const THREAD_PAGE_SIZE = 200;

export async function listContacts(client: ContactsClient): Promise<ContactList> {
  return readContactList(await callRpc<unknown>(client, "list_contacts"));
}

/**
 * The reply is the same whether or not that address has an account - see the RPC - so this
 * resolves without a result to report and the caller shows one fixed message.
 */
export async function sendContactRequest(client: ContactsClient, email: string) {
  const normalized = normalizeContactEmail(email);
  if (!isContactEmail(normalized)) throw new Error("Enter a valid email address.");
  await callRpc(client, "send_contact_request", { p_email: normalized });
}

export async function acceptContactRequest(client: ContactsClient, contactId: string) {
  await callRpc(client, "accept_contact_request", { p_contact_id: contactId });
}

export async function removeContact(client: ContactsClient, contactId: string) {
  await callRpc(client, "remove_contact", { p_contact_id: contactId });
}

export async function loadThread(
  client: ContactsClient,
  userId: string,
  otherUserId: string,
): Promise<DirectMessage[]> {
  const { data, error } = await client
    .from(MESSAGES_TABLE)
    .select(MESSAGE_COLUMNS)
    .or(threadFilter(userId, otherUserId))
    .order("created_at", { ascending: true })
    .limit(THREAD_PAGE_SIZE);
  if (error) throw new Error(error.message);
  return readDirectMessages(data);
}

/**
 * Sends one message and returns the stored row, so the thread can show it immediately
 * rather than waiting on the reload that follows.
 */
export async function sendMessage(
  client: ContactsClient,
  recipientId: string,
  body: string,
): Promise<DirectMessage> {
  const trimmed = body.trim().slice(0, MAX_MESSAGE_CHARS);
  if (!trimmed) throw new Error("Write a message first.");

  const { data, error } = await client
    .from(MESSAGES_TABLE)
    // sender_id defaults to auth.uid(); naming it here would only invite disagreement.
    .insert({ recipient_id: recipientId, body: trimmed })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  const [message] = readDirectMessages([data]);
  if (!message) throw new Error("The message could not be sent.");
  return message;
}

/** Marks everything this contact has said as read. Only `read_at` is grantable to a reader. */
export async function markThreadRead(client: ContactsClient, userId: string, otherUserId: string) {
  const { error } = await client
    .from(MESSAGES_TABLE)
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .eq("sender_id", otherUserId)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

/**
 * A thread is every message either way between two people. PostgREST takes this as raw
 * filter text, so an id that is not a plain uuid could rewrite the condition rather than be
 * matched by it - both ids come from our own RPC, and both are checked anyway.
 */
export function threadFilter(userId: string, otherUserId: string) {
  for (const id of [userId, otherUserId]) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unknown contact.");
  }
  return [
    `and(sender_id.eq.${userId},recipient_id.eq.${otherUserId})`,
    `and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`,
  ].join(",");
}

async function callRpc<T>(
  client: ContactsClient,
  functionName: string,
  parameters: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client.rpc<T>(functionName, parameters);
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Contacts are unavailable.");
  return data;
}

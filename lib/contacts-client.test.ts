import { describe, expect, it, vi } from "vitest";
import {
  acceptContactRequest,
  listContacts,
  loadThread,
  markThreadRead,
  MESSAGES_TABLE,
  removeContact,
  sendContactRequest,
  sendMessage,
  threadFilter,
  type ContactsClient,
  type MessageQuery,
} from "@/lib/contacts-client";

const me = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

type Result = { data: unknown; error: { message: string } | null };

/**
 * A stand-in for the PostgREST builder: every filter records its call and hands back the
 * same object, and awaiting it anywhere in the chain settles with the fixed result.
 */
function createClient(result: Result = { data: [], error: null }) {
  const calls: [string, ...unknown[]][] = [];
  const rpc = vi.fn().mockResolvedValue(result);
  const from = vi.fn(() => query);

  const chain =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return query;
    };

  const query = {
    select: chain("select"),
    insert: chain("insert"),
    update: chain("update"),
    or: chain("or"),
    eq: chain("eq"),
    is: chain("is"),
    order: chain("order"),
    limit: chain("limit"),
    single: () => {
      calls.push(["single"]);
      return Promise.resolve(result);
    },
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  } as unknown as MessageQuery;

  return { client: { rpc, from } as unknown as ContactsClient, rpc, from, calls };
}

describe("contact relationships", () => {
  it("normalizes the address before the request leaves the browser", async () => {
    const { client, rpc } = createClient({ data: { status: "sent" }, error: null });

    await sendContactRequest(client, "  Ada@Example.EDU ");

    expect(rpc).toHaveBeenCalledWith("send_contact_request", { p_email: "ada@example.edu" });
  });

  it("refuses an address the RPC would only reject", async () => {
    const { client, rpc } = createClient();

    await expect(sendContactRequest(client, "ada@example")).rejects.toThrow(
      "Enter a valid email address.",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts and removes by relationship id", async () => {
    const { client, rpc } = createClient({ data: { status: "accepted" }, error: null });

    await acceptContactRequest(client, "c1");
    await removeContact(client, "c1");

    expect(rpc).toHaveBeenNthCalledWith(1, "accept_contact_request", { p_contact_id: "c1" });
    expect(rpc).toHaveBeenNthCalledWith(2, "remove_contact", { p_contact_id: "c1" });
  });

  it("parses the whole page out of one round trip", async () => {
    const { client, rpc } = createClient({
      data: {
        userId: me,
        contacts: [{ contactId: "c1", userId: other, email: "ada@example.edu", unreadCount: 1 }],
        incoming: [],
        outgoing: [],
      },
      error: null,
    });

    const list = await listContacts(client);

    expect(rpc).toHaveBeenCalledWith("list_contacts", {});
    expect(list.userId).toBe(me);
    expect(list.contacts[0].email).toBe("ada@example.edu");
  });

  it("surfaces a database error instead of swallowing it", async () => {
    const { client } = createClient({ data: null, error: { message: "Sign in first." } });

    await expect(listContacts(client)).rejects.toThrow("Sign in first.");
  });
});

describe("threads", () => {
  it("reads both directions between the two people, oldest first", async () => {
    const { client, from, calls } = createClient({
      data: [
        {
          id: "m1",
          sender_id: other,
          recipient_id: me,
          body: "Why is question 3 B?",
          created_at: "2026-08-13T10:00:00+00:00",
          read_at: null,
        },
      ],
      error: null,
    });

    const messages = await loadThread(client, me, other);

    expect(from).toHaveBeenCalledWith(MESSAGES_TABLE);
    expect(calls).toContainEqual(["or", threadFilter(me, other)]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: true }]);
    expect(messages[0].body).toBe("Why is question 3 B?");
  });

  it("will not build a filter out of an id that is not a uuid", () => {
    expect(() => threadFilter(me, "*,sender_id.not.is.null")).toThrow("Unknown contact.");
  });

  it("leaves the sender to the database and returns the stored row", async () => {
    const { client, calls } = createClient({
      data: {
        id: "m2",
        sender_id: me,
        recipient_id: other,
        body: "Because of the base rate.",
        created_at: "2026-08-13T11:00:00+00:00",
        read_at: null,
      },
      error: null,
    });

    const sent = await sendMessage(client, other, "  Because of the base rate.  ");

    const [, row] = calls.find(([name]) => name === "insert") ?? [];
    expect(row).toEqual({ recipient_id: other, body: "Because of the base rate." });
    expect(Object.keys(row as Record<string, string>)).not.toContain("sender_id");
    expect(sent.id).toBe("m2");
  });

  it("refuses to send nothing", async () => {
    const { client, from } = createClient();

    await expect(sendMessage(client, other, "   ")).rejects.toThrow("Write a message first.");
    expect(from).not.toHaveBeenCalled();
  });

  it("marks only what this contact said to us, and only what is still unread", async () => {
    const { client, calls } = createClient({ data: [], error: null });

    await markThreadRead(client, me, other);

    expect(calls).toContainEqual(["eq", "recipient_id", me]);
    expect(calls).toContainEqual(["eq", "sender_id", other]);
    expect(calls).toContainEqual(["is", "read_at", null]);
    const [, values] = calls.find(([name]) => name === "update") ?? [];
    expect(Object.keys(values as Record<string, string>)).toEqual(["read_at"]);
  });
});

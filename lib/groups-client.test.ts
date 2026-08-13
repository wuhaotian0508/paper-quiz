import { describe, expect, it, vi } from "vitest";
import {
  createGroup,
  GROUP_MEMBERS_TABLE,
  GROUP_MESSAGES_TABLE,
  GROUP_REPORTS_TABLE,
  joinGroup,
  leaveGroup,
  listGroups,
  readGroup,
  reportGroupMessage,
  sendGroupMessage,
} from "@/lib/groups-client";
import type { ContactsClient, MessageQuery } from "@/lib/contacts-client";

const group = "33333333-3333-4333-8333-333333333333";

type Result = { data: unknown; error: { message: string } | null };

function createClient(result: Result = { data: {}, error: null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  const tables: string[] = [];
  const calls: [string, ...unknown[]][] = [];
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
    single: () => Promise.resolve(result),
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  } as unknown as MessageQuery;

  const from = (table: string) => {
    tables.push(table);
    return query;
  };
  return { client: { rpc, from } as unknown as ContactsClient, rpc, tables, calls };
}

describe("rooms", () => {
  it("creates a group under a trimmed course name", async () => {
    const { client, rpc } = createClient({
      data: { groupId: group, name: "UGBA 117" },
      error: null,
    });

    await createGroup(client, "  UGBA 117  ");

    expect(rpc).toHaveBeenCalledWith("create_group", { p_name: "UGBA 117" });
  });

  it("refuses a name that is only whitespace", async () => {
    const { client, rpc } = createClient();

    await expect(createGroup(client, "   ")).rejects.toThrow("Give the group a course name.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("parses the whole directory out of one round trip", async () => {
    const { client, rpc } = createClient({
      data: {
        userId: "me",
        groups: [{ groupId: group, name: "UGBA 117", memberCount: 3, joined: true }],
      },
      error: null,
    });

    const list = await listGroups(client);

    expect(rpc).toHaveBeenCalledWith("list_groups", {});
    expect(list.groups[0].name).toBe("UGBA 117");
    expect(list.groups[0].joined).toBe(true);
  });

  it("joins by writing one row about yourself, and nothing about who you are", async () => {
    const { client, tables, calls } = createClient({ data: [], error: null });

    await joinGroup(client, group);

    expect(tables).toContain(GROUP_MEMBERS_TABLE);
    const [, row] = calls.find(([name]) => name === "insert") ?? [];
    // user_id defaults to auth.uid(); naming it would only invite disagreement.
    expect(row).toEqual({ group_id: group });
  });

  it("leaves by group id", async () => {
    const { client, rpc } = createClient({ data: { status: "left" }, error: null });

    await leaveGroup(client, group);

    expect(rpc).toHaveBeenCalledWith("leave_group", { p_group_id: group });
  });

  it("reads a room's messages and roster", async () => {
    const { client, rpc } = createClient({
      data: {
        messages: [
          { id: "m1", senderId: "u1", name: "ada", body: "hi", createdAt: "2026-08-15T10:00:00Z" },
        ],
        members: ["ada"],
      },
      error: null,
    });

    const room = await readGroup(client, group);

    expect(rpc).toHaveBeenCalledWith("read_group", { p_group_id: group });
    expect(room.members).toEqual(["ada"]);
  });

  it("surfaces a database error rather than showing an empty room", async () => {
    const { client } = createClient({
      data: null,
      error: { message: "That group is unavailable." },
    });

    await expect(readGroup(client, group)).rejects.toThrow("That group is unavailable.");
  });
});

describe("posting and reporting", () => {
  it("names neither the sender nor the membership when posting", async () => {
    const { client, tables, calls } = createClient({ data: [], error: null });

    await sendGroupMessage(client, group, "  Anyone doing the problem set?  ");

    expect(tables).toContain(GROUP_MESSAGES_TABLE);
    const [, row] = calls.find(([name]) => name === "insert") ?? [];
    expect(row).toEqual({ group_id: group, body: "Anyone doing the problem set?" });
  });

  it("refuses to post nothing", async () => {
    const { client, tables } = createClient();

    await expect(sendGroupMessage(client, group, "   ")).rejects.toThrow("Write a message first.");
    expect(tables).toEqual([]);
  });

  it("reports a message with a trimmed note", async () => {
    const { client, tables, calls } = createClient({ data: [], error: null });

    await reportGroupMessage(client, "m1", "  spam  ");

    expect(tables).toContain(GROUP_REPORTS_TABLE);
    const [, row] = calls.find(([name]) => name === "insert") ?? [];
    expect(row).toEqual({ message_id: "m1", note: "spam" });
  });
});

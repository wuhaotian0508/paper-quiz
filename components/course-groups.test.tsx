import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CourseGroups } from "./course-groups";
import type { ContactsClient, MessageQuery } from "@/lib/contacts-client";

const me = "11111111-1111-4111-8111-111111111111";
const ada = "22222222-2222-4222-8222-222222222222";
const ugba = "33333333-3333-4333-8333-333333333333";

type Result = { data: unknown; error: { message: string } | null };

const emptyList = { userId: me, groups: [] };

function group(overrides: Record<string, unknown> = {}) {
  return {
    groupId: ugba,
    name: "UGBA 117",
    memberCount: 3,
    joined: true,
    lastMessage: "",
    lastMessageAt: "",
    ...overrides,
  };
}

/** `list_groups` and `read_group` each answer from their own queue; the rest answer once. */
function createClient({
  lists = [emptyList] as unknown[],
  rooms = [{ messages: [], members: [] }] as unknown[],
  rpcError = null as { message: string } | null,
}) {
  const remainingLists = [...lists];
  const remainingRooms = [...rooms];
  const rpc = vi.fn((name: string) => {
    if (rpcError) return Promise.resolve({ data: null, error: rpcError });
    if (name === "list_groups") {
      return Promise.resolve({
        data: remainingLists.length > 1 ? remainingLists.shift() : remainingLists[0],
        error: null,
      });
    }
    if (name === "read_group") {
      return Promise.resolve({
        data: remainingRooms.length > 1 ? remainingRooms.shift() : remainingRooms[0],
        error: null,
      });
    }
    return Promise.resolve({ data: { status: "ok" }, error: null });
  });

  const tables: string[] = [];
  const calls: [string, ...unknown[]][] = [];
  const chain =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return query;
    };
  const settled: Result = { data: [], error: null };
  const query = {
    select: chain("select"),
    insert: chain("insert"),
    update: chain("update"),
    or: chain("or"),
    eq: chain("eq"),
    is: chain("is"),
    order: chain("order"),
    limit: chain("limit"),
    single: () => Promise.resolve(settled),
    then: (resolve: (value: Result) => unknown) => Promise.resolve(settled).then(resolve),
  } as unknown as MessageQuery;

  const from = (table: string) => {
    tables.push(table);
    return query;
  };
  return { client: { rpc, from } as unknown as ContactsClient, rpc, tables, calls };
}

afterEach(cleanup);

it("creates a group under a course name", async () => {
  const { client, rpc } = createClient({
    lists: [emptyList, { ...emptyList, groups: [group()] }],
  });
  render(<CourseGroups client={client} />);
  await screen.findByText("No groups yet. Start one, or join a course below.");

  fireEvent.change(screen.getByLabelText("Start a group"), { target: { value: "UGBA 117" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() => expect(rpc).toHaveBeenCalledWith("create_group", { p_name: "UGBA 117" }));
  expect(
    await screen.findByRole("button", { name: "Open the UGBA 117 group" }),
  ).toBeInTheDocument();
  // Naming a course somebody already started puts you in theirs, and the copy says so.
  expect(
    screen.getByText("You are in the room. Anyone who names the same course joins this one."),
  ).toBeInTheDocument();
});

it("lists a course nobody has joined yet and lets anyone walk into it", async () => {
  const { client, tables, calls } = createClient({
    lists: [
      { ...emptyList, groups: [group({ joined: false })] },
      { ...emptyList, groups: [group()] },
    ],
  });
  render(<CourseGroups client={client} />);

  expect(await screen.findByText("Other courses")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Join the UGBA 117 group" }));

  await waitFor(() => expect(tables).toContain("paper_quiz_group_members"));
  const [, row] = calls.find(([name]) => name === "insert") ?? [];
  expect(row).toEqual({ group_id: ugba });
});

it("will not open a room the learner has not joined", async () => {
  const { client, rpc } = createClient({
    lists: [{ ...emptyList, groups: [group({ joined: false })] }],
  });
  render(<CourseGroups client={client} />);

  const row = await screen.findByRole("button", { name: "UGBA 117 — join to read it" });
  expect(row).toBeDisabled();
  expect(rpc).not.toHaveBeenCalledWith("read_group", expect.anything());
});

it("shows the room and posts to it without naming the sender", async () => {
  const { client, tables, calls } = createClient({
    lists: [{ ...emptyList, groups: [group()] }],
    rooms: [
      {
        messages: [
          {
            id: "m1",
            senderId: ada,
            name: "ada",
            body: "Anyone doing the problem set?",
            createdAt: "2026-08-15T10:00:00+00:00",
          },
        ],
        members: ["ada", "me"],
      },
    ],
  });
  render(<CourseGroups client={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open the UGBA 117 group" }));

  expect(await screen.findByText("Anyone doing the problem set?")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Message the UGBA 117 group"), {
    target: { value: "I am, chapter 4" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => expect(tables).toContain("paper_quiz_group_messages"));
  const [, row] = calls.find(([name]) => name === "insert") ?? [];
  expect(row).toEqual({ group_id: ugba, body: "I am, chapter 4" });
});

it("offers a report on what someone else said, and not on your own words", async () => {
  vi.spyOn(window, "prompt").mockReturnValue("spam");
  const { client, tables, calls } = createClient({
    lists: [{ ...emptyList, groups: [group()] }],
    rooms: [
      {
        messages: [
          {
            id: "m1",
            senderId: ada,
            name: "ada",
            body: "buy my notes",
            createdAt: "2026-08-15T10:00:00Z",
          },
          {
            id: "m2",
            senderId: me,
            name: "me",
            body: "no thanks",
            createdAt: "2026-08-15T10:01:00Z",
          },
        ],
        members: ["ada", "me"],
      },
    ],
  });
  render(<CourseGroups client={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open the UGBA 117 group" }));

  expect(await screen.findAllByRole("button", { name: /Report what/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Report what ada said" }));

  await waitFor(() => expect(tables).toContain("paper_quiz_group_message_reports"));
  const [, row] = calls.find(([name]) => name === "insert") ?? [];
  expect(row).toEqual({ message_id: "m1", note: "spam" });
});

it("warns that leaving last takes the room with it", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { client, rpc } = createClient({ lists: [{ ...emptyList, groups: [group()] }] });
  render(<CourseGroups client={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open the UGBA 117 group" }));

  fireEvent.click(await screen.findByRole("button", { name: "Leave the UGBA 117 group" }));

  expect(confirm).toHaveBeenCalledWith(
    "Leave UGBA 117? The room disappears if you are the last one in it.",
  );
  expect(rpc).not.toHaveBeenCalledWith("leave_group", expect.anything());
});

/**
 * Whatever stops the directory loading stopped the contact list beside it too, and that panel
 * says so. Two copies of one sentence on one screen is worse than one.
 */
it("stays quiet when the directory cannot be read, because the panel beside it speaks", async () => {
  const { client } = createClient({ rpcError: { message: "Sign in to see your groups." } });
  render(<CourseGroups client={client} />);

  await screen.findByText("Course groups");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("does speak when something the learner pressed fails", async () => {
  const { client, rpc } = createClient({ lists: [emptyList] });
  rpc.mockImplementation((name: string) =>
    name === "create_group"
      ? Promise.resolve({ data: null, error: { message: "Give the group a course name." } })
      : Promise.resolve({ data: emptyList, error: null }),
  );
  render(<CourseGroups client={client} />);
  await screen.findByText("No groups yet. Start one, or join a course below.");

  fireEvent.change(screen.getByLabelText("Start a group"), { target: { value: "UGBA 117" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Give the group a course name.");
});

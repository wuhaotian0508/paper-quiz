import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContactsView } from "./contacts-view";
import { CONTACTS_UNREAD_EVENT } from "@/lib/contacts";
import type { ContactsClient, MessageQuery } from "@/lib/contacts-client";

const me = "11111111-1111-4111-8111-111111111111";
const ada = "22222222-2222-4222-8222-222222222222";

type Result = { data: unknown; error: { message: string } | null };

const emptyList = { userId: me, contacts: [], incoming: [], outgoing: [] };

function contactList(overrides: Record<string, unknown> = {}) {
  return { ...emptyList, ...overrides };
}

const adaContact = {
  contactId: "c1",
  userId: ada,
  email: "ada@example.edu",
  unreadCount: 0,
  lastMessage: "",
  lastMessageAt: "",
};

/**
 * A fake Supabase client: `rpc` answers from a queue of results per function name, and the
 * table builder records its chain and settles with whatever `tableResult` currently holds.
 */
function createClient({
  lists = [emptyList],
  messages = [] as unknown[],
  rpcError = null as { message: string } | null,
}) {
  const remaining = [...lists];
  const rpc = vi.fn((name: string) => {
    if (rpcError) return Promise.resolve({ data: null, error: rpcError });
    if (name !== "list_contacts") return Promise.resolve({ data: { status: "ok" }, error: null });
    const next = remaining.length > 1 ? remaining.shift() : remaining[0];
    return Promise.resolve({ data: next, error: null });
  });

  let tableResult: Result = { data: messages, error: null };
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
    single: () => Promise.resolve(tableResult),
    then: (resolve: (value: Result) => unknown) => Promise.resolve(tableResult).then(resolve),
  } as unknown as MessageQuery;

  return {
    client: { rpc, from: () => query } as unknown as ContactsClient,
    rpc,
    calls,
    setTableResult: (result: Result) => {
      tableResult = result;
    },
  };
}

afterEach(cleanup);

it("says nothing about whether the address has an account", async () => {
  const { client, rpc } = createClient({});
  render(<ContactsView client={client} />);

  fireEvent.change(screen.getByLabelText("Add by email"), {
    target: { value: " Ada@Example.EDU " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));

  await waitFor(() =>
    expect(
      screen.getByText("If that address has an account, your request is waiting for them."),
    ).toBeInTheDocument(),
  );
  expect(rpc).toHaveBeenCalledWith("send_contact_request", { p_email: "ada@example.edu" });
});

it("turns away a malformed address before it reaches the database", async () => {
  const { client, rpc } = createClient({});
  render(<ContactsView client={client} />);
  await screen.findByText("No contacts yet. Add a classmate by email to start.");

  fireEvent.change(screen.getByLabelText("Add by email"), { target: { value: "ada@example" } });
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));

  await screen.findByText("Enter a valid email address.");
  expect(rpc).not.toHaveBeenCalledWith("send_contact_request", expect.anything());
});

it("accepts a request and shows the person as a contact", async () => {
  const { client, rpc } = createClient({
    lists: [
      contactList({
        incoming: [
          {
            contactId: "c1",
            userId: ada,
            email: "ada@example.edu",
            createdAt: "2026-08-12T10:00:00+00:00",
          },
        ],
      }),
      contactList({ contacts: [adaContact] }),
    ],
  });
  render(<ContactsView client={client} />);

  fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

  await screen.findByRole("button", { name: "Open the conversation with ada" });
  expect(rpc).toHaveBeenCalledWith("accept_contact_request", { p_contact_id: "c1" });
});

it("opens a thread, marks it read and tells the sidebar the badge is clear", async () => {
  const { client, calls } = createClient({
    lists: [
      contactList({ contacts: [{ ...adaContact, unreadCount: 2 }] }),
      contactList({ contacts: [adaContact] }),
    ],
    messages: [
      {
        id: "m1",
        sender_id: ada,
        recipient_id: me,
        body: "Why is question 3 B?",
        created_at: "2026-08-13T10:00:00+00:00",
        read_at: null,
      },
    ],
  });
  const unreadTotals: unknown[] = [];
  const listen = (event: Event) => unreadTotals.push((event as CustomEvent<unknown>).detail);
  window.addEventListener(CONTACTS_UNREAD_EVENT, listen);

  render(<ContactsView client={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open the conversation with ada" }));

  await screen.findByText("Why is question 3 B?");
  await waitFor(() => expect(calls).toContainEqual(["is", "read_at", null]));
  await waitFor(() => expect(unreadTotals).toContain(0));
  window.removeEventListener(CONTACTS_UNREAD_EVENT, listen);
});

it("shows a sent message straight away", async () => {
  const { client, setTableResult, calls } = createClient({
    lists: [contactList({ contacts: [adaContact] })],
  });
  render(<ContactsView client={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open the conversation with ada" }));
  await screen.findByText("No messages yet. Say hello.");

  setTableResult({
    data: {
      id: "m2",
      sender_id: me,
      recipient_id: ada,
      body: "Because of the base rate.",
      created_at: "2026-08-13T11:00:00+00:00",
      read_at: null,
    },
    error: null,
  });
  fireEvent.change(screen.getByLabelText("Message ada"), {
    target: { value: "Because of the base rate." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  await screen.findByText("Because of the base rate.");
  expect(calls).toContainEqual([
    "insert",
    { recipient_id: ada, body: "Because of the base rate." },
  ]);
});

it("says so when the list cannot be read, rather than looking empty", async () => {
  const { client } = createClient({ rpcError: { message: "Sign in to see your contacts." } });
  render(<ContactsView client={client} />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Sign in to see your contacts.");
});

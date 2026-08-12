import { describe, expect, it } from "vitest";
import {
  contactName,
  EMPTY_CONTACT_LIST,
  groupMessagesByDay,
  isContactEmail,
  mergeMessages,
  normalizeContactEmail,
  readContactList,
  readDirectMessages,
  sortContacts,
  unreadFrom,
  unreadTotal,
  type Contact,
  type DirectMessage,
} from "@/lib/contacts";

function contact(overrides: Partial<Contact>): Contact {
  return {
    contactId: "c1",
    userId: "u1",
    email: "ada@example.edu",
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "",
    ...overrides,
  };
}

function message(overrides: Partial<DirectMessage>): DirectMessage {
  return {
    id: "m1",
    senderId: "u1",
    recipientId: "me",
    body: "Hello",
    createdAt: "2026-08-13T10:00:00+00:00",
    readAt: null,
    ...overrides,
  };
}

describe("contact email", () => {
  it("sends what the database will compare against", () => {
    expect(normalizeContactEmail("  Ada@Example.EDU ")).toBe("ada@example.edu");
  });

  it("turns away what the RPC would reject anyway", () => {
    expect(isContactEmail("ada@example.edu")).toBe(true);
    expect(isContactEmail(" ADA@example.edu ")).toBe(true);
    expect(isContactEmail("ada@example")).toBe(false);
    expect(isContactEmail("ada example.edu")).toBe(false);
    expect(isContactEmail("")).toBe(false);
  });

  it("names someone we only have an address for", () => {
    expect(contactName("ada.lovelace@example.edu")).toBe("ada.lovelace");
    expect(contactName("nobody")).toBe("nobody");
  });
});

describe("contact ordering", () => {
  it("lifts whoever is waiting on an answer above whoever spoke most recently", () => {
    const sorted = sortContacts([
      contact({ contactId: "recent", email: "b@x.edu", lastMessageAt: "2026-08-13T12:00:00Z" }),
      contact({
        contactId: "waiting",
        email: "a@x.edu",
        unreadCount: 2,
        lastMessageAt: "2026-08-01T09:00:00Z",
      }),
      contact({ contactId: "quiet", email: "c@x.edu" }),
    ]);

    expect(sorted.map((entry) => entry.contactId)).toEqual(["waiting", "recent", "quiet"]);
  });

  it("counts every unread message across the list", () => {
    expect(unreadTotal([contact({ unreadCount: 2 }), contact({ unreadCount: 3 })])).toBe(5);
    expect(unreadTotal([])).toBe(0);
  });

  it("leaves the caller's array alone", () => {
    const contacts = [contact({ contactId: "a" }), contact({ contactId: "b", unreadCount: 1 })];
    sortContacts(contacts);
    expect(contacts.map((entry) => entry.contactId)).toEqual(["a", "b"]);
  });
});

describe("thread assembly", () => {
  it("shows a just-sent message once, not twice, when the reload brings it back", () => {
    const sent = message({ id: "m2", senderId: "me", createdAt: "2026-08-13T11:00:00+00:00" });
    const merged = mergeMessages([message({ id: "m1" }), sent], [sent, message({ id: "m1" })]);

    expect(merged.map((entry) => entry.id)).toEqual(["m1", "m2"]);
  });

  it("puts a thread in the order it was said", () => {
    const merged = mergeMessages([
      message({ id: "late", createdAt: "2026-08-13T18:00:00+00:00" }),
      message({ id: "early", createdAt: "2026-08-13T08:00:00+00:00" }),
    ]);

    expect(merged.map((entry) => entry.id)).toEqual(["early", "late"]);
  });

  it("breaks a thread into the days it happened on", () => {
    const days = groupMessagesByDay([
      message({ id: "a", createdAt: "2026-08-12T08:00:00+00:00" }),
      message({ id: "b", createdAt: "2026-08-13T09:00:00+00:00" }),
      message({ id: "c", createdAt: "2026-08-13T10:00:00+00:00" }),
    ]);

    expect(days).toEqual([
      { date: "2026-08-12", messages: [expect.objectContaining({ id: "a" })] },
      {
        date: "2026-08-13",
        messages: [expect.objectContaining({ id: "b" }), expect.objectContaining({ id: "c" })],
      },
    ]);
  });

  it("counts only what was said to us and not yet read", () => {
    const unread = unreadFrom(
      [
        message({ id: "a" }),
        message({ id: "b", readAt: "2026-08-13T10:05:00+00:00" }),
        message({ id: "c", senderId: "me", recipientId: "u1" }),
      ],
      "me",
    );

    expect(unread.map((entry) => entry.id)).toEqual(["a"]);
  });
});

describe("reading what the database returned", () => {
  it("parses a full contact list", () => {
    const list = readContactList({
      userId: "me",
      contacts: [
        {
          contactId: "c1",
          userId: "u1",
          email: "ada@example.edu",
          unreadCount: 2,
          lastMessage: "See you at office hours",
          lastMessageAt: "2026-08-13T10:00:00+00:00",
        },
      ],
      incoming: [
        {
          contactId: "c2",
          userId: "u2",
          email: "grace@example.edu",
          createdAt: "2026-08-12T10:00:00+00:00",
        },
      ],
      outgoing: [],
    });

    expect(list.userId).toBe("me");
    expect(list.contacts[0].unreadCount).toBe(2);
    expect(list.incoming[0].email).toBe("grace@example.edu");
    expect(list.outgoing).toEqual([]);
  });

  it("draws nothing rather than throwing when the payload is not what we expected", () => {
    expect(readContactList(null)).toEqual(EMPTY_CONTACT_LIST);
    expect(readContactList("unavailable")).toEqual(EMPTY_CONTACT_LIST);
    expect(readContactList({ contacts: "broken" })).toEqual(EMPTY_CONTACT_LIST);
  });

  it("drops a row it could neither name nor act on", () => {
    const list = readContactList({
      contacts: [{ contactId: "c1", email: "" }, { email: "ada@example.edu" }],
      incoming: [{}],
    });

    expect(list.contacts).toEqual([]);
    expect(list.incoming).toEqual([]);
  });

  it("parses message rows out of their database column names", () => {
    const messages = readDirectMessages([
      {
        id: "m1",
        sender_id: "u1",
        recipient_id: "me",
        body: "Why is question 3 B?",
        created_at: "2026-08-13T10:00:00+00:00",
        read_at: null,
      },
      { id: "m2", sender_id: "me", recipient_id: "u1", body: "", created_at: "x", read_at: "y" },
    ]);

    expect(messages).toEqual([
      {
        id: "m1",
        senderId: "u1",
        recipientId: "me",
        body: "Why is question 3 B?",
        createdAt: "2026-08-13T10:00:00+00:00",
        readAt: null,
      },
    ]);
  });
});

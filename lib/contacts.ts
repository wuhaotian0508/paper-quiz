/**
 * Shapes and rules for the contacts page. Everything here is pure: the database calls live
 * in `lib/contacts-client.ts`, so the parsing and ordering below can be tested without one.
 */

/** Mirrors the `char_length(body) between 1 and 2000` check on paper_quiz_messages. */
export const MAX_MESSAGE_CHARS = 2000;

export type Contact = {
  contactId: string;
  userId: string;
  email: string;
  unreadCount: number;
  /** Empty until the two have said something to each other. */
  lastMessage: string;
  lastMessageAt: string;
};

export type ContactRequest = {
  contactId: string;
  userId: string;
  email: string;
  createdAt: string;
};

export type ContactList = {
  /** The signed-in learner, returned alongside the list so a thread knows its own side. */
  userId: string;
  contacts: Contact[];
  incoming: ContactRequest[];
  outgoing: ContactRequest[];
};

export type DirectMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

/**
 * Announces the unread total after a load. The sidebar badge sits outside the contacts page
 * and owns none of its state, so the page tells it rather than the two polling separately.
 */
export const CONTACTS_UNREAD_EVENT = "paper-quiz-contacts-unread";

export const EMPTY_CONTACT_LIST: ContactList = {
  userId: "",
  contacts: [],
  incoming: [],
  outgoing: [],
};

/**
 * The same address written two ways is the same person, and the database compares on
 * `lower(email)`, so the client sends what the database will look for.
 */
export function normalizeContactEmail(value: string) {
  return value.trim().toLowerCase();
}

/** Deliberately loose, and identical to the pattern the RPC applies. */
export function isContactEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizeContactEmail(value));
}

/**
 * A name for someone we only know an address for. Accounts carry no display name, and a
 * column of full addresses is unreadable, so the local part stands in and the full address
 * stays available as a tooltip.
 */
export function contactName(email: string) {
  const [local] = email.split("@");
  return local || email;
}

export function unreadTotal(contacts: Contact[]) {
  return contacts.reduce((total, contact) => total + contact.unreadCount, 0);
}

/**
 * Unread first, then most recently spoken to. The RPC already returns them newest-first;
 * this lifts the ones waiting on an answer above a thread that is merely recent.
 */
export function sortContacts(contacts: Contact[]) {
  return [...contacts].sort((left, right) => {
    if (left.unreadCount > 0 !== right.unreadCount > 0) return left.unreadCount > 0 ? -1 : 1;
    if (left.lastMessageAt !== right.lastMessageAt)
      return right.lastMessageAt.localeCompare(left.lastMessageAt);
    return left.email.localeCompare(right.email);
  });
}

/**
 * Oldest first, one entry per id. A just-sent message is shown before the reload that
 * confirms it, so the same message arrives twice and the local copy must not double up.
 */
export function mergeMessages(...groups: DirectMessage[][]): DirectMessage[] {
  const byId = new Map<string, DirectMessage>();
  for (const group of groups) {
    for (const message of group) byId.set(message.id, message);
  }
  return [...byId.values()].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
}

/** Calendar days, in the order they happened, so a thread can carry date separators. */
export function groupMessagesByDay(messages: DirectMessage[]) {
  const days: { date: string; messages: DirectMessage[] }[] = [];
  for (const message of mergeMessages(messages)) {
    const date = message.createdAt.slice(0, 10);
    const current = days.at(-1);
    if (current?.date === date) current.messages.push(message);
    else days.push({ date, messages: [message] });
  }
  return days;
}

/** Which of the two ids is not the signed-in learner. */
export function otherParticipant(message: DirectMessage, userId: string) {
  return message.senderId === userId ? message.recipientId : message.senderId;
}

export function unreadFrom(messages: DirectMessage[], userId: string) {
  return messages.filter((message) => message.recipientId === userId && message.readAt === null);
}

/**
 * Parses what `list_contacts()` returned.
 *
 * Defensive rather than trusting: this crosses the network as untyped jsonb, and a contacts
 * page that renders nothing is a better failure than one that throws and takes the workspace
 * down with it.
 */
export function readContactList(value: unknown): ContactList {
  const record = asRecord(value);
  return {
    userId: asText(record.userId),
    contacts: asArray(record.contacts).map(readContact).filter(hasIdentity),
    incoming: asArray(record.incoming).map(readContactRequest).filter(hasIdentity),
    outgoing: asArray(record.outgoing).map(readContactRequest).filter(hasIdentity),
  };
}

/** Parses rows selected straight from paper_quiz_messages. */
export function readDirectMessages(value: unknown): DirectMessage[] {
  return mergeMessages(
    asArray(value)
      .map((row) => {
        const record = asRecord(row);
        return {
          id: asText(record.id),
          senderId: asText(record.sender_id),
          recipientId: asText(record.recipient_id),
          body: asText(record.body),
          createdAt: asText(record.created_at),
          readAt: typeof record.read_at === "string" ? record.read_at : null,
        };
      })
      .filter((message) => message.id && message.body),
  );
}

function readContact(value: unknown): Contact {
  const record = asRecord(value);
  return {
    contactId: asText(record.contactId),
    userId: asText(record.userId),
    email: asText(record.email),
    unreadCount: typeof record.unreadCount === "number" ? record.unreadCount : 0,
    lastMessage: asText(record.lastMessage),
    lastMessageAt: asText(record.lastMessageAt),
  };
}

function readContactRequest(value: unknown): ContactRequest {
  const record = asRecord(value);
  return {
    contactId: asText(record.contactId),
    userId: asText(record.userId),
    email: asText(record.email),
    createdAt: asText(record.createdAt),
  };
}

/** A row we cannot name or address cannot be drawn or acted on, so it is dropped. */
function hasIdentity(entry: { contactId: string; email: string }) {
  return Boolean(entry.contactId && entry.email);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

/**
 * Shapes and rules for course groups. Pure, like `lib/contacts.ts` and `lib/nearby.ts`; the
 * database calls live in `lib/groups-client.ts`.
 */

/** Mirrors the check on paper_quiz_group_messages.body. */
export const MAX_GROUP_MESSAGE_CHARS = 2000;
/** Mirrors the check on paper_quiz_groups.name. */
export const MAX_GROUP_NAME_CHARS = 80;
/** Mirrors the check on paper_quiz_group_message_reports.note. */
export const MAX_REPORT_NOTE_CHARS = 500;

export type GroupSummary = {
  groupId: string;
  name: string;
  memberCount: number;
  /** Whether the caller is in this room, as opposed to merely able to see it exists. */
  joined: boolean;
  /** Empty until somebody has said something, and always empty for a room not joined. */
  lastMessage: string;
  lastMessageAt: string;
};

export type GroupList = {
  userId: string;
  groups: GroupSummary[];
};

export type GroupMessage = {
  id: string;
  senderId: string;
  name: string;
  body: string;
  createdAt: string;
};

export type GroupRoom = {
  messages: GroupMessage[];
  /** Display names of everyone who has joined. */
  members: string[];
};

export const EMPTY_GROUP_LIST: GroupList = { userId: "", groups: [] };
export const EMPTY_GROUP_ROOM: GroupRoom = { messages: [], members: [] };

/** Trimmed to what the database will accept, so the two never disagree about the name. */
export function normalizeGroupName(value: string) {
  return value.trim().slice(0, MAX_GROUP_NAME_CHARS);
}

export function isGroupName(value: string) {
  return normalizeGroupName(value).length > 0;
}

/**
 * Rooms you are in come first, most recently spoken in at the top; then the rest of the
 * directory by name. Your own courses are what you came for; the others are for browsing.
 */
export function sortGroups(groups: GroupSummary[]) {
  return [...groups].sort((left, right) => {
    if (left.joined !== right.joined) return left.joined ? -1 : 1;
    if (left.joined && left.lastMessageAt !== right.lastMessageAt)
      return right.lastMessageAt.localeCompare(left.lastMessageAt);
    return left.name.localeCompare(right.name);
  });
}

/** Split for the two headings the panel draws. */
export function partitionGroups(groups: GroupSummary[]) {
  const sorted = sortGroups(groups);
  return {
    mine: sorted.filter((group) => group.joined),
    open: sorted.filter((group) => !group.joined),
  };
}

/** Oldest first, one entry per id — the same reason `mergeMessages` exists for a thread. */
export function mergeGroupMessages(...groups: GroupMessage[][]): GroupMessage[] {
  const byId = new Map<string, GroupMessage>();
  for (const group of groups) {
    for (const message of group) byId.set(message.id, message);
  }
  return [...byId.values()].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
}

/** Calendar days in the order they happened, so a room can carry date separators. */
export function groupMessagesByDay(messages: GroupMessage[]) {
  const days: { date: string; messages: GroupMessage[] }[] = [];
  for (const message of mergeGroupMessages(messages)) {
    const date = message.createdAt.slice(0, 10);
    const current = days.at(-1);
    if (current?.date === date) current.messages.push(message);
    else days.push({ date, messages: [message] });
  }
  return days;
}

export function readGroupList(value: unknown): GroupList {
  const record = asRecord(value);
  return {
    userId: asText(record.userId),
    groups: asArray(record.groups)
      .map(readSummary)
      .filter((group) => group.groupId && group.name),
  };
}

export function readGroupRoom(value: unknown): GroupRoom {
  const record = asRecord(value);
  return {
    messages: mergeGroupMessages(
      asArray(record.messages)
        .map(readMessage)
        .filter((message) => message.id && message.body),
    ),
    members: asArray(record.members).filter((name): name is string => typeof name === "string"),
  };
}

function readSummary(value: unknown): GroupSummary {
  const record = asRecord(value);
  return {
    groupId: asText(record.groupId),
    name: asText(record.name),
    memberCount: typeof record.memberCount === "number" ? record.memberCount : 0,
    joined: record.joined === true,
    lastMessage: asText(record.lastMessage),
    lastMessageAt: asText(record.lastMessageAt),
  };
}

function readMessage(value: unknown): GroupMessage {
  const record = asRecord(value);
  return {
    id: asText(record.id),
    senderId: asText(record.senderId),
    name: asText(record.name),
    body: asText(record.body),
    createdAt: asText(record.createdAt),
  };
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

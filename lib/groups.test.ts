import { describe, expect, it } from "vitest";
import {
  EMPTY_GROUP_LIST,
  EMPTY_GROUP_ROOM,
  groupMessagesByDay,
  isGroupName,
  mergeGroupMessages,
  normalizeGroupName,
  readGroupList,
  readGroupRoom,
  partitionGroups,
  sortGroups,
  type GroupMessage,
  type GroupSummary,
} from "@/lib/groups";

function summary(overrides: Partial<GroupSummary>): GroupSummary {
  return {
    groupId: "g1",
    name: "UGBA 117",
    memberCount: 3,
    joined: true,
    lastMessage: "",
    lastMessageAt: "",
    ...overrides,
  };
}

function message(overrides: Partial<GroupMessage>): GroupMessage {
  return {
    id: "m1",
    senderId: "u1",
    name: "ada",
    body: "Anyone doing the problem set?",
    createdAt: "2026-08-15T10:00:00+00:00",
    ...overrides,
  };
}

describe("group names", () => {
  it("trims to what the database will accept", () => {
    expect(normalizeGroupName("  UGBA 117  ")).toBe("UGBA 117");
    expect(normalizeGroupName("x".repeat(200))).toHaveLength(80);
  });

  it("refuses a name that is only whitespace", () => {
    expect(isGroupName("UGBA 117")).toBe(true);
    expect(isGroupName("   ")).toBe(false);
    expect(isGroupName("")).toBe(false);
  });
});

describe("ordering", () => {
  it("puts your own rooms first, most recently spoken in at the top", () => {
    const sorted = sortGroups([
      summary({ groupId: "browsing", name: "Econ 1", joined: false }),
      summary({ groupId: "quiet", name: "CS 61A" }),
      summary({ groupId: "loud", name: "UGBA 117", lastMessageAt: "2026-08-15T12:00:00Z" }),
    ]);

    expect(sorted.map((entry) => entry.groupId)).toEqual(["loud", "quiet", "browsing"]);
  });

  it("orders the directory by name, since it carries no conversation to rank by", () => {
    const { mine, open } = partitionGroups([
      summary({ groupId: "z", name: "Z", joined: false }),
      summary({ groupId: "a", name: "A", joined: false }),
      summary({ groupId: "own", name: "UGBA 117" }),
    ]);

    expect(mine.map((entry) => entry.groupId)).toEqual(["own"]);
    expect(open.map((entry) => entry.groupId)).toEqual(["a", "z"]);
  });

  it("leaves the caller's array alone", () => {
    const groups = [summary({ groupId: "a" }), summary({ groupId: "b", lastMessageAt: "2026" })];
    sortGroups(groups);
    expect(groups.map((entry) => entry.groupId)).toEqual(["a", "b"]);
  });
});

describe("room assembly", () => {
  it("shows a message once when a reload brings it back", () => {
    const sent = message({ id: "m2", createdAt: "2026-08-15T11:00:00+00:00" });
    const merged = mergeGroupMessages([message({ id: "m1" }), sent], [sent]);

    expect(merged.map((entry) => entry.id)).toEqual(["m1", "m2"]);
  });

  it("breaks a room into the days it happened on", () => {
    const days = groupMessagesByDay([
      message({ id: "b", createdAt: "2026-08-15T09:00:00+00:00" }),
      message({ id: "a", createdAt: "2026-08-14T08:00:00+00:00" }),
    ]);

    expect(days.map((day) => day.date)).toEqual(["2026-08-14", "2026-08-15"]);
  });
});

describe("reading what the database returned", () => {
  it("parses the directory, marking which rooms the caller is in", () => {
    const list = readGroupList({
      userId: "me",
      groups: [
        {
          groupId: "g1",
          name: "UGBA 117",
          memberCount: 4,
          joined: true,
          lastMessage: "See you at 3",
          lastMessageAt: "2026-08-15T10:00:00+00:00",
        },
        // A room not joined carries a headcount and nothing that was said in it.
        { groupId: "g2", name: "CS 61A", memberCount: 9, joined: false, lastMessage: null },
      ],
    });

    expect(list.userId).toBe("me");
    expect(list.groups[0].joined).toBe(true);
    expect(list.groups[0].lastMessage).toBe("See you at 3");
    expect(list.groups[1].joined).toBe(false);
    expect(list.groups[1].lastMessage).toBe("");
  });

  it("renders empty rather than throwing when the payload is not what we expected", () => {
    expect(readGroupList(null)).toEqual(EMPTY_GROUP_LIST);
    expect(readGroupList("unavailable")).toEqual(EMPTY_GROUP_LIST);
    expect(readGroupRoom(null)).toEqual(EMPTY_GROUP_ROOM);
    expect(readGroupRoom({ messages: "broken", members: "broken" })).toEqual(EMPTY_GROUP_ROOM);
  });

  it("drops a room it could neither name nor open", () => {
    const list = readGroupList({ groups: [{ groupId: "g1" }, { name: "UGBA 117" }] });

    expect(list.groups).toEqual([]);
  });

  it("parses a room's messages and roster", () => {
    const room = readGroupRoom({
      messages: [
        {
          id: "m1",
          senderId: "u1",
          name: "ada",
          body: "Anyone doing the problem set?",
          createdAt: "2026-08-15T10:00:00+00:00",
        },
        { id: "m2", senderId: "u2", name: "zoe", body: "", createdAt: "x" },
      ],
      members: ["ada", "zoe", 42],
    });

    expect(room.messages).toHaveLength(1);
    expect(room.messages[0].name).toBe("ada");
    expect(room.members).toEqual(["ada", "zoe"]);
  });
});

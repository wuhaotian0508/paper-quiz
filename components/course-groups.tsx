"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/hooks/use-locale";
import {
  EMPTY_GROUP_LIST,
  EMPTY_GROUP_ROOM,
  groupMessagesByDay,
  MAX_GROUP_MESSAGE_CHARS,
  MAX_GROUP_NAME_CHARS,
  partitionGroups,
  type GroupList,
  type GroupRoom,
  type GroupSummary,
} from "@/lib/groups";
import {
  createGroup,
  joinGroup,
  leaveGroup,
  listGroups,
  readGroup,
  reportGroupMessage,
  sendGroupMessage,
} from "@/lib/groups-client";
import type { ContactsClient } from "@/lib/contacts-client";

type Props = {
  client: ContactsClient | null;
};

/**
 * Course groups: a room per class, open to anyone signed in.
 *
 * Deliberately not invitation-based. A course is not a secret, and the thing worth solving is
 * finding the people already in it — so the directory shows every room, and joining is a
 * button rather than a request somebody has to answer.
 */
export function CourseGroups({ client }: Props) {
  const { t } = useLocale();
  const [list, setList] = useState<GroupList>(EMPTY_GROUP_LIST);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [room, setRoom] = useState<GroupRoom>(EMPTY_GROUP_ROOM);
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  /** Throws rather than reporting: whether a failure is worth a line depends on the caller. */
  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      setList(await listGroups(client));
    } finally {
      setLoading(false);
    }
  }, [client]);

  /**
   * Silent on failure. Whatever broke the directory — signed out, offline — broke the contact
   * list beside it too, and that panel already says so; printing the same sentence twice on
   * one screen helps nobody. Failures from pressing something are reported, in `run`.
   */
  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const { mine, open } = useMemo(() => partitionGroups(list.groups), [list.groups]);
  const openGroup = mine.find((group) => group.groupId === openGroupId) ?? null;

  const loadRoom = useCallback(async () => {
    if (!client || !openGroupId) return;
    try {
      setRoom(await readGroup(client, openGroupId));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("groups.loadFailed"));
    }
  }, [client, openGroupId, t]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  // Left in another tab, or emptied by the last person out: fall back to the directory rather
  // than to a composer that cannot post.
  useEffect(() => {
    if (openGroupId && !loading && !openGroup) {
      setOpenGroupId(null);
      setRoom(EMPTY_GROUP_ROOM);
    }
  }, [loading, openGroup, openGroupId]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("groups.loadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || !newName.trim()) return;
    await run(async () => {
      await createGroup(client, newName);
      setNewName("");
      // Typing the name of a room that exists puts you in that one; the copy says so rather
      // than letting it look like a second room quietly failed to appear.
      setStatus(t("groups.created"));
      await refresh();
    });
  };

  const join = (groupId: string) =>
    run(async () => {
      if (!client) return;
      await joinGroup(client, groupId);
      setOpenGroupId(groupId);
      await refresh();
    });

  const leave = async (groupId: string, name: string) => {
    if (!client) return;
    if (!window.confirm(t("groups.leaveConfirm", { name }))) return;
    await run(async () => {
      await leaveGroup(client, groupId);
      setOpenGroupId(null);
      setRoom(EMPTY_GROUP_ROOM);
      await refresh();
    });
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || !openGroupId || !draft.trim()) return;
    await run(async () => {
      await sendGroupMessage(client, openGroupId, draft);
      setDraft("");
      await Promise.all([loadRoom(), refresh()]);
    });
  };

  const report = async (messageId: string) => {
    if (!client) return;
    const note = window.prompt(t("groups.reportPrompt")) ?? "";
    await run(async () => {
      await reportGroupMessage(client, messageId, note);
      setStatus(t("groups.reported"));
    });
  };

  const groupRow = (group: GroupSummary) => (
    <div className="groups-row-wrap" key={group.groupId}>
      <button
        aria-current={group.groupId === openGroupId ? "true" : undefined}
        aria-label={t(group.joined ? "groups.openAria" : "groups.previewAria", {
          name: group.name,
        })}
        className="groups-row"
        disabled={!group.joined}
        onClick={() => setOpenGroupId(group.groupId)}
        type="button"
      >
        <span className="groups-row-name">{group.name}</span>
        <span className="groups-row-count">
          {t("groups.members", { count: group.memberCount })}
        </span>
        {group.lastMessage ? <span className="groups-row-preview">{group.lastMessage}</span> : null}
      </button>
      {group.joined ? null : (
        <button
          aria-label={t("groups.joinAria", { name: group.name })}
          className="groups-join"
          disabled={busy}
          onClick={() => void join(group.groupId)}
          type="button"
        >
          {t("groups.join")}
        </button>
      )}
    </div>
  );

  return (
    <section className="groups-panel" aria-labelledby="groups-heading">
      <h2 id="groups-heading">{t("groups.heading")}</h2>
      <p className="groups-note">{t("groups.note")}</p>

      {error ? (
        <p className="groups-error" role="alert">
          {error}
        </p>
      ) : null}

      <form className="groups-new" onSubmit={(event) => void create(event)}>
        <label htmlFor="groups-name">{t("groups.newLabel")}</label>
        <div className="groups-new-row">
          <input
            id="groups-name"
            maxLength={MAX_GROUP_NAME_CHARS}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t("groups.newPlaceholder")}
            value={newName}
          />
          <button disabled={busy || !client || !newName.trim()} type="submit">
            {t("groups.create")}
          </button>
        </div>
        {status ? (
          <small className="groups-status" role="status">
            {status}
          </small>
        ) : null}
      </form>

      <section className="groups-list" aria-labelledby="groups-mine-heading">
        <h3 id="groups-mine-heading">{t("groups.listHeading")}</h3>
        {!loading && !mine.length ? <p className="groups-empty">{t("groups.empty")}</p> : null}
        {mine.map(groupRow)}
      </section>

      {open.length ? (
        <section className="groups-list" aria-labelledby="groups-open-heading">
          <h3 id="groups-open-heading">{t("groups.openHeading")}</h3>
          {open.map(groupRow)}
        </section>
      ) : null}

      {openGroup ? (
        <section
          className="groups-room"
          aria-label={t("groups.roomAria", { name: openGroup.name })}
        >
          <header className="groups-room-heading">
            <h3>{openGroup.name}</h3>
            <button
              aria-label={t("groups.leaveAria", { name: openGroup.name })}
              className="text-button"
              disabled={busy}
              onClick={() => void leave(openGroup.groupId, openGroup.name)}
              type="button"
            >
              {t("groups.leave")}
            </button>
          </header>

          <div className="groups-messages">
            {!room.messages.length ? (
              <p className="groups-empty">{t("groups.noMessages")}</p>
            ) : (
              groupMessagesByDay(room.messages).map((day) => (
                <div className="groups-day" key={day.date}>
                  <p className="groups-date">{formatDate(day.date)}</p>
                  {day.messages.map((message) => {
                    const mineMessage = message.senderId === list.userId;
                    return (
                      <article
                        className={`groups-message ${mineMessage ? "is-mine" : ""}`}
                        key={message.id}
                      >
                        <p className="groups-message-author">
                          {mineMessage ? t("groups.you") : message.name}
                          <span className="groups-message-time">
                            {formatTime(message.createdAt)}
                          </span>
                        </p>
                        <p className="groups-message-body">{message.body}</p>
                        {mineMessage ? null : (
                          <button
                            aria-label={t("groups.reportAria", { name: message.name })}
                            className="groups-report"
                            disabled={busy}
                            onClick={() => void report(message.id)}
                            type="button"
                          >
                            {t("groups.report")}
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <form className="groups-composer" onSubmit={(event) => void send(event)}>
            <label className="sr-only" htmlFor="groups-draft">
              {t("groups.composerLabel", { name: openGroup.name })}
            </label>
            <textarea
              id="groups-draft"
              maxLength={MAX_GROUP_MESSAGE_CHARS}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("groups.composerPlaceholder")}
              rows={2}
              value={draft}
            />
            <button className="primary-button" disabled={busy || !draft.trim()} type="submit">
              {busy ? t("groups.sending") : t("groups.send")}
            </button>
          </form>
        </section>
      ) : mine.length ? (
        <p className="groups-empty">{t("groups.selectPrompt")}</p>
      ) : null}
    </section>
  );
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString();
}

function formatTime(timestamp: string) {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

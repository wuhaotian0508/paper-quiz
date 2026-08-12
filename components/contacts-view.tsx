"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { NearbyLearners } from "@/components/nearby-learners";
import { useLocale } from "@/hooks/use-locale";
import {
  contactName,
  CONTACTS_UNREAD_EVENT,
  EMPTY_CONTACT_LIST,
  groupMessagesByDay,
  isContactEmail,
  MAX_MESSAGE_CHARS,
  mergeMessages,
  sortContacts,
  unreadFrom,
  unreadTotal,
  type ContactList,
  type ContactRequest,
  type DirectMessage,
} from "@/lib/contacts";
import {
  acceptContactRequest,
  listContacts,
  loadThread,
  markThreadRead,
  removeContact,
  sendContactRequest,
  sendMessage,
  type ContactsClient,
} from "@/lib/contacts-client";

type Props = {
  /** Injected by tests; the real page resolves the browser client itself. */
  client?: ContactsClient;
};

/**
 * Contacts and one-to-one messages.
 *
 * Reads on open and on Refresh, and never on a timer: there is no realtime subscription
 * behind this, so the page is honest about being a snapshot rather than pretending to be
 * live and quietly going stale.
 */
export function ContactsView({ client }: Props) {
  const { t } = useLocale();
  const [contactsClient, setContactsClient] = useState<ContactsClient | null>(client ?? null);
  const [list, setList] = useState<ContactList>(EMPTY_CONTACT_LIST);
  /** The other person's user id, not the relationship id: threads are keyed by participant. */
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [email, setEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** Bumped by Refresh and by a send, to re-read the open thread. */
  const [threadToken, setThreadToken] = useState(0);

  useEffect(() => {
    if (client) return;
    try {
      setContactsClient(getSupabaseBrowserClient() as unknown as ContactsClient);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("contacts.loadFailed"));
      setLoading(false);
    }
  }, [client, t]);

  const refresh = useCallback(async () => {
    if (!contactsClient) return;
    try {
      const next = await listContacts(contactsClient);
      setList(next);
      setError("");
      window.dispatchEvent(
        new CustomEvent(CONTACTS_UNREAD_EVENT, { detail: unreadTotal(next.contacts) }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("contacts.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [contactsClient, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Opening a thread also clears its unread flags, then re-reads the list so the badge the
   * learner just cleared does not stay lit next to the conversation they are reading.
   */
  useEffect(() => {
    if (!contactsClient || !openContactId || !list.userId) return;

    let active = true;
    void (async () => {
      try {
        const thread = await loadThread(contactsClient, list.userId, openContactId);
        if (!active) return;
        setMessages(thread);
        if (!unreadFrom(thread, list.userId).length) return;
        await markThreadRead(contactsClient, list.userId, openContactId);
        if (active) await refresh();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : t("contacts.loadFailed"));
      }
    })();

    return () => {
      active = false;
    };
  }, [contactsClient, list.userId, openContactId, refresh, t, threadToken]);

  const contacts = useMemo(() => sortContacts(list.contacts), [list.contacts]);
  const openContact = contacts.find((contact) => contact.userId === openContactId) ?? null;

  // A contact removed in another tab, or by the other side, leaves a thread pointing at
  // nobody. Fall back to the list rather than to an empty pane with a composer in it.
  useEffect(() => {
    if (openContactId && !loading && !openContact) {
      setOpenContactId(null);
      setMessages([]);
    }
  }, [loading, openContact, openContactId]);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    try {
      await action();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactsClient) return;
    if (!isContactEmail(email)) {
      setInviteStatus(t("contacts.addInvalid"));
      return;
    }

    setInviteStatus(t("contacts.addSending"));
    await run(async () => {
      await sendContactRequest(contactsClient, email);
      setEmail("");
      // The same line whether or not that address has an account - see send_contact_request.
      setInviteStatus(t("contacts.addSent"));
      await refresh();
    }, t("contacts.loadFailed"));
  };

  const respond = async (contactId: string, accept: boolean) => {
    if (!contactsClient) return;
    await run(async () => {
      if (accept) await acceptContactRequest(contactsClient, contactId);
      else await removeContact(contactsClient, contactId);
      await refresh();
    }, t("contacts.loadFailed"));
  };

  const drop = async (contactId: string, name: string) => {
    if (!contactsClient) return;
    if (!window.confirm(t("contacts.removeConfirm", { name }))) return;
    await run(async () => {
      await removeContact(contactsClient, contactId);
      setOpenContactId(null);
      setMessages([]);
      await refresh();
    }, t("contacts.loadFailed"));
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactsClient || !openContactId || !draft.trim()) return;

    await run(async () => {
      const sent = await sendMessage(contactsClient, openContactId, draft);
      // Shown before the reload confirms it; mergeMessages keeps the pair from doubling up.
      setMessages((previous) => mergeMessages(previous, [sent]));
      setDraft("");
      await refresh();
    }, t("contacts.sendFailed"));
  };

  const reload = () => {
    setThreadToken((token) => token + 1);
    void refresh();
  };

  return (
    <section className="contacts-page" aria-labelledby="contacts-heading">
      <header className="contacts-heading">
        <div>
          <div className="eyebrow">{t("contacts.eyebrow")}</div>
          <h1 id="contacts-heading">{t("contacts.heading")}</h1>
          <p className="muted-copy">{t("contacts.note")}</p>
        </div>
        <button className="text-button" disabled={busy} onClick={reload} type="button">
          {busy ? t("contacts.refreshing") : t("contacts.refresh")}
        </button>
      </header>

      {error ? (
        <p className="contacts-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="contacts-layout">
        <div className="contacts-sidebar">
          <form className="contacts-invite" onSubmit={(event) => void invite(event)}>
            <label htmlFor="contacts-email">{t("contacts.addLabel")}</label>
            <input
              autoComplete="email"
              id="contacts-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("contacts.addPlaceholder")}
              type="email"
              value={email}
            />
            <button className="primary-button" disabled={busy || !contactsClient} type="submit">
              {t("contacts.addAction")}
            </button>
            {inviteStatus ? (
              <small className="contacts-invite-status" role="status">
                {inviteStatus}
              </small>
            ) : null}
          </form>

          {/* Knowing an address is the other way in; this is the one for a classmate whose
              address you do not have, because they are sitting two tables away. */}
          <NearbyLearners client={contactsClient} onContactRequested={refresh} />

          {list.incoming.length ? (
            <section className="contacts-requests" aria-labelledby="contacts-incoming">
              <h2 id="contacts-incoming">{t("contacts.incomingHeading")}</h2>
              {list.incoming.map((request) => (
                <RequestRow key={request.contactId} request={request}>
                  <button
                    disabled={busy}
                    onClick={() => void respond(request.contactId, true)}
                    type="button"
                  >
                    {t("contacts.accept")}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void respond(request.contactId, false)}
                    type="button"
                  >
                    {t("contacts.decline")}
                  </button>
                </RequestRow>
              ))}
            </section>
          ) : null}

          {list.outgoing.length ? (
            <section className="contacts-requests" aria-labelledby="contacts-outgoing">
              <h2 id="contacts-outgoing">{t("contacts.outgoingHeading")}</h2>
              {list.outgoing.map((request) => (
                <RequestRow key={request.contactId} request={request}>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void respond(request.contactId, false)}
                    type="button"
                  >
                    {t("contacts.withdraw")}
                  </button>
                </RequestRow>
              ))}
            </section>
          ) : null}

          <section className="contacts-list" aria-labelledby="contacts-list-heading">
            <h2 id="contacts-list-heading">{t("contacts.listHeading")}</h2>
            {loading ? <p className="muted-copy">{t("contacts.loading")}</p> : null}
            {!loading && !contacts.length ? (
              <p className="muted-copy">{t("contacts.empty")}</p>
            ) : null}
            {contacts.map((contact) => {
              const name = contactName(contact.email);
              return (
                <button
                  aria-current={contact.userId === openContactId ? "true" : undefined}
                  aria-label={t("contacts.openAria", { name })}
                  className="contacts-list-row"
                  key={contact.contactId}
                  onClick={() => setOpenContactId(contact.userId)}
                  type="button"
                >
                  <span className="contacts-list-name" title={contact.email}>
                    {name}
                  </span>
                  {contact.lastMessage ? (
                    <span className="contacts-list-preview">{contact.lastMessage}</span>
                  ) : null}
                  {contact.unreadCount ? (
                    <span
                      aria-label={t("contacts.unreadAria", {
                        count: contact.unreadCount,
                        name,
                      })}
                      className="contacts-unread-badge"
                    >
                      {t("contacts.unread", { count: contact.unreadCount })}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </section>
        </div>

        <section
          aria-label={
            openContact
              ? t("contacts.threadAria", { name: contactName(openContact.email) })
              : t("contacts.listHeading")
          }
          className="contacts-thread"
        >
          {!openContact ? (
            <p className="muted-copy contacts-thread-empty">{t("contacts.selectPrompt")}</p>
          ) : (
            <>
              <header className="contacts-thread-heading">
                <h2 title={openContact.email}>{contactName(openContact.email)}</h2>
                <button
                  aria-label={t("contacts.removeAria", {
                    name: contactName(openContact.email),
                  })}
                  className="text-button"
                  disabled={busy}
                  onClick={() => void drop(openContact.contactId, contactName(openContact.email))}
                  type="button"
                >
                  {t("contacts.remove")}
                </button>
              </header>

              <div className="contacts-messages">
                {!messages.length ? (
                  <p className="muted-copy">{t("contacts.noMessages")}</p>
                ) : (
                  groupMessagesByDay(messages).map((day) => (
                    <div className="contacts-message-day" key={day.date}>
                      <p className="contacts-message-date">{formatDate(day.date)}</p>
                      {day.messages.map((message) => {
                        const mine = message.senderId === list.userId;
                        return (
                          <article
                            className={`contacts-message ${mine ? "is-mine" : ""}`}
                            key={message.id}
                          >
                            <p className="contacts-message-author">
                              {mine ? t("contacts.you") : contactName(openContact.email)}
                              <span className="contacts-message-time">
                                {formatTime(message.createdAt)}
                              </span>
                            </p>
                            <p className="contacts-message-body">{message.body}</p>
                          </article>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              <form className="contacts-composer" onSubmit={(event) => void send(event)}>
                <label className="sr-only" htmlFor="contacts-draft">
                  {t("contacts.composerLabel", { name: contactName(openContact.email) })}
                </label>
                <textarea
                  id="contacts-draft"
                  maxLength={MAX_MESSAGE_CHARS}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t("contacts.composerPlaceholder")}
                  rows={3}
                  value={draft}
                />
                <button className="primary-button" disabled={busy || !draft.trim()} type="submit">
                  {busy ? t("contacts.sending") : t("contacts.send")}
                </button>
              </form>
              <small className="muted-copy">{t("contacts.privacyNote")}</small>
            </>
          )}
        </section>
      </div>
    </section>
  );
}

function RequestRow({ request, children }: { request: ContactRequest; children: ReactNode }) {
  return (
    <div className="contacts-request-row">
      <span title={request.email}>{contactName(request.email)}</span>
      <div className="contacts-request-actions">{children}</div>
    </div>
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

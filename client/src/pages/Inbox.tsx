import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/client";

type Conversation = {
  id: string;
  name: string;
  phone: string;
  last_message: string;
  last_direction: "inbound" | "outbound";
  last_status: string;
  last_at: string;
};

type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  created_at: string;
  provider_error?: string | null;
};

function formatListTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    ) {
      return "Yesterday";
    }
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function formatBubbleTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function displayBody(text: string): string {
  return text.replace(/^\[(Menu|List)\]\s*/i, "").trim() || text;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function Inbox() {
  const [chatOnly, setChatOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const filteredConversations = conversations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const loadConversations = useCallback(async () => {
    const q = chatOnly ? "?chat_only=true" : "";
    const d = await apiFetch<{ conversations: Conversation[] }>(`/api/messaging/conversations${q}`);
    setConversations(d.conversations);
    setSelectedId((prev) => {
      if (prev && d.conversations.some((c) => c.id === prev)) return prev;
      return d.conversations[0]?.id ?? null;
    });
  }, [chatOnly]);

  const loadThread = useCallback(async (customerId: string) => {
    const d = await apiFetch<{ messages: ThreadMessage[] }>(
      `/api/messaging/conversations/${customerId}/messages`
    );
    setMessages(d.messages);
  }, []);

  useEffect(() => {
    void loadConversations()
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
    const t = setInterval(() => {
      void loadConversations().catch(() => {});
      if (selectedId) void loadThread(selectedId).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [loadConversations, loadThread, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadThread(selectedId).catch((e: Error) => setErr(e.message));
  }, [selectedId, loadThread]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, selectedId]);

  function selectConversation(id: string) {
    setSelectedId(id);
    setMobileShowThread(true);
    setErr(null);
  }

  async function onReply(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    setErr(null);
    try {
      await apiFetch("/api/messaging/reply", {
        method: "POST",
        body: JSON.stringify({ customer_id: selectedId, body: reply.trim() }),
      });
      setReply("");
      await loadThread(selectedId);
      await loadConversations();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const listPanel = (
    <aside
      className={`flex h-full min-h-0 flex-col w-full md:w-[320px] lg:w-[360px] shrink-0 border-r border-slate-200 bg-white ${
        mobileShowThread ? "hidden md:flex" : "flex"
      }`}
    >
      <div className="shrink-0 px-4 py-4 bg-slate-100 border-b border-slate-200">
        <h1 className="text-lg font-semibold leading-snug text-slate-900">Chats</h1>
        <p className="text-xs text-slate-500 mt-0.5">Reply within 24h of customer message</p>
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={chatOnly}
            onChange={(e) => {
              setChatOnly(e.target.checked);
              setSelectedId(null);
              setMobileShowThread(false);
            }}
          />
          Active chat requests only
        </label>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or phone"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading…</p>
        ) : filteredConversations.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            {conversations.length === 0
              ? "No chats yet. Customers appear after they choose Chat technician on WhatsApp."
              : "No matches for your search."}
          </p>
        ) : (
          <ul className="py-1">
            {filteredConversations.map((c) => {
              const active = selectedId === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectConversation(c.id)}
                    className={`w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition ${
                      active ? "bg-slate-100" : ""
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                        active ? "bg-brand-600 text-white" : "bg-slate-300 text-slate-700"
                      }`}
                    >
                      {initials(c.name)}
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <span className="block truncate text-[15px] font-medium leading-normal text-slate-900">
                          {c.name}
                        </span>
                        <span className="shrink-0 text-[11px] leading-normal text-slate-500">
                          {formatListTime(c.last_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs leading-normal text-slate-500">{c.phone}</p>
                      <p className="mt-1 truncate text-sm leading-normal text-slate-600">
                        {c.last_direction === "outbound" && (
                          <span className="text-slate-400">You: </span>
                        )}
                        {displayBody(c.last_message)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );

  const threadPanel = (
    <section
      className={`flex h-full min-h-0 flex-1 flex-col min-w-0 bg-[#e5ddd5] ${
        mobileShowThread ? "flex" : "hidden md:flex"
      }`}
    >
      {selected ? (
        <>
          <header className="shrink-0 flex items-center gap-3 px-3 py-2 bg-[#f0f2f5] border-b border-slate-300/40 shadow-sm">
            <button
              type="button"
              onClick={() => setMobileShowThread(false)}
              className="md:hidden rounded-full p-2 hover:bg-slate-200 text-slate-700"
              aria-label="Back to chats"
            >
              ←
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-400 text-white text-sm font-semibold">
              {initials(selected.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900 truncate">{selected.name}</div>
              <div className="text-xs text-slate-600 truncate">{selected.phone}</div>
            </div>
          </header>

          {err && (
            <div className="shrink-0 mx-3 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {err}
            </div>
          )}

          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8c4bc' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          >
            {messages.length === 0 ? (
              <p className="text-center text-sm text-slate-600 mt-8">No messages in this thread yet.</p>
            ) : (
              messages.map((m) => {
                const outbound = m.direction === "outbound";
                return (
                  <div
                    key={m.id}
                    className={`flex ${outbound ? "justify-end" : "justify-start"} mb-1`}
                  >
                    <div
                      className={`relative max-w-[75%] sm:max-w-[65%] rounded-lg px-2 py-1.5 shadow-sm ${
                        outbound
                          ? "bg-[#d9fdd3] text-slate-900 rounded-tr-none"
                          : "bg-white text-slate-900 rounded-tl-none"
                      }`}
                    >
                      <p className="text-[14px] leading-snug whitespace-pre-wrap break-words pr-12">
                        {displayBody(m.body)}
                      </p>
                      <span
                        className={`absolute bottom-1 right-2 text-[10px] leading-none ${
                          outbound ? "text-slate-500" : "text-slate-400"
                        }`}
                      >
                        {formatBubbleTime(m.created_at)}
                        {outbound && m.status === "failed" && " !"}
                      </span>
                      {m.provider_error && (
                        <p className="text-[10px] text-red-600 mt-1">{m.provider_error}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={onReply}
            className="shrink-0 flex items-end gap-2 px-3 py-2 bg-[#f0f2f5] border-t border-slate-300/40"
          >
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type a message"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className="shrink-0 rounded-full bg-brand-600 h-11 w-11 flex items-center justify-center text-white disabled:opacity-40 hover:bg-brand-700 transition"
              aria-label="Send"
            >
              {sending ? (
                <span className="text-xs">…</span>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </form>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center bg-[#f0f2f5] p-8 text-center">
          <div>
            <p className="text-slate-600 font-medium">Select a chat</p>
            <p className="text-sm text-slate-500 mt-1">Choose a subscriber from the list to view messages</p>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col p-2 sm:p-3">
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {listPanel}
        {threadPanel}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";

interface ThreadRow {
  id: string;
  user_id: string;
  admin_unread_count: number;
  last_message_at: string;
}
interface ThreadWithProfile extends ThreadRow {
  display_name: string | null;
  email: string | null;
}
interface ChatMessage {
  id: string;
  sender_role: "student" | "admin";
  body: string;
  created_at: string;
}

export default function AdminSupport() {
  const [threads, setThreads] = useState<ThreadWithProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadThreads() {
    setLoading(true);
    const { data: threadRows } = await supabase
      .from("chat_threads")
      .select("id, user_id, admin_unread_count, last_message_at")
      .order("last_message_at", { ascending: false });
    const rows = threadRows ?? [];

    const userIds = rows.map((t) => t.user_id);
    let names: Record<string, string | null> = {};
    let emails: Record<string, string> = {};
    if (userIds.length > 0) {
      const [{ data: profileRows }, { data: emailRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", userIds),
        supabase.rpc("admin_list_emails", { p_user_ids: userIds }),
      ]);
      names = Object.fromEntries(
        (profileRows ?? []).map((p) => [p.user_id, p.display_name]),
      );
      emails = Object.fromEntries(
        (emailRows ?? []).map((e: { user_id: string; email: string }) => [
          e.user_id,
          e.email,
        ]),
      );
    }

    setThreads(
      rows.map((t) => ({
        ...t,
        display_name: names[t.user_id] ?? null,
        email: emails[t.user_id] ?? null,
      })),
    );
    setLoading(false);
  }

  async function openThread(id: string) {
    setActiveId(id);
    const { data } = await supabase
      .from("chat_messages")
      .select("id, sender_role, body, created_at")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });
    setMessages(data ?? []);
    await supabase.rpc("mark_chat_thread_read_by_admin", { p_thread_id: id });
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, admin_unread_count: 0 } : t)),
    );
  }

  useEffect(() => {
    void loadThreads();
  }, []);

  // One channel across every open thread — whichever message arrives, bump that thread to
  // the top of the list, and if it's the open conversation, append it live.
  useEffect(() => {
    const channel = supabase
      .channel("admin-support-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const row = payload.new as ChatMessage & { thread_id: string };
          setThreads((prev) => {
            const idx = prev.findIndex((t) => t.id === row.thread_id);
            if (idx === -1) {
              void loadThreads();
              return prev;
            }
            const updated = [...prev];
            const current = updated[idx];
            updated[idx] = {
              ...current,
              last_message_at: row.created_at,
              admin_unread_count:
                row.sender_role === "student" && row.thread_id !== activeId
                  ? current.admin_unread_count + 1
                  : current.admin_unread_count,
            };
            updated.sort(
              (a, b) =>
                new Date(b.last_message_at).getTime() -
                new Date(a.last_message_at).getTime(),
            );
            return updated;
          });
          if (row.thread_id === activeId) {
            setMessages((prev) =>
              prev.some((m) => m.id === row.id) ? prev : [...prev, row],
            );
            if (row.sender_role === "student") {
              void supabase.rpc("mark_chat_thread_read_by_admin", {
                p_thread_id: row.thread_id,
              });
            }
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    setDraft("");
    await supabase.rpc("send_chat_message_as_admin", {
      p_thread_id: activeId,
      p_body: body,
    });
    setSending(false);
  }

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  return (
    <AdminLayout>
      <h1 className="font-heading text-2xl font-bold text-text-1">Support</h1>
      <p className="mt-1 text-sm text-text-3">
        Live conversations with scholars. Replies are posted as "Support" to
        the student's Chat tab.
      </p>

      <div className="mt-4 flex h-[calc(100vh-220px)] overflow-hidden rounded-2xl border border-canvas-border bg-white">
        <div className="w-full max-w-xs shrink-0 overflow-y-auto border-r border-canvas-border">
          {loading ? (
            <p className="p-4 text-sm text-text-3">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="p-4 text-sm text-text-3">No conversations yet.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => void openThread(t.id)}
                className={`block w-full border-b border-canvas-border px-4 py-3 text-left transition-colors ${
                  activeId === t.id ? "bg-royal-soft" : "hover:bg-canvas-soft"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-text-1">
                    {t.display_name || t.email || "Scholar"}
                  </p>
                  {t.admin_unread_count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-royal px-1 text-[10px] font-bold text-white">
                      {t.admin_unread_count}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-text-3">{t.email}</p>
                <p className="mt-0.5 text-[10px] text-text-3">
                  {formatDistanceToNow(new Date(t.last_message_at), {
                    addSuffix: true,
                  })}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {!activeThread ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-text-3">
              Select a conversation to view messages.
            </div>
          ) : (
            <>
              <div className="border-b border-canvas-border px-4 py-3">
                <p className="text-sm font-semibold text-text-1">
                  {activeThread.display_name || "Scholar"}
                </p>
                <p className="text-xs text-text-3">{activeThread.email}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-3">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${
                        m.sender_role === "admin"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm ${
                          m.sender_role === "admin"
                            ? "bg-royal text-white"
                            : "bg-canvas-soft text-text-1"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            m.sender_role === "admin"
                              ? "text-white/70"
                              : "text-text-3"
                          }`}
                        >
                          {formatDistanceToNow(new Date(m.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              </div>
              <form
                onSubmit={handleSend}
                className="flex items-center gap-2 border-t border-canvas-border p-3"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Reply as Support…"
                  className="flex-1 rounded-xl border border-canvas-border bg-white px-3.5 py-2.5 text-sm text-text-1 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="btn-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl p-0 disabled:opacity-50"
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

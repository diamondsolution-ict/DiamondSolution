import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import { Layout } from "@/components/Layout";
import { LoadingScreen } from "@/components/LoadingScreen";

interface ChatMessage {
  id: string;
  sender_role: "student" | "admin";
  body: string;
  created_at: string;
}

export default function Chat() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadMessages(id: string) {
    const { data, error: fetchError } = await supabase
      .from("chat_messages")
      .select("id, sender_role, body, created_at")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });
    if (fetchError) throw fetchError;
    setMessages(data ?? []);
    await supabase.rpc("mark_chat_thread_read_by_user");
  }

  // Finds (or confirms the absence of) the student's own thread and loads its history.
  // Throws on any failure instead of swallowing it, so init() below can tell "real error,
  // worth retrying" apart from "no thread yet — a genuinely new conversation".
  async function loadOwnThread() {
    const { data, error: fetchError } = await supabase
      .from("chat_threads")
      .select("id")
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (data) {
      setThreadId(data.id);
      await loadMessages(data.id);
    }
  }

  // One retry before giving up: a request fired right as the page mounts can race a
  // just-expired access token's background refresh (ProtectedRoute waits for the session to
  // load, but not for it to be fresh) — that failure used to be swallowed by discarding
  // `error` entirely, silently rendering the "Say hello" empty state even for a student with
  // a real conversation already in progress, as if no thread existed at all.
  async function init(isRetry = false) {
    setLoading(true);
    setLoadError(false);
    try {
      await loadOwnThread();
      setLoading(false);
    } catch (err) {
      if (!isRetry) {
        await new Promise((r) => setTimeout(r, 800));
        await init(true);
        return;
      }
      // A Postgrest/RPC failure resolves as `{ data, error }` rather than rejecting, and the
      // `error` there is a plain `{code, details, hint, message}` object, not an Error instance
      // (supabase-js only wraps it in a real Error when `.throwOnError()` is used, which this
      // app doesn't) — `err instanceof Error` is false for it, so checking for a `.message`
      // string directly is what actually catches both that shape and a genuine thrown Error.
      const message =
        err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Something went wrong — check your connection and try again.";
      setLoadErrorMessage(message);
      setLoadError(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    void init();
  }, []);

  // Live delivery for admin replies — the one Realtime subscription in this app
  // (20261006100000_chat.sql). Only wired up once a thread exists: the first message
  // creates it, and loadMessages() right after already shows that message, so there's
  // nothing to subscribe to until then.
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`chat-thread-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row],
          );
          if (row.sender_role === "admin") {
            void supabase.rpc("mark_chat_thread_read_by_user");
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId]);

  useEffect(() => {
    // "smooth" silently no-ops in some mobile browsers/WebViews (reduced-motion settings,
    // low-power throttling) — leaves the view stuck wherever it first rendered, with the
    // latest message/input below the fold. "instant" has none of those failure modes.
    //
    // `loading` is also a dependency, not just `messages`: on first load, setMessages() runs
    // while `loading` is still true, so the message list (and this effect's scroll marker)
    // isn't mounted yet on the render where `messages` actually changes. Without `loading`
    // here, the effect never re-fires on the later render where the marker finally mounts,
    // leaving the view stuck at the top of the conversation instead of the latest message.
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [messages, loading]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    setDraft("");

    const { data: newThreadId, error: sendError } = await supabase.rpc(
      "send_chat_message",
      { p_body: body },
    );
    if (sendError) {
      setError(sendError.message);
      setDraft(body);
    } else if (!threadId && newThreadId) {
      setThreadId(newThreadId);
      await loadMessages(newThreadId);
    }
    setSending(false);
  }

  return (
    <Layout title="Chat with Support">
      <div className="card-luxury flex h-[calc(100dvh-200px)] flex-col overflow-hidden p-0 md:h-[calc(100dvh-104px)]">
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <LoadingScreen />
          ) : loadError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="font-heading text-sm font-bold text-text-1">
                Couldn't load your conversation
              </p>
              <p className="max-w-xs text-sm text-text-3">
                {loadErrorMessage ?? "Check your connection and try again."}
              </p>
              <button onClick={() => void init()} className="btn-secondary mt-2">
                Retry
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
              <p className="font-heading text-sm font-bold text-text-1">
                Say hello 👋
              </p>
              <p className="max-w-xs text-sm text-text-3">
                Questions about payments, courses, or your account? Send a
                message and our team will reply here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.sender_role === "student" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      m.sender_role === "student"
                        ? "bg-royal text-white"
                        : "bg-canvas-soft text-text-1"
                    }`}
                  >
                    {m.sender_role === "admin" && (
                      <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-royal">
                        Support
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p
                      className={`mt-1 text-[10px] ${
                        m.sender_role === "student"
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
          )}
        </div>

        {error && (
          <p className="border-t border-canvas-border px-4 py-2 text-xs text-red-600">
            {error}
          </p>
        )}

        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 border-t border-canvas-border p-3"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
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
      </div>
    </Layout>
  );
}

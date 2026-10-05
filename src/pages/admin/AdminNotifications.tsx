import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { Bell, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";

interface Broadcast {
  id: string;
  title: string;
  body: string;
  recipient_count: number;
  created_at: string;
}

export default function AdminNotifications() {
  const [history, setHistory] = useState<Broadcast[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("admin_broadcasts")
      .select("id, title, body, recipient_count, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setHistory(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!title.trim() || !body.trim()) {
      setError("Title and message are both required.");
      return;
    }
    setSending(true);
    const { error: rpcError } = await supabase.rpc("broadcast_notification", {
      p_title: title.trim(),
      p_body: body.trim(),
    });
    setSending(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setTitle("");
    setBody("");
    setInfo("Broadcast sent.");
    void load();
  }

  async function revoke(id: string) {
    if (!window.confirm("Remove this broadcast from the history log?")) return;
    setHistory((prev) => prev.filter((b) => b.id !== id));
    await supabase.from("admin_broadcasts").delete().eq("id", id);
  }

  return (
    <AdminLayout>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-luxury p-5">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-royal" />
            <h2 className="font-heading text-base font-bold text-text-1">
              Compose broadcast
            </h2>
          </div>
          <form onSubmit={send} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-text-3">
                Title
              </label>
              <input
                placeholder="Announcement title…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-text-3">
                Message
              </label>
              <textarea
                placeholder="Message to every student…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
              />
            </div>
            {error && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            {info && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {info}
              </p>
            )}
            <button type="submit" disabled={sending} className="btn-primary w-full">
              {sending ? "Sending…" : "Broadcast to all users"}
            </button>
            <p className="text-xs text-text-3">
              No per-user targeting or scheduling — this sends immediately to
              every registered user.
            </p>
          </form>
        </div>

        <div className="card-luxury p-5">
          <h2 className="font-heading text-base font-bold text-text-1">
            History
          </h2>
          {loading ? (
            <p className="mt-3 text-sm text-text-3">Loading…</p>
          ) : history.length === 0 ? (
            <p className="mt-3 text-sm text-text-3">
              No broadcasts sent yet.
            </p>
          ) : (
            <div className="mt-3 max-h-[480px] space-y-2 overflow-y-auto">
              {history.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-canvas-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-text-1">{b.title}</p>
                      <p className="mt-0.5 line-clamp-3 text-xs text-text-3">
                        {b.body}
                      </p>
                    </div>
                    <button
                      onClick={() => void revoke(b.id)}
                      className="shrink-0 rounded-lg p-1.5 text-text-3 hover:bg-rose-50 hover:text-rose-600"
                      title="Remove from history"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-text-3">
                    Sent to {b.recipient_count} users ·{" "}
                    {format(new Date(b.created_at), "MMM d, yyyy · HH:mm")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

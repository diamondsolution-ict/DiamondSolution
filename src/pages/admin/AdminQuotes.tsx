import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";

interface Quote {
  id: string;
  text: string;
  author: string;
  created_at: string;
}

export default function AdminQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("quotes")
      .select("id, text, author, created_at")
      .order("created_at", { ascending: false });
    setQuotes(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function publish(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from("quotes").insert({
      text: text.trim(),
      author: author.trim() || "Diamond Intelligence",
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setText("");
    setAuthor("");
    void load();
  }

  // Matches the old app exactly: direct delete, no confirm dialog, no OTP — this is content
  // curation, same posture as the write policy (quotes_write_staff, not step-up gated).
  async function remove(id: string) {
    setQuotes((prev) => prev.filter((q) => q.id !== id));
    await supabase.from("quotes").delete().eq("id", id);
  }

  return (
    <AdminLayout>
      <h1 className="font-heading text-2xl font-bold text-text-1">Quotes</h1>
      <p className="mt-1 text-sm text-text-3">
        Published quotes rotate on the student Dashboard.
      </p>

      <form onSubmit={publish} className="card-luxury mt-6 space-y-3 p-6">
        <textarea
          required
          placeholder="Quote text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
        />
        <input
          placeholder="Author (optional — defaults to Diamond Intelligence)"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
        />
        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Publishing…" : "Authenticate & Publish"}
        </button>
      </form>

      <div className="mt-6 space-y-2">
        {loading ? (
          <p className="text-sm text-text-3">Loading…</p>
        ) : quotes.length === 0 ? (
          <p className="text-sm text-text-3">
            Platform awaits initial wisdom.
          </p>
        ) : (
          quotes.map((q) => (
            <div
              key={q.id}
              className="card-luxury flex items-start justify-between gap-3 p-4"
            >
              <div>
                <p className="italic text-text-2">"{q.text}"</p>
                <p className="mt-1 text-xs text-text-3">
                  — {q.author} · {format(new Date(q.created_at), "MMM d, yyyy")}
                </p>
              </div>
              <button
                onClick={() => void remove(q.id)}
                className="shrink-0 rounded-lg p-1.5 text-text-3 hover:bg-rose-50 hover:text-rose-600"
                title="Delete quote"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </AdminLayout>
  );
}

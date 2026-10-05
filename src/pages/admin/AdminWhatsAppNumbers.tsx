import { useEffect, useMemo, useState } from "react";
import { Copy, MessageCircle, Check, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";
import { downloadCSV } from "@/lib/csv";

interface Row {
  user_id: string;
  display_name: string | null;
  username: string | null;
  university: string | null;
  whatsapp: string | null;
  phone: string | null;
  department_name: string | null;
}

export default function AdminWhatsAppNumbers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select(
          "user_id, display_name, username, university, whatsapp, phone, departments ( name )",
        )
        .order("created_at", { ascending: false });

      const all = ((data ?? []) as unknown as (Row & {
        departments: { name: string } | null;
      })[]).map((r) => ({
        user_id: r.user_id,
        display_name: r.display_name,
        username: r.username,
        university: r.university,
        whatsapp: r.whatsapp,
        phone: r.phone,
        department_name: r.departments?.name ?? null,
      }));
      setRows(all.filter((r) => (r.whatsapp || r.phone)?.trim()));
      setLoading(false);
    }
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.whatsapp ?? r.phone ?? "").toLowerCase().includes(q) ||
        (r.display_name ?? "").toLowerCase().includes(q) ||
        (r.username ?? "").toLowerCase().includes(q) ||
        (r.university ?? "").toLowerCase().includes(q) ||
        (r.department_name ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const uniqueNumbers = new Set(
    filtered.map((r) => (r.whatsapp ?? r.phone ?? "").replace(/\D/g, "")),
  ).size;

  function copyNumber(id: string, number: string) {
    void navigator.clipboard.writeText(number);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function copyAll() {
    const all = filtered.map((r) => r.whatsapp ?? r.phone ?? "").join(", ");
    void navigator.clipboard.writeText(all);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  }

  function exportCsv() {
    const rowsOut = [
      ["WhatsApp Number", "Full Name", "Username", "University", "Department"],
      ...filtered.map((r) => [
        r.whatsapp ?? r.phone ?? "",
        r.display_name ?? "",
        r.username ?? "",
        r.university ?? "",
        r.department_name ?? "",
      ]),
    ];
    downloadCSV(`users_whatsapp_numbers_${Date.now()}.csv`, rowsOut);
  }

  function chatUrl(number: string) {
    return `https://wa.me/${number.replace(/\D/g, "")}`;
  }

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-1">
            Users WhatsApp Numbers
          </h1>
          <p className="mt-1 max-w-xl text-sm text-text-3">
            Dedicated repository of registered WhatsApp contact numbers for
            announcements and scholar outreach.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="card-luxury px-4 py-2 text-center">
            <p className="font-heading text-lg font-bold text-text-1">
              {filtered.length}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-text-3">
              Contacts
            </p>
          </div>
          <div className="card-luxury px-4 py-2 text-center">
            <p className="font-heading text-lg font-bold text-text-1">
              {uniqueNumbers}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-text-3">
              Unique
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          placeholder="Search by number, username, name, department, or university…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[260px] flex-1 rounded-xl border border-canvas-border bg-white px-3 py-2 text-sm text-text-1 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
        />
        <button onClick={copyAll} className="btn-outline">
          {copiedAll ? (
            <>
              <Check size={16} /> Copied!
            </>
          ) : (
            <>
              <Copy size={16} /> Copy All
            </>
          )}
        </button>
        <button onClick={exportCsv} className="btn-primary">
          <Download size={16} />
          Download CSV
        </button>
      </div>

      <div className="card-luxury mt-4 overflow-x-auto">
        {loading ? (
          <p className="p-4 text-sm text-text-3">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-text-3">No WhatsApp numbers found.</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-canvas-border bg-canvas-soft text-[10px] font-bold uppercase tracking-wide text-text-3">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">WhatsApp Number</th>
                <th className="px-4 py-3">Name &amp; Username</th>
                <th className="px-4 py-3">University</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas-border">
              {filtered.map((r, i) => {
                const number = r.whatsapp ?? r.phone ?? "";
                return (
                  <tr key={r.user_id}>
                    <td className="px-4 py-3 text-text-3">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-text-1">
                      {number}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-text-1">
                        {r.display_name || "Unnamed"}
                      </p>
                      {r.username && (
                        <p className="font-mono text-xs text-royal">
                          @{r.username}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-3">
                      {r.university || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-3">
                      {r.department_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => copyNumber(r.user_id, number)}
                          className="btn-outline px-2.5 py-1 text-xs"
                        >
                          {copiedId === r.user_id ? (
                            <Check size={13} />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                        <a
                          href={chatUrl(number)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary px-2.5 py-1 text-xs"
                        >
                          <MessageCircle size={13} />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { AdminLayout } from "@/components/AdminLayout";
import { StepUpModal } from "@/components/StepUpModal";
import { downloadCSV } from "@/lib/csv";

type Role = "student" | "moderator" | "admin";
type StatusFilter = "all" | "active" | "suspended";

interface UserRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  university: string | null;
  whatsapp: string | null;
  phone: string | null;
  status: "active" | "suspended";
  suspension_reason: string | null;
  currency: string;
  created_at: string;
}

type PendingAction =
  | { type: "suspend"; userId: string; reason: string }
  | { type: "unsuspend"; userId: string }
  | { type: "delete"; userId: string }
  | { type: "change_role"; userId: string; newRole: Role };

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [affiliateStatus, setAffiliateStatus] = useState<
    Record<string, string>
  >({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const [showAddUser, setShowAddUser] = useState(false);
  const [addForm, setAddForm] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "student" as Role,
  });
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: profileRows } = await supabase
      .from("profiles")
      .select(
        "user_id, display_name, username, university, whatsapp, phone, status, suspension_reason, currency, created_at",
      )
      .order("created_at", { ascending: false });
    setUsers(profileRows ?? []);

    const userIds = (profileRows ?? []).map((u) => u.user_id);
    if (userIds.length > 0) {
      const [{ data: emailRows }, { data: roleRows }, { data: affiliateRows }] =
        await Promise.all([
          supabase.rpc("admin_list_emails", { p_user_ids: userIds }),
          supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
          supabase
            .from("affiliate_profiles")
            .select("user_id, status")
            .in("user_id", userIds),
        ]);
      setEmails(
        Object.fromEntries(
          (emailRows ?? []).map((r: { user_id: string; email: string }) => [
            r.user_id,
            r.email,
          ]),
        ),
      );
      setRoles(
        Object.fromEntries(
          (roleRows ?? []).map((r: { user_id: string; role: Role }) => [
            r.user_id,
            r.role,
          ]),
        ),
      );
      setAffiliateStatus(
        Object.fromEntries(
          (affiliateRows ?? []).map(
            (r: { user_id: string; status: string }) => [r.user_id, r.status],
          ),
        ),
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (u.display_name ?? "").toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q) ||
        (emails[u.user_id] ?? "").toLowerCase().includes(q) ||
        (u.suspension_reason ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, emails, search, statusFilter]);

  async function approvePartner(userId: string) {
    setBusyId(userId);
    setError(null);
    const { error: rpcError } = await supabase.rpc("admin_activate_affiliate", {
      p_user_id: userId,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setInfo("Affiliate partner approved.");
    void load();
  }

  async function runPendingAction(otpToken: string) {
    if (!pending) return;
    setBusyId(pending.userId);
    setError(null);

    const body: Record<string, unknown> = {
      action: pending.type,
      target_user_id: pending.userId,
      otp_token: otpToken,
    };
    if (pending.type === "suspend") body.reason = pending.reason;
    if (pending.type === "change_role") body.new_role = pending.newRole;

    const { data, error: invokeError } = await supabase.functions.invoke(
      "admin-manage-user",
      { body },
    );
    setBusyId(null);
    setPending(null);

    if (invokeError || !data?.success) {
      setError(
        `Action failed: ${invokeError?.message ?? data?.error ?? "unknown error"}`,
      );
      return;
    }
    setInfo("Done.");
    void load();
  }

  async function submitAddUser(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!addForm.email || addForm.password.length < 8) {
      setAddError("Email and an 8+ character password are required.");
      return;
    }
    setAddBusy(true);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "admin-manage-user",
      {
        body: {
          action: "create",
          email: addForm.email,
          password: addForm.password,
          display_name: addForm.displayName || undefined,
          role: addForm.role,
        },
      },
    );
    setAddBusy(false);
    if (invokeError || !data?.success) {
      setAddError(
        `Couldn't create user: ${invokeError?.message ?? data?.error ?? "unknown error"}`,
      );
      return;
    }
    setShowAddUser(false);
    setAddForm({ email: "", password: "", displayName: "", role: "student" });
    setInfo("User created.");
    void load();
  }

  function exportCsv() {
    const rows = [
      [
        "WhatsApp Number",
        "Full Name",
        "Username",
        "University",
        "Email",
        "Role",
        "Status",
      ],
      ...filtered.map((u) => [
        u.whatsapp ?? u.phone ?? "",
        u.display_name ?? "",
        u.username ?? "",
        u.university ?? "",
        emails[u.user_id] ?? "",
        roles[u.user_id] ?? "student",
        u.status,
      ]),
    ];
    downloadCSV(`scholars_directory_export_${Date.now()}.csv`, rows);
  }

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-1">Users</h1>
          <p className="mt-1 text-sm text-text-3">
            {filtered.length} of {users.length} users
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="btn-outline">
            Export CSV
          </button>
          <Link to="/admin/whatsapp-numbers" className="btn-secondary">
            <MessageCircle size={16} />
            WhatsApp Numbers
          </Link>
          <button
            onClick={() => setShowAddUser(true)}
            className="btn-primary"
          >
            Add user
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          placeholder="Search name, username, email, reason…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[240px] flex-1 rounded-xl border border-canvas-border bg-white px-3 py-2 text-sm text-text-1 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-xl border border-canvas-border bg-white px-3 py-2 text-sm text-text-1"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {info && (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {info}
        </p>
      )}

      <div className="card-luxury mt-4 overflow-x-auto">
        {loading ? (
          <p className="p-4 text-sm text-text-3">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-text-3">No users match.</p>
        ) : (
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead>
              <tr className="border-b border-canvas-border bg-canvas-soft text-[10px] font-bold uppercase tracking-wide text-text-3">
                <th className="px-4 py-3 font-bold">Scholar Profile</th>
                <th className="px-4 py-3 font-bold">Institutional Dept</th>
                <th className="px-4 py-3 font-bold">Role</th>
                <th className="px-4 py-3 font-bold">Affiliate Status</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas-border">
              {filtered.map((u) => {
                const isSelf = u.user_id === currentUser?.id;
                const role = roles[u.user_id] ?? "student";
                const isPartner = affiliateStatus[u.user_id] === "active";
                const rowBusy = busyId === u.user_id;

                return (
                  <tr key={u.user_id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-heading font-bold text-text-1">
                        {u.display_name || "Unnamed"}
                      </p>
                      {u.username && (
                        <p className="font-mono text-xs text-royal">
                          @{u.username}
                        </p>
                      )}
                      <p className="text-xs text-text-3">
                        {emails[u.user_id] ?? "—"}
                      </p>
                      <p className="text-xs text-text-3">
                        {u.whatsapp || u.phone || "no contact"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold uppercase text-text-2">
                        {u.university || "No university set"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={role}
                        disabled={isSelf || rowBusy}
                        onChange={(e) =>
                          setPending({
                            type: "change_role",
                            userId: u.user_id,
                            newRole: e.target.value as Role,
                          })
                        }
                        className="rounded-xl border border-canvas-border bg-white px-2 py-1.5 text-xs disabled:opacity-50"
                      >
                        <option value="student">Student</option>
                        <option value="moderator">Moderator</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {isPartner ? (
                        <span className="badge-royal">Active</span>
                      ) : (
                        <button
                          onClick={() => void approvePartner(u.user_id)}
                          disabled={rowBusy}
                          className="btn-secondary px-3 py-1.5 text-xs"
                        >
                          Approve Partner
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          u.status === "suspended"
                            ? "inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700"
                            : "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                        }
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${u.status === "suspended" ? "bg-rose-500" : "bg-emerald-500"}`}
                        />
                        {u.status === "suspended" ? "Suspended" : "Active"}
                      </span>
                      {u.status === "suspended" && (
                        <p className="mt-1 max-w-[160px] text-[11px] text-rose-600">
                          {u.suspension_reason || "No reason given"}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {u.status === "suspended" ? (
                          <button
                            onClick={() =>
                              setPending({ type: "unsuspend", userId: u.user_id })
                            }
                            disabled={isSelf || rowBusy}
                            className="btn-secondary px-2.5 py-1 text-xs disabled:opacity-50"
                          >
                            Unsuspend
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const reason =
                                window.prompt(
                                  "Reason for suspension?",
                                  "Suspended by administrator.",
                                ) ?? "";
                              setPending({
                                type: "suspend",
                                userId: u.user_id,
                                reason,
                              });
                            }}
                            disabled={isSelf || rowBusy}
                            className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                          >
                            Suspend
                          </button>
                        )}
                        <button
                          onClick={() =>
                            setPending({ type: "delete", userId: u.user_id })
                          }
                          disabled={isSelf || rowBusy}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pending && (
        <StepUpModal
          title={describePending(pending)}
          description="This action requires security clearance — enter the code sent to your own email."
          onCancel={() => setPending(null)}
          onVerified={(token) => void runPendingAction(token)}
        />
      )}

      {showAddUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 px-4">
          <div className="card-luxury w-full max-w-sm p-6">
            <h2 className="font-heading text-lg font-bold text-text-1">
              Add user
            </h2>
            <form onSubmit={submitAddUser} className="mt-4 space-y-3">
              <input
                type="email"
                required
                placeholder="Email"
                value={addForm.email}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, email: e.target.value }))
                }
                className={modalInputClass}
              />
              <input
                type="password"
                required
                placeholder="Password (8+ characters)"
                value={addForm.password}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, password: e.target.value }))
                }
                className={modalInputClass}
              />
              <input
                placeholder="Full name"
                value={addForm.displayName}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, displayName: e.target.value }))
                }
                className={modalInputClass}
              />
              <select
                value={addForm.role}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, role: e.target.value as Role }))
                }
                className={modalInputClass}
              >
                <option value="student">Student</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
              {addError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {addError}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  className="btn-outline flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addBusy}
                  className="btn-primary flex-1"
                >
                  {addBusy ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function describePending(pending: PendingAction): string {
  switch (pending.type) {
    case "suspend":
      return "Suspend this account.";
    case "unsuspend":
      return "Restore this account.";
    case "delete":
      return "Permanently delete this account.";
    case "change_role":
      return `Change role to ${pending.newRole}.`;
  }
}

const modalInputClass =
  "w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15";

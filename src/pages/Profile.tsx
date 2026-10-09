import { useNavigate } from "react-router-dom";
import {
  Shield,
  Bell,
  ListChecks,
  Receipt,
  UserCog,
  Gift,
  HelpCircle,
  LogOut,
  GraduationCap,
  Phone,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";

export default function Profile() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const displayName = profile?.display_name || "Scholar";

  return (
    <Layout title="Profile">
      <div className="card-luxury flex flex-col items-center gap-2 p-6 text-center">
        <div className="diamond-gradient relative flex h-16 w-16 items-center justify-center rounded-full shadow-lg">
          <span className="font-heading text-xl font-bold text-white">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-navy">
            <Shield size={11} />
          </span>
        </div>
        <p className="font-heading text-lg font-bold text-text-1">
          {displayName}
        </p>
        {profile?.username && (
          <p className="font-mono text-sm text-royal">@{profile.username}</p>
        )}
        <p className="text-xs uppercase tracking-wide text-text-3">
          {user?.email}
        </p>
        <span className="badge-royal mt-1 capitalize">
          {isAdmin ? "admin" : "student"}
        </span>
      </div>

      <div className="card-luxury mt-4 p-5">
        <h2 className="font-heading text-xs font-bold uppercase tracking-wide text-text-3">
          Verification
        </h2>
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex items-start gap-2.5">
            <GraduationCap size={16} className="mt-0.5 shrink-0 text-royal" />
            <div>
              <p className="text-text-3">Institution</p>
              <p className="font-semibold text-text-1">
                {profile?.university || "Not set"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Phone size={16} className="mt-0.5 shrink-0 text-royal" />
            <div>
              <p className="text-text-3">Contact</p>
              <p className="font-semibold text-text-1">
                {profile?.phone || profile?.whatsapp || "Not configured"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <MenuSection title="Settings">
        <MenuItem
          icon={Bell}
          label="Notifications"
          onClick={() => {}}
          hint="Use the bell icon above"
        />
        <MenuItem
          icon={ListChecks}
          label="Activity Log"
          onClick={() => navigate("/activity-log")}
        />
        <MenuItem
          icon={Receipt}
          label="Payment History"
          onClick={() => navigate("/payments")}
        />
        <MenuItem
          icon={UserCog}
          label="Account"
          onClick={() => navigate("/account")}
        />
      </MenuSection>

      <MenuSection title="Partner Program">
        <MenuItem
          icon={Gift}
          label="Affiliate Program"
          onClick={() => navigate("/affiliate")}
        />
        <MenuItem
          icon={HelpCircle}
          label="Support"
          onClick={() => navigate("/chats")}
        />
      </MenuSection>

      {isAdmin && (
        <button
          onClick={() => navigate("/admin/dashboard")}
          className="btn-primary mt-4 flex w-full items-center justify-center gap-2"
        >
          <Shield size={16} />
          Admin Dashboard
        </button>
      )}

      <button
        onClick={() => void signOut()}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
      >
        <LogOut size={16} />
        Sign Out
      </button>

      <p className="mt-6 text-center text-xs text-text-3">
        Diamond Solution Academic v2.0
      </p>
    </Layout>
  );
}

function MenuSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-luxury mt-4 overflow-hidden p-0">
      <h2 className="px-5 pt-4 font-heading text-xs font-bold uppercase tracking-wide text-text-3">
        {title}
      </h2>
      <div className="mt-2 divide-y divide-canvas-border">{children}</div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  hint,
}: {
  icon: typeof Bell;
  label: string;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-canvas-soft"
    >
      <Icon size={18} className="text-royal" />
      <span className="flex-1 text-sm font-semibold text-text-1">
        {label}
      </span>
      {hint && <span className="text-xs text-text-3">{hint}</span>}
    </button>
  );
}

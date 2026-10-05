import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  Layers,
  Users,
  MessageCircle,
  Link2,
  Wallet,
  CreditCard,
  BarChart3,
  Building2,
  FileText,
  Image,
  Bell,
  Quote,
  MessageSquare,
  ScrollText,
  Shield,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { DiamondLogo } from "@/components/DiamondLogo";
import { useAuth } from "@/context/AuthContext";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
}

const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Main",
    items: [
      { to: "/admin/dashboard", label: "Dashboard", icon: LayoutGrid },
      { to: "/dashboard", label: "User Dashboard", icon: Layers },
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/whatsapp-numbers", label: "WhatsApp Numbers", icon: MessageCircle },
      { to: "/admin/affiliates", label: "Affiliates", icon: Link2 },
      { to: "/admin/withdrawals", label: "Withdrawals", icon: Wallet },
    ],
  },
  {
    heading: "Finance",
    items: [
      { to: "/admin/payments", label: "Payments", icon: CreditCard },
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    heading: "Content",
    items: [
      { to: "/admin/departments", label: "Departments", icon: Building2 },
      { to: "/admin/questions", label: "Questions", icon: FileText },
      { to: "/admin/media", label: "Pictures & Media", icon: Image },
      { to: "/admin/notifications", label: "Notifications", icon: Bell },
      { to: "/admin/quotes", label: "Quotes", icon: Quote },
      { to: "/admin/support", label: "Support", icon: MessageSquare },
      { to: "/admin/audit-log", label: "System Logs", icon: ScrollText },
      { to: "/admin/settings", label: "Settings", icon: Shield },
    ],
  },
];

function activeLabel(pathname: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.to !== "/dashboard" && pathname.startsWith(item.to)) {
        return item.label;
      }
    }
  }
  return "Overview";
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sidebar = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between px-6 py-6">
        <DiamondLogo layout="horizontal" size={30} />
        <button
          onClick={() => setDrawerOpen(false)}
          className="rounded-lg p-1 text-text-3 hover:bg-canvas-soft md:hidden"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="mb-5">
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-text-3">
              {group.heading}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  item.to === "/dashboard"
                    ? false
                    : location.pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? "bg-royal-soft text-royal"
                        : "text-text-2 hover:bg-canvas-soft"
                    }`}
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-canvas-border px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-royal text-sm font-bold text-white">
          {(user?.email ?? "A").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-text-1">
            {user?.email ?? "Admin"}
          </p>
          <p className="text-[10px] text-text-3">Super Admin</p>
        </div>
        <button
          onClick={() => void signOut()}
          className="rounded-lg p-1.5 text-text-3 hover:bg-canvas-soft"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas md:flex">
      {/* Desktop: static sidebar. Mobile: off-canvas drawer + backdrop. */}
      <aside className="hidden w-64 shrink-0 border-r border-canvas-border md:block">
        {sidebar}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-navy/50"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-canvas-border shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-canvas-border bg-white/90 backdrop-blur">
          <div className="flex items-center gap-3 px-5 py-4">
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg p-1.5 text-text-2 hover:bg-canvas-soft md:hidden"
            >
              <Menu size={20} />
            </button>
            <h1 className="font-heading text-lg font-bold text-text-1">
              {activeLabel(location.pathname)}
            </h1>
          </div>
        </header>
        <main className="px-5 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

import { Link, useLocation } from "react-router-dom";
import {
  ChevronLeft,
  Home,
  BookOpen,
  MessageCircle,
  User,
  Shield,
  LogOut,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { DiamondLogo } from "@/components/DiamondLogo";

interface LayoutProps {
  title: string;
  onBack?: () => void;
  children: React.ReactNode;
  // Opt-in wider content measure for dashboard-style pages with multiple cards/grids.
  // Everything else (forms, lists) stays at a readable width within the content pane.
  wide?: boolean;
}

const NAV = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/courses", label: "Departments", icon: BookOpen },
  { to: "/chats", label: "Chats", icon: MessageCircle },
  { to: "/profile", label: "User", icon: User },
];

export function Layout({ title, onBack, children, wide = false }: LayoutProps) {
  const { isAdmin, signOut } = useAuth();
  const location = useLocation();
  const contentMaxWidth = wide ? "max-w-none" : "max-w-3xl";

  return (
    <div className="diamond-mesh min-h-screen pb-24 md:flex md:pb-0">
      {/* Desktop-only: a persistent sidebar — on mobile the same links live in the fixed
          bottom tab bar instead, so this is hidden there. */}
      <aside className="diamond-gradient hidden w-64 shrink-0 flex-col md:flex">
        <div className="p-6">
          <DiamondLogo layout="horizontal" size={26} variant="white" />
        </div>

        <nav className="flex-1 space-y-1 px-4">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-white/15 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              to="/admin/dashboard"
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                location.pathname.startsWith("/admin")
                  ? "bg-white/15 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Shield size={17} />
              Admin
            </Link>
          )}
        </nav>

        <div className="m-4 rounded-2xl bg-white/10 p-4">
          <Sparkles size={18} className="text-gold" />
          <p className="mt-2 text-sm font-bold text-white">
            Small steps make big progress!
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Consistency compounds — keep your streak going.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-canvas-border bg-white/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 md:px-8">
            {onBack && (
              <button
                onClick={onBack}
                className="rounded-full p-1.5 hover:bg-canvas-soft"
              >
                <ChevronLeft size={20} className="text-text-2" />
              </button>
            )}
            <h1 className="font-heading text-lg font-bold text-text-1">
              {title}
            </h1>
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell />
              <button
                onClick={() => void signOut()}
                className="rounded-full p-1.5 text-text-3 hover:bg-canvas-soft"
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className={`mx-auto px-4 py-6 md:px-8 ${contentMaxWidth}`}>
          {children}
        </main>
      </div>

      <nav className="fixed bottom-4 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-2xl border border-canvas-border bg-navy px-1.5 py-2 shadow-lg md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                active
                  ? "bg-white/15 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            to="/admin/dashboard"
            className={`flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              location.pathname.startsWith("/admin")
                ? "bg-white/15 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Shield size={17} />
            Admin
          </Link>
        )}
      </nav>
    </div>
  );
}

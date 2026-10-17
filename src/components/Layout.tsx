import { useEffect } from "react";
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
  Trophy,
  ListChecks,
  Gift,
  Receipt,
  SmartphoneNfc,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { NotificationBell } from "@/components/NotificationBell";
import { DiamondLogo } from "@/components/DiamondLogo";
import { logPageVisit } from "@/lib/visitTracking";

interface LayoutProps {
  title: string;
  onBack?: () => void;
  children: React.ReactNode;
  // Opt-in wider content measure for dashboard-style pages with multiple cards/grids.
  // Everything else (forms, lists) stays at a readable width within the content pane.
  wide?: boolean;
}

const NAV = [
  { to: "/dashboard", labelKey: "nav.home", icon: Home },
  { to: "/courses", labelKey: "nav.departments", icon: BookOpen },
  { to: "/chats", labelKey: "nav.chats", icon: MessageCircle },
  { to: "/profile", labelKey: "nav.user", icon: User },
];

// Desktop sidebar only — there's room for direct links here, unlike the mobile bottom bar
// (kept to the 4 primary tabs above so it doesn't get cramped). These are reached via
// Dashboard's Quick Actions tiles on mobile instead.
const DESKTOP_EXTRA_NAV = [
  { to: "/leaderboard", labelKey: "nav.leaderboard", icon: Trophy },
  { to: "/activity-log", labelKey: "nav.activity", icon: ListChecks },
  { to: "/affiliate", labelKey: "nav.affiliate", icon: Gift },
  { to: "/payments", labelKey: "nav.payments", icon: Receipt },
  { to: "/about", labelKey: "nav.about", icon: BookOpen },
];

export function Layout({ title, onBack, children, wide = false }: LayoutProps) {
  const {
    user,
    isAdmin,
    isModerator,
    signOut,
    deviceKickedNotice,
    dismissDeviceKickedNotice,
  } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const contentMaxWidth = wide ? "max-w-none" : "max-w-3xl";

  useEffect(() => {
    if (user) logPageVisit(user.id, location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.id]);

  return (
    <div className="diamond-mesh min-h-screen pb-24 md:flex md:pb-0">
      {/* Desktop-only: a persistent sidebar — on mobile the same links live in the fixed
          bottom tab bar instead, so this is hidden there. */}
      <aside className="diamond-gradient hidden w-64 shrink-0 flex-col md:flex">
        <div className="p-6">
          <DiamondLogo layout="horizontal" size={26} variant="white" />
        </div>

        <nav className="flex-1 space-y-1 px-4">
          {NAV.map(({ to, labelKey, icon: Icon }) => {
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
                {t(labelKey)}
              </Link>
            );
          })}

          <div className="my-2 border-t border-white/10" />

          {DESKTOP_EXTRA_NAV.map(({ to, labelKey, icon: Icon }) => {
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
                {t(labelKey)}
              </Link>
            );
          })}

          {(isAdmin || isModerator) && (
            <Link
              to="/admin/dashboard"
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                location.pathname.startsWith("/admin")
                  ? "bg-white/15 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Shield size={17} />
              {t(isAdmin ? "nav.admin" : "nav.moderator")}
            </Link>
          )}
        </nav>

        <div className="m-4 rounded-2xl bg-white/10 p-4">
          <Sparkles size={18} className="text-gold" />
          <p className="mt-2 text-sm font-bold text-white">
            {t("layout.motivation.title")}
          </p>
          <p className="mt-1 text-xs text-slate-300">
            {t("layout.motivation.subtitle")}
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
                title={t("common.signOut")}
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        {deviceKickedNotice && (
          <div className="flex items-center gap-2.5 bg-gold/15 px-4 py-2.5 text-sm text-text-1 md:px-8">
            <SmartphoneNfc size={16} className="shrink-0 text-gold" />
            <p className="flex-1">
              You signed in on a new device, so your other session was signed
              out. Only one device can be signed in at a time — a 3rd device
              will lock your account for 24 hours.
            </p>
            <button
              onClick={dismissDeviceKickedNotice}
              className="shrink-0 rounded-full p-1 hover:bg-black/5"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <main className={`mx-auto px-4 py-6 md:px-8 ${contentMaxWidth}`}>
          {children}
        </main>
      </div>

      <nav className="fixed bottom-4 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-2xl border border-canvas-border bg-navy px-1.5 py-2 shadow-lg md:hidden">
        {NAV.map(({ to, labelKey, icon: Icon }) => {
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
              {t(labelKey)}
            </Link>
          );
        })}
        {(isAdmin || isModerator) && (
          <Link
            to="/admin/dashboard"
            className={`flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              location.pathname.startsWith("/admin")
                ? "bg-white/15 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Shield size={17} />
            {t(isAdmin ? "nav.admin" : "nav.moderator")}
          </Link>
        )}
      </nav>
    </div>
  );
}

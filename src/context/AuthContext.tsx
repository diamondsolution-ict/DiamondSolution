import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";

export interface Profile {
  user_id: string;
  display_name: string | null;
  username: string | null;
  university: string | null;
  department_id: string | null;
  phone: string | null;
  whatsapp: string | null;
  language: "en" | "fr";
  currency: "NGN" | "USD";
  status: "active" | "suspended";
  suspension_reason: string | null;
  device_block_started_at: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: string[];
  isAdmin: boolean;
  isModerator: boolean;
  isSuspended: boolean;
  isDeviceBlocked: boolean;
  deviceBlockedSince: string | null;
  deviceKickedNotice: boolean;
  dismissDeviceKickedNotice: () => void;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceKickedNotice, setDeviceKickedNotice] = useState(false);
  // Guards against calling register_device_login on every token refresh — it only needs to run
  // once per browser session per signed-in user, not on every onAuthStateChange firing.
  const registeredDeviceForUser = useRef<string | null>(null);

  async function loadProfileAndRoles(userId: string) {
    const [{ data: profileRow }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile(profileRow ?? null);
    setRoles((roleRows ?? []).map((r) => r.role));
  }

  // See supabase/migrations/20261013210000_device_login_limits.sql. Admins/moderators always
  // get back {status: 'ok'} with no side effects — this is a no-op for staff.
  async function registerDevice(userId: string) {
    if (registeredDeviceForUser.current === userId) return;
    registeredDeviceForUser.current = userId;

    const { data, error } = await supabase.rpc("register_device_login", {
      p_device_id: getDeviceId(),
    });
    if (error) {
      console.warn("register_device_login failed:", error.message);
      return;
    }
    const status = (data as { status?: string; blocked_since?: string } | null)
      ?.status;
    if (status === "blocked") {
      const blockedSince =
        (data as { blocked_since?: string }).blocked_since ??
        new Date().toISOString();
      setProfile((prev) =>
        prev ? { ...prev, device_block_started_at: blockedSince } : prev,
      );
    } else if (status === "ok_kicked_other") {
      setDeviceKickedNotice(true);
      // Real, non-spoofable enforcement: ends every other session for this account right now.
      await supabase.auth.signOut({ scope: "others" });
    }
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadProfileAndRoles(data.session.user.id);
        await registerDevice(data.session.user.id);
      }
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!active) return;
        setSession(newSession);
        if (newSession?.user) {
          await loadProfileAndRoles(newSession.user.id);
          if (event === "SIGNED_IN") {
            await registerDevice(newSession.user.id);
          }
        } else {
          setProfile(null);
          setRoles([]);
          registeredDeviceForUser.current = null;
        }
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function refreshProfile() {
    if (session?.user) await loadProfileAndRoles(session.user.id);
  }

  function dismissDeviceKickedNotice() {
    setDeviceKickedNotice(false);
  }

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    profile,
    roles,
    isAdmin: roles.includes("admin"),
    isModerator: roles.includes("moderator"),
    isSuspended: profile?.status === "suspended",
    isDeviceBlocked: !!profile?.device_block_started_at,
    deviceBlockedSince: profile?.device_block_started_at ?? null,
    deviceKickedNotice,
    dismissDeviceKickedNotice,
    loading,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

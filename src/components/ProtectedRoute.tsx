import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import { AdminKeyGate } from "@/components/AdminKeyGate";

export function ProtectedRoute() {
  const { user, isSuspended, isDeviceBlocked, loading } = useAuth();

  if (loading) {
    return <LoadingScreen full />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Reactivation.tsx lives outside this guard (a suspended account is still authenticated,
  // just blocked) — every other protected page redirects there until the account is active
  // again, matching the old app's "only path back in" behavior for FUNCTIONAL_SPEC.md §9.
  if (isSuspended) {
    return <Navigate to="/reactivation" replace />;
  }

  // Same idea for a 3rd-device lock (20261013210000_device_login_limits.sql) — DeviceLocked.tsx
  // lives outside this guard too.
  if (isDeviceBlocked) {
    return <Navigate to="/device-locked" replace />;
  }

  return <Outlet />;
}

export function AdminRoute() {
  const { user, isAdmin, isModerator, loading } = useAuth();

  if (loading) {
    return <LoadingScreen full />;
  }

  // Not signed in at all → the admin sign-in page, not the student one.
  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  // A real, signed-in account, just not staff → their own dashboard, not back to a login
  // page they'd only fail again.
  if (!isAdmin && !isModerator) {
    return <Navigate to="/dashboard" replace />;
  }

  // The personal-key gate is admin-only, same scope as the destructive-action step-up this
  // code also guards — a moderator has never needed it and goes straight through.
  if (isAdmin) {
    return (
      <AdminKeyGate>
        <Outlet />
      </AdminKeyGate>
    );
  }

  return <Outlet />;
}

// Nested inside AdminRoute, for the subset of /admin/* pages a moderator shouldn't reach at
// all — Users, Departments, Courses/Questions management, Withdrawals, Media, System Logs,
// Settings. A moderator's own scope (Dashboard, Analytics, WhatsApp Numbers, Affiliates,
// Payments, Notifications, Quotes, Support) never routes through here. Backend RLS/Edge
// Functions enforce the same boundary independently (see
// 20261013200000_moderator_scope_limits.sql) — this is the UI-level redirect so a moderator
// following a stale link or typing the URL lands somewhere useful instead of a page full of
// controls that would all fail.
export function AdminOnlyRoute() {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return <LoadingScreen full />;
  }
  if (!isAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <Outlet />;
}

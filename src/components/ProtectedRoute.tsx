import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import { AdminKeyGate } from "@/components/AdminKeyGate";

export function ProtectedRoute() {
  const { user, isSuspended, loading } = useAuth();

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

import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute() {
  const { user, isSuspended, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
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
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
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

  return <Outlet />;
}

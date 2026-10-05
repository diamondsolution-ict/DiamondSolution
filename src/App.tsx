import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute, AdminRoute } from "@/components/ProtectedRoute";
import Splash from "@/pages/Splash";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import CourseList from "@/pages/CourseList";
import CourseDetail from "@/pages/CourseDetail";
import StudyPage from "@/pages/StudyPage";
import ActivityLog from "@/pages/ActivityLog";
import Leaderboard from "@/pages/Leaderboard";
import Affiliate from "@/pages/Affiliate";
import Profile from "@/pages/Profile";
import AccountSettings from "@/pages/AccountSettings";
import PaymentHistory from "@/pages/PaymentHistory";
import Reactivation from "@/pages/Reactivation";
import { ChatsComingSoon } from "@/pages/ComingSoon";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminAffiliates from "@/pages/admin/AdminAffiliates";
import { AdminComingSoon } from "@/pages/admin/AdminComingSoon";
import AdminDepartments from "@/pages/admin/AdminDepartments";
import AdminCourses from "@/pages/admin/AdminCourses";
import AdminQuestions from "@/pages/admin/AdminQuestions";
import AdminPayments from "@/pages/admin/AdminPayments";
import AdminWithdrawals from "@/pages/admin/AdminWithdrawals";
import AdminQuotes from "@/pages/admin/AdminQuotes";
import AdminAuditLog from "@/pages/admin/AdminAuditLog";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminLogin from "@/pages/admin/AdminLogin";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/reactivation" element={<Reactivation />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/courses" element={<CourseList />} />
          <Route path="/courses/:id" element={<CourseDetail />} />
          <Route path="/courses/:id/study" element={<StudyPage />} />
          <Route path="/activity-log" element={<ActivityLog />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/affiliate" element={<Affiliate />} />
          <Route path="/chats" element={<ChatsComingSoon />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/account" element={<AccountSettings />} />
          <Route path="/payments" element={<PaymentHistory />} />
        </Route>

        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/affiliates" element={<AdminAffiliates />} />
          <Route path="/admin/departments" element={<AdminDepartments />} />
          <Route path="/admin/courses" element={<AdminCourses />} />
          <Route
            path="/admin/courses/:courseId/questions"
            element={<AdminQuestions />}
          />
          <Route path="/admin/payments" element={<AdminPayments />} />
          <Route path="/admin/withdrawals" element={<AdminWithdrawals />} />
          <Route path="/admin/quotes" element={<AdminQuotes />} />
          <Route path="/admin/audit-log" element={<AdminAuditLog />} />
          <Route path="/admin/settings" element={<AdminSettings />} />

          {/* Shells matching the sidebar's full tab set — content not built yet. */}
          <Route
            path="/admin/whatsapp-numbers"
            element={
              <AdminComingSoon
                title="WhatsApp Numbers"
                description="A dedicated contact-extraction directory for broadcast/outreach is on the way."
              />
            }
          />
          <Route
            path="/admin/analytics"
            element={
              <AdminComingSoon
                title="Analytics"
                description="Revenue history, payout history, and engagement analytics charts are on the way."
              />
            }
          />
          <Route
            path="/admin/questions"
            element={
              <AdminComingSoon
                title="Questions"
                description="A department-filtered course/question browser is on the way — manage questions per-course from the Departments tab for now."
              />
            }
          />
          <Route
            path="/admin/media"
            element={
              <AdminComingSoon
                title="Pictures & Media"
                description="A unified department/course picture manager is on the way."
              />
            }
          />
          <Route
            path="/admin/notifications"
            element={
              <AdminComingSoon
                title="Notifications"
                description="Broadcasting an announcement to every student is on the way."
              />
            }
          />
          <Route
            path="/admin/support"
            element={
              <AdminComingSoon
                title="Support"
                description="Live two-pane student support chat is on the way (bundled with the student-facing Chat feature)."
              />
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import AcceptInvitePage from "@/pages/AcceptInvitePage";
import DashboardPage from "@/pages/DashboardPage";
import HierarchyPage from "@/pages/HierarchyPage";
import UsersPage from "@/pages/UsersPage";
import CentersPage from "@/pages/CentersPage";
import DepartmentsPage from "@/pages/DepartmentsPage";
import TasksPage from "@/pages/TasksPage";
import WeeklyReportPage from "@/pages/WeeklyReportPage";
import WeeklyTeamReportPage from "@/pages/WeeklyTeamReportPage";
import MonthlyReportPage from "@/pages/MonthlyReportPage";
import MonthlyTeamReportPage from "@/pages/MonthlyTeamReportPage";
import NotificationsPage from "@/pages/NotificationsPage";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />

      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="hierarchy" element={<HierarchyPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="centers" element={<CentersPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="reports/weekly" element={<WeeklyReportPage />} />
        <Route path="reports/weekly/team" element={<WeeklyTeamReportPage />} />
        <Route path="reports/monthly" element={<MonthlyReportPage />} />
        <Route path="reports/monthly/team" element={<MonthlyTeamReportPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

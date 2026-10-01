import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Toaster from "@/components/Toaster";
import RequireRole from "@/components/RequireRole";
import { APP_ROUTES } from "@/lib/routes";
import { authRedirectPending } from "@/lib/api";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import AcceptInvitePage from "@/pages/AcceptInvitePage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import NotFoundPage from "@/pages/NotFoundPage";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex h-screen items-center justify-center text-subtle">Loading…</div>;
  if (!user) {
    // A hard redirect to /login?reason=expired is already in flight; don't race it with a plainer one.
    if (authRedirectPending) return null;
    // Carries the page they meant to open, so a bookmarked or shared link still lands there after signing in.
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} replace />;
  }
  return children;
}

export default function App() {
  return (
    <>
      <AppRoutes />
      <Toaster />
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {APP_ROUTES.map((route) => {
          const element = (
            <RequireRole roles={route.roles} label={route.label}>
              {route.element}
            </RequireRole>
          );
          return route.path === "" ? (
            <Route key="index" index element={element} />
          ) : (
            <Route key={route.path} path={route.path} element={element} />
          );
        })}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

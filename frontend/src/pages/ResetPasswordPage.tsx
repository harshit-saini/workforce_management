import { useEffect, useState, FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import FormField, { inputClass } from "@/components/FormField";
import { btnPrimary } from "@/lib/ui";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [checking, setChecking] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .get(`/auth/reset-password/${token}`)
      .then(() => setValidToken(true))
      .catch(() => setValidToken(false))
      .finally(() => setChecking(false));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      await api.post(`/auth/reset-password/${token}`, { password });
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Could not reset your password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-card border border-gray-200/80">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-8 h-8 rounded-md bg-brand-600 text-white flex items-center justify-center font-bold text-sm">
            W
          </span>
          <span className="font-semibold text-gray-800">Workforce Mgmt</span>
        </div>

        {checking ? (
          <p className="text-sm text-gray-500">Checking your reset link…</p>
        ) : done ? (
          <>
            <h1 className="text-xl font-semibold mb-1 text-gray-900">Password updated</h1>
            <p className="text-sm text-gray-500 mb-6">
              Your password has been changed and you've been signed out everywhere else for safety.
            </p>
            <Link to="/login" className={`inline-block w-full text-center ${btnPrimary} py-2`}>
              Sign in
            </Link>
          </>
        ) : !validToken ? (
          <>
            <h1 className="text-xl font-semibold mb-1 text-gray-900">Link expired</h1>
            <p className="text-sm text-gray-500 mb-6">
              This password reset link is invalid or has expired. Reset links are only valid for 1 hour and can only be
              used once.
            </p>
            <Link to="/forgot-password" className="text-brand-600 font-medium text-sm">
              Request a new link
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold mb-1 text-gray-900">Choose a new password</h1>
            <p className="text-sm text-gray-500 mb-6">Make it at least 8 characters.</p>
            <form onSubmit={onSubmit}>
              <FormField label="New password">
                <input
                  className={inputClass}
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Confirm new password">
                <input
                  className={inputClass}
                  type="password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </FormField>
              {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
              <button type="submit" disabled={loading} className={`w-full ${btnPrimary} py-2`}>
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

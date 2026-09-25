import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import FormField, { inputClass } from "@/components/FormField";
import { btnPrimary } from "@/lib/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Login failed");
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
        <h1 className="text-xl font-semibold mb-1 text-gray-900">Sign in</h1>
        <p className="text-sm text-gray-500 mb-6">Welcome back to Workforce Management</p>
        <form onSubmit={onSubmit}>
          <FormField label="Email">
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </FormField>
          <FormField label="Password">
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </FormField>
          <div className="text-right -mt-2 mb-4">
            <Link to="/forgot-password" className="text-xs text-brand-600 hover:underline">
              Forgot password?
            </Link>
          </div>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <button type="submit" disabled={loading} className={`w-full ${btnPrimary} py-2`}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-sm text-gray-500 mt-4 text-center">
          New organization?{" "}
          <Link to="/signup" className="text-brand-600 font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

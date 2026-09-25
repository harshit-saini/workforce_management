import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import FormField, { inputClass } from "@/components/FormField";
import { btnPrimary } from "@/lib/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      // Always show the same success state regardless of whether the email is registered.
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Something went wrong. Please try again.");
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

        {submitted ? (
          <>
            <h1 className="text-xl font-semibold mb-1 text-gray-900">Check your email</h1>
            <p className="text-sm text-gray-500">
              If an account exists for <span className="font-medium text-gray-700">{email}</span>, we've sent a link to
              reset your password. The link expires in 1 hour.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold mb-1 text-gray-900">Forgot your password?</h1>
            <p className="text-sm text-gray-500 mb-6">Enter your email and we'll send you a reset link.</p>
            <form onSubmit={onSubmit}>
              <FormField label="Email">
                <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </FormField>
              {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
              <button type="submit" disabled={loading} className={`w-full ${btnPrimary} py-2`}>
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}

        <p className="text-sm text-gray-500 mt-4 text-center">
          <Link to="/login" className="text-brand-600 font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

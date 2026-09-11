import { useEffect, useState, FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import FormField, { inputClass } from "@/components/FormField";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get(`/auth/invite/${token}`)
      .then(({ data }) => setEmail(data.email))
      .catch(() => setError("This invite is invalid or has expired"));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      await acceptInvite(token, name, password);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Could not accept invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-sm border border-gray-100">
        <h1 className="text-xl font-semibold mb-1 text-gray-900">Join your team</h1>
        {email && <p className="text-sm text-gray-500 mb-6">Setting up account for {email}</p>}
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        {email && (
          <form onSubmit={onSubmit}>
            <FormField label="Your name">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
            </FormField>
            <FormField label="Password">
              <input
                className={inputClass}
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </FormField>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 text-white rounded-md py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? "Joining…" : "Accept invite"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

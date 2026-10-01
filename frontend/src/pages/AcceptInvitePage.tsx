import { useEffect, useState, FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import FormField, { inputClass } from "@/components/FormField";
import { btnPrimary, btnSecondary } from "@/lib/ui";
import { Role } from "@/types";

interface InviteDetails {
  email: string;
  role: Role;
  title: string | null;
  organizationName: string;
  centerName: string | null;
  departmentName: string | null;
  managerName: string | null;
  expiresAt: string;
}

type LoadState =
  | { kind: "checking" }
  | { kind: "ready"; invite: InviteDetails }
  // Why it can't be used decides what we suggest next.
  | { kind: "unusable"; reason: "expired" | "used" | "invalid"; organizationName?: string; email?: string }
  | { kind: "failed"; message: string };

const roleLabel: Record<Role, string> = { OWNER: "owner", ADMIN: "an admin", MANAGER: "a manager", EMPLOYEE: "an employee" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-card border border-gray-200/80">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-8 h-8 rounded-md bg-brand-600 text-white flex items-center justify-center font-bold text-sm">W</span>
          <span className="font-semibold text-gray-800">Workforce Mgmt</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const org = state.kind === "ready" ? state.invite.organizationName : state.kind === "unusable" ? state.organizationName : undefined;
  usePageTitle(org ? `Join ${org}` : "Join your team");

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "checking" });
    api
      .get<InviteDetails>(`/auth/invite/${token}`)
      .then(({ data }) => !cancelled && setState({ kind: "ready", invite: data }))
      .catch((err) => {
        if (cancelled) return;
        const code = isAxiosError(err) ? err.response?.data?.error : undefined;
        const details = isAxiosError(err) ? err.response?.data?.details : undefined;
        if (code === "INVITE_EXPIRED") setState({ kind: "unusable", reason: "expired", ...details });
        else if (code === "INVITE_ACCEPTED") setState({ kind: "unusable", reason: "used", ...details });
        else if (code === "INVITE_INVALID") setState({ kind: "unusable", reason: "invalid" });
        else setState({ kind: "failed", message: getErrorMessage(err, "Couldn't check your invite.") });
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      await acceptInvite(token, name, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Could not accept the invite"));
    } finally {
      setLoading(false);
    }
  }

  if (state.kind === "checking") {
    return (
      <Shell>
        <p className="text-sm text-gray-500" role="status">
          Checking your invite…
        </p>
      </Shell>
    );
  }

  if (state.kind === "failed") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Couldn't check your invite</h1>
        <p className="text-sm text-gray-600 mb-6">{state.message}</p>
        <button onClick={() => setAttempt((a) => a + 1)} className={`w-full ${btnPrimary} py-2`}>
          Try again
        </button>
      </Shell>
    );
  }

  if (state.kind === "unusable") {
    const { reason, organizationName, email } = state;
    const title = reason === "expired" ? "This invite has expired" : reason === "used" ? "This invite was already used" : "This invite link isn't valid";
    const body =
      reason === "expired" ? (
        <>
          Invites last 7 days. Ask an admin{organizationName ? ` at ${organizationName}` : ""} to resend it{email ? ` to ${email}` : ""}. The new email has a fresh link.
        </>
      ) : reason === "used" ? (
        <>An account has already been created from it. If that was you, sign in{email ? ` as ${email}` : ""}.</>
      ) : (
        <>Check that you copied the whole link, or ask the person who invited you to send a new one.</>
      );
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">{title}</h1>
        <p className="text-sm text-gray-600 mb-6">{body}</p>
        <Link to="/login" className={`${reason === "used" ? btnPrimary : btnSecondary} w-full py-2`}>
          Go to sign in
        </Link>
      </Shell>
    );
  }

  const { invite } = state;
  const where = [
    invite.centerName && `Center: ${invite.centerName}`,
    invite.departmentName && `Department: ${invite.departmentName}`,
    invite.managerName && `Reports to: ${invite.managerName}`,
  ].filter(Boolean) as string[];

  return (
    <Shell>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Join {invite.organizationName}</h1>
      <p className="text-sm text-gray-600">
        You've been invited as {roleLabel[invite.role]}
        {invite.title ? `, ${invite.title}` : ""}.
      </p>
      {where.length > 0 && (
        <ul className="mt-2 text-sm text-gray-500 space-y-0.5">
          {where.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <form onSubmit={onSubmit} className="mt-6">
        <FormField label="Email">
          <input className={`${inputClass} bg-gray-50 text-gray-600`} value={invite.email} readOnly aria-readonly />
        </FormField>
        <FormField label="Your name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </FormField>
        <FormField label="Password">
          <input
            className={inputClass}
            type="password"
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            aria-describedby="password-hint"
            required
          />
          <p id="password-hint" className="text-xs text-subtle mt-1">
            At least 8 characters.
          </p>
        </FormField>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <button type="submit" disabled={loading} className={`w-full ${btnPrimary} py-2`}>
          {loading ? "Joining…" : `Join ${invite.organizationName}`}
        </button>
      </form>
      <p className="text-sm text-gray-500 mt-4 text-center">
        Already have an account?{" "}
        <Link to="/login" className="text-brand-600 font-medium">
          Sign in
        </Link>
      </p>
    </Shell>
  );
}

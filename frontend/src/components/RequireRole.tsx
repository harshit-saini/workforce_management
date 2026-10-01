import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Role } from "@/types";
import { btnPrimary, card } from "@/lib/ui";

/**
 * Guards a route by role. The sidebar already hides links a role can't use, but that's just
 * navigation — without this, the route itself opened for anyone signed in (an employee could
 * load /users directly), and every save there failed with a 403 that was never shown.
 */
export default function RequireRole({ roles, label, children }: { roles: Role[]; label: string; children: JSX.Element }) {
  const { user } = useAuth();
  if (user && !roles.includes(user.role)) {
    return (
      <div className={`${card} max-w-md mx-auto mt-12 p-6 text-center`}>
        <h1 className="text-base font-semibold text-gray-900 mb-1">Access restricted</h1>
        <p className="text-sm text-gray-500 mb-4">You don't have access to {label}. Ask an admin.</p>
        <Link to="/" className={btnPrimary}>
          Go to Dashboard
        </Link>
      </div>
    );
  }
  return children;
}

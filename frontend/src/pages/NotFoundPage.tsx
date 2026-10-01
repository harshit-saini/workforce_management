import { Link } from "react-router-dom";
import { btnPrimary, card } from "@/lib/ui";

export default function NotFoundPage() {
  return (
    <div className={`${card} max-w-md mx-auto mt-12 p-6 text-center`}>
      <h1 className="text-base font-semibold text-gray-900 mb-1">Page not found</h1>
      <p className="text-sm text-gray-500 mb-4">The page you're looking for doesn't exist, or may have moved.</p>
      <Link to="/" className={btnPrimary}>
        Go to Dashboard
      </Link>
    </div>
  );
}

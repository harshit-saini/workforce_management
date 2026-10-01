import { useSearchParams } from "react-router-dom";
import CentersPage from "@/pages/CentersPage";
import DepartmentsPage from "@/pages/DepartmentsPage";

const TABS = [
  { key: "centers", label: "Centers" },
  { key: "departments", label: "Departments" },
] as const;

/** Where the company's shape lives: its sites and its departments, one tab each. */
export default function OrganizationPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "departments" ? "departments" : "centers";
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Organization</h1>
      <div role="tablist" aria-label="Organization" className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams(t.key === "centers" ? {} : { tab: t.key }, { replace: true })}
            className={`min-h-10 md:min-h-0 px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${
              tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "centers" ? <CentersPage embedded /> : <DepartmentsPage embedded />}
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCenters } from "@/hooks/useLookups";

interface TeamRow {
  user: { id: string; name: string; email: string };
  report: { id: string; status: string; tasksCompleted: number; hoursLogged: number; summary: string | null } | null;
  status: "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED" | "PENDING" | "OVERDUE";
}

const statusColor: Record<string, string> = {
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  CHANGES_REQUESTED: "bg-orange-100 text-orange-700",
  PENDING: "bg-gray-100 text-gray-600",
  OVERDUE: "bg-red-100 text-red-700",
};

export default function WeeklyTeamReportPage() {
  const [centerId, setCenterId] = useState("");
  const { data: centers } = useCenters();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["weekly-team-summary", centerId],
    queryFn: async () =>
      (await api.get<TeamRow[]>("/reports/weekly/team-summary", { params: { centerId: centerId || undefined } })).data,
  });

  const review = useMutation({
    mutationFn: ({ id, status, managerComment }: { id: string; status: string; managerComment?: string }) =>
      api.post(`/reports/weekly/${id}/review`, { status, managerComment }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weekly-team-summary"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Team Weekly Reports</h1>
        <select value={centerId} onChange={(e) => setCenterId(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
          <option value="">All centers</option>
          {centers?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        {data?.map((row) => (
          <div key={row.user.id} className="px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-800">{row.user.name}</div>
              {row.report && (
                <div className="text-xs text-gray-400">
                  {row.report.tasksCompleted} completed · {row.report.hoursLogged.toFixed(1)}h logged
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[row.status]}`}>{row.status}</span>
              {row.report && row.status === "SUBMITTED" && (
                <>
                  <button
                    onClick={() => review.mutate({ id: row.report!.id, status: "APPROVED" })}
                    className="text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      const comment = prompt("What changes are needed?") ?? "";
                      review.mutate({ id: row.report!.id, status: "CHANGES_REQUESTED", managerComment: comment });
                    }}
                    className="text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
                  >
                    Request changes
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {data?.length === 0 && <div className="px-4 py-6 text-sm text-gray-400 text-center">No team members found</div>}
      </div>
    </div>
  );
}

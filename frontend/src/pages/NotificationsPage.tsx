import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { notificationHref } from "@/lib/links";
import { api } from "@/lib/api";
import { Notification, NotificationType, Paginated } from "@/types";
import { useInstantEdit } from "@/hooks/useInstantEdit";
import QueryError, { LoadingText } from "@/components/QueryError";
import EmptyState from "@/components/EmptyState";
import { IconBell } from "@/components/icons";

const typeLabels: Record<NotificationType, string> = {
  TASK_DUE_SOON: "Task due soon",
  TASK_OVERDUE: "Task overdue",
  NO_TIME_LOGGED: "No time logged",
  WEEKLY_REPORT_DUE: "Weekly report due",
  MONTHLY_REPORT_PENDING: "Monthly report pending",
  TASK_ASSIGNED: "Task assigned",
  COMMENT_MENTION: "Comment / mention",
  MANUAL_NUDGE: "Manual nudge",
  USER_JOINED: "New teammate joined",
};

interface Preference {
  type: NotificationType;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "all"],
    queryFn: async () => (await api.get<Paginated<Notification> & { unreadCount: number }>("/notifications", { params: { pageSize: 50 } })).data,
  });

  const { data } = notificationsQuery;

  const prefsQuery = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async () => (await api.get<Preference[]>("/notifications/preferences")).data,
  });
  const prefs = prefsQuery.data;

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    meta: { errorTitle: "Couldn't mark the notification as read" },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    meta: { successMessage: "All notifications marked as read", errorTitle: "Couldn't mark notifications as read" },
  });

  const updatePref = useInstantEdit<Preference>({
    keys: [["notification-preferences"]],
    request: (pref) => api.patch("/notifications/preferences", pref),
    optimistic: (qc, pref) =>
      qc.setQueryData<Preference[]>(["notification-preferences"], (old) => old?.map((p) => (p.type === pref.type ? pref : p))),
    inverse: (qc, pref) => qc.getQueryData<Preference[]>(["notification-preferences"])?.find((p) => p.type === pref.type) ?? null,
    successMessage: (p) => `Saved preference for "${typeLabels[p.type]}"`,
    errorTitle: (p) => `Couldn't save preference for "${typeLabels[p.type]}"`,
  });

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Notifications</h1>
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="text-sm text-brand-600 hover:underline disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>
        {!data &&
          (notificationsQuery.isError ? (
            <QueryError
              title="Couldn't load notifications"
              error={notificationsQuery.error}
              onRetry={() => notificationsQuery.refetch()}
              retrying={notificationsQuery.isFetching}
            />
          ) : (
            <LoadingText />
          ))}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          {data?.items.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.isRead) markRead.mutate(n.id);
                const href = notificationHref(n);
                if (href) navigate(href);
              }}
              className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 flex gap-2.5 ${n.isRead ? "text-gray-600" : "text-gray-900 font-medium"}`}
            >
              <span
              className={n.isRead ? "w-2 h-2 shrink-0 mt-1.5" : "w-2 h-2 shrink-0 mt-1.5 rounded-full bg-brand-600"}
              role={n.isRead ? undefined : "img"}
              aria-label={n.isRead ? undefined : "Unread"}
              />
                  <span className="min-w-0 flex-1">
                <div>{n.message}</div>
                <div className="text-xs text-subtle font-normal mt-0.5">
                  {typeLabels[n.type]} · {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </div>
              </span>
            </button>
          ))}
          {data?.items.length === 0 && (
            <EmptyState
              bare
              icon={<IconBell />}
              title="You're all caught up"
              description="Assignments, comments and reminders will show up here."
            />
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Preferences</h2>
        {!prefs && prefsQuery.isError && (
          <QueryError
            title="Couldn't load preferences"
            error={prefsQuery.error}
            onRetry={() => prefsQuery.refetch()}
            retrying={prefsQuery.isFetching}
          />
        )}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          {prefs?.map((p) => (
            <div key={p.type} className="px-4 py-3">
              <div className="text-sm text-gray-700 mb-1">{typeLabels[p.type]}</div>
              <div className="flex gap-4 text-xs text-gray-500">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={p.inAppEnabled}
                    onChange={(e) => updatePref.mutate({ ...p, inAppEnabled: e.target.checked })}
                  />
                  In-app
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={p.emailEnabled}
                    onChange={(e) => updatePref.mutate({ ...p, emailEnabled: e.target.checked })}
                  />
                  Email
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { notificationHref } from "@/lib/links";
import { Notification, Paginated } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { IconBell } from "@/components/icons";
import EmptyState from "@/components/EmptyState";

/** The bell's feed (also read by the tab title for the unread count). One query, shared by key. */
export function useBellNotifications() {
  return useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Notification> & { unreadCount: number }>("/notifications", {
        params: { pageSize: 8 },
      });
      return data;
    },
    refetchInterval: 30_000,
    // Polling shouldn't toast every 30s while offline; the dropdown says so instead.
    meta: { silentRefetchErrors: true },
  });
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isError } = useBellNotifications();

  async function openNotification(n: Notification) {
    const href = notificationHref(n);
    if (href) {
      setOpen(false);
      navigate(href);
    }
    if (n.isRead) return;
    try {
      await api.patch(`/notifications/${n.id}/read`);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (err) {
      toast.error("Couldn't mark the notification as read", { description: getErrorMessage(err) });
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2 hover:bg-gray-100"
        aria-label="Notifications"
      >
        <IconBell className="w-5 h-5" />
        {!!data?.unreadCount && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
            {data.unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-popover z-20">
          <div className="p-3 border-b border-gray-100 font-medium text-sm">Notifications</div>
          <div className="max-h-80 overflow-y-auto">
            {data?.items.length ? (
              data.items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-50 text-sm hover:bg-gray-50 flex gap-2 ${
                    n.isRead ? "text-gray-600" : "text-gray-900 font-medium"
                  }`}
                >
                  <span
                    className={n.isRead ? "w-2 h-2 shrink-0 mt-1.5" : "w-2 h-2 shrink-0 mt-1.5 rounded-full bg-brand-600"}
                    role={n.isRead ? undefined : "img"}
                    aria-label={n.isRead ? undefined : "Unread"}
                  />
                  <span className="min-w-0 flex-1">
                    <div>{n.message}</div>
                    <div className="text-[11px] text-subtle font-normal mt-0.5">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </div>
                  </span>
                </button>
              ))
            ) : isError ? (
              <div className="p-4 text-sm text-red-600">Couldn't load notifications. We'll keep trying.</div>
            ) : (
              <EmptyState
                bare
                icon={<IconBell />}
                title="You're all caught up"
                description="Assignments, comments and reminders will show up here."
              />
            )}
          </div>
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block text-center text-sm text-brand-600 py-2 hover:bg-gray-50"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}

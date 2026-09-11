import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Notification, Paginated } from "@/types";
import { formatDistanceToNow } from "date-fns";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Notification> & { unreadCount: number }>("/notifications", {
        params: { pageSize: 8 },
      });
      return data;
    },
    refetchInterval: 30_000,
  });

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2 hover:bg-gray-100"
        aria-label="Notifications"
      >
        🔔
        {!!data?.unreadCount && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
            {data.unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
          <div className="p-3 border-b border-gray-100 font-medium text-sm">Notifications</div>
          <div className="max-h-80 overflow-y-auto">
            {data?.items.length ? (
              data.items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-50 text-sm hover:bg-gray-50 ${
                    n.isRead ? "text-gray-400" : "text-gray-800 font-medium"
                  }`}
                >
                  <div>{n.message}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 text-sm text-gray-400">No notifications yet</div>
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

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Center, Department, Paginated, TaskStatusOption, User } from "@/types";

// These change rarely (admin-managed config), so avoid refetching on every focus/mount.
const LOOKUP_STALE_TIME = 60_000;

export function useCenters() {
  return useQuery({
    queryKey: ["centers"],
    queryFn: async () => (await api.get<Center[]>("/centers")).data,
    staleTime: LOOKUP_STALE_TIME,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await api.get<Department[]>("/departments")).data,
    staleTime: LOOKUP_STALE_TIME,
  });
}

export function useUsersList(params: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: async () => (await api.get<Paginated<User>>("/users", { params: { pageSize: 100, ...params } })).data,
    staleTime: LOOKUP_STALE_TIME,
  });
}

export function useTaskStatuses() {
  return useQuery({
    queryKey: ["task-statuses"],
    queryFn: async () => (await api.get<TaskStatusOption[]>("/settings/task-statuses")).data,
    staleTime: LOOKUP_STALE_TIME,
  });
}

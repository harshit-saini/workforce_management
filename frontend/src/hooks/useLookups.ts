import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Center, Department, Paginated, User } from "@/types";

export function useCenters() {
  return useQuery({
    queryKey: ["centers"],
    queryFn: async () => (await api.get<Center[]>("/centers")).data,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await api.get<Department[]>("/departments")).data,
  });
}

export function useUsersList(params: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: async () => (await api.get<Paginated<User>>("/users", { params: { pageSize: 100, ...params } })).data,
  });
}

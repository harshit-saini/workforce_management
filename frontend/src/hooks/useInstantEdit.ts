import { QueryClient, QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "@/lib/toast";

interface Config<V> {
  /** The request that saves the change. */
  request: (vars: V) => Promise<unknown>;
  /** Cached data to rewrite as soon as the change is made (queries under these keys are restored if the save fails). */
  keys: QueryKey[];
  /** Writes the new value into the cache. Runs before the request, so the control never flickers back. */
  optimistic: (queryClient: QueryClient, vars: V) => void;
  /** The change that puts things back as they were, read from the cache before it's rewritten. Omit for changes that can't be undone. */
  inverse?: (queryClient: QueryClient, vars: V) => V | null;
  /** Extra queries to refetch afterwards (they aren't rewritten up front). */
  alsoRefetch?: QueryKey[];
  /** What the toast says, e.g. "Eve now reports to Carol". */
  successMessage: (vars: V, queryClient: QueryClient) => string;
  /** Title of the error toast when the save fails and the change is rolled back. */
  errorTitle: (vars: V, queryClient: QueryClient) => string;
}

type Wrapped<V> = { vars: V; undoing?: boolean };

/**
 * One way to make a control save the moment it changes, the way dragging a card on the board does:
 * show the new value right away, send the request, roll back with an error toast if it fails, and
 * offer Undo in the success toast. Used by every "change it and it's saved" dropdown, checkbox and picker.
 */
export function useInstantEdit<V>(config: Config<V>) {
  const queryClient = useQueryClient();
  // Callers pass fresh closures every render; always run the latest one.
  const ref = useRef(config);
  ref.current = config;

  const mutation = useMutation({
    mutationFn: ({ vars }: Wrapped<V>) => ref.current.request(vars),
    onMutate: async ({ vars }: Wrapped<V>) => {
      const c = ref.current;
      const snapshots = c.keys.flatMap((key) => queryClient.getQueriesData({ queryKey: key }));
      const inverse = c.inverse?.(queryClient, vars) ?? null;
      // Write first, then cancel: awaiting before the write lets a controlled input snap back for a frame.
      c.optimistic(queryClient, vars);
      await Promise.all(c.keys.map((key) => queryClient.cancelQueries({ queryKey: key })));
      return { snapshots, inverse };
    },
    onError: (_error, _wrapped, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (_data, { vars, undoing }, context) => {
      if (undoing) {
        toast.success("Change undone");
        return;
      }
      const inverse = context?.inverse;
      toast.success(ref.current.successMessage(vars, queryClient), {
        ...(inverse
          ? { action: { label: "Undo", onClick: () => mutation.mutate({ vars: inverse, undoing: true }) }, duration: 8000 }
          : {}),
      });
    },
    onSettled: () => {
      for (const key of [...ref.current.keys, ...(ref.current.alsoRefetch ?? [])]) queryClient.invalidateQueries({ queryKey: key });
    },
    meta: { errorTitle: (wrapped: Wrapped<V>) => ref.current.errorTitle(wrapped.vars, queryClient) },
  });

  return { mutate: (vars: V) => mutation.mutate({ vars }), isPending: mutation.isPending };
}

/** Rewrites the item with this id in cached data shaped like `T[]` or `{ items: T[] }`; anything else is left alone. */
export function patchById<T extends { id: string }>(data: unknown, id: string, patch: (item: T) => T): unknown {
  if (Array.isArray(data)) return data.map((item: T) => (item.id === id ? patch(item) : item));
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    const d = data as { items: T[] };
    return { ...d, items: d.items.map((item) => (item.id === id ? patch(item) : item)) };
  }
  return data;
}

/** Applies `patchById` to every cached query under `key`. */
export function patchCached<T extends { id: string }>(queryClient: QueryClient, key: QueryKey, id: string, patch: (item: T) => T) {
  queryClient.setQueriesData({ queryKey: key }, (data: unknown) => patchById(data, id, patch));
}

/** Finds an item by id in any cached list under `key`. */
export function findCached<T extends { id: string }>(queryClient: QueryClient, key: QueryKey, id: string): T | undefined {
  for (const [, data] of queryClient.getQueriesData({ queryKey: key })) {
    const list = Array.isArray(data) ? data : (data as { items?: T[] } | undefined)?.items;
    const hit = (list as T[] | undefined)?.find((item) => item.id === id);
    if (hit) return hit;
  }
  return undefined;
}

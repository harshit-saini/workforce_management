import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { getErrorMessage, getErrorStatus } from "./lib/errors";
import { toast } from "./lib/toast";
import "./index.css";

type MessageFn = (data: any, variables: any) => string;

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** Shown as a success toast once the mutation resolves. */
      successMessage?: string | MessageFn;
      /** Toast title on failure ("Couldn't change role"); the server's reason becomes the description. */
      errorTitle?: string | ((variables: any) => string);
      /** Set when the component already shows the error inline (e.g. inside a form). */
      suppressErrorToast?: boolean;
    };
    queryMeta: {
      /** Don't toast when a background refetch of already-loaded data fails (e.g. polling). */
      silentRefetchErrors?: boolean;
    };
  }
}

// 401s are handled by the API client (refresh, then redirect to /login), so they never toast.
const isAuthError = (error: unknown) => getErrorStatus(error) === 401;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  queryCache: new QueryCache({
    onError: (error, query) => {
      // First-load failures are rendered in place by <QueryError />; only a failed
      // refresh of data that's already on screen needs a toast.
      if (query.state.data === undefined || query.meta?.silentRefetchErrors || isAuthError(error)) return;
      toast.error("Couldn't refresh data", { description: getErrorMessage(error) });
    },
  }),
  mutationCache: new MutationCache({
    onSuccess: (data, variables, _context, mutation) => {
      const message = mutation.meta?.successMessage;
      if (!message) return;
      toast.success(typeof message === "function" ? message(data, variables) : message);
    },
    onError: (error, variables, _context, mutation) => {
      const meta = mutation.meta;
      if (meta?.suppressErrorToast || isAuthError(error)) return;
      const reason = getErrorMessage(error);
      const title = typeof meta?.errorTitle === "function" ? meta.errorTitle(variables) : meta?.errorTitle;
      if (title) toast.error(title, { description: reason });
      else toast.error(reason);
    },
  }),
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);

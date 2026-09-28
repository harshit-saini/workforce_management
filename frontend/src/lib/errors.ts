import { isAxiosError } from "axios";

/**
 * Turns anything thrown by an API call into a sentence a user can act on.
 * The backend's error handler always sends `{ error, message }`, so its
 * message wins; transport-level failures get a plain-language fallback.
 */
export function getErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isAxiosError(err)) {
    if (!err.response) {
      return err.code === "ECONNABORTED"
        ? "The server took too long to respond. Please try again."
        : "Can't reach the server. Check your connection and try again.";
    }
    const { status, data } = err.response;
    const message = typeof data?.message === "string" ? data.message : null;
    if (status >= 500) return "Something went wrong on our side. Please try again.";
    if (message) return message;
    if (status === 413) return "That file is too large.";
    if (status === 403) return "You don't have permission to do that.";
    if (status === 404) return "This item no longer exists. It may have been deleted.";
    if (status === 429) return "Too many attempts. Wait a moment and try again.";
    return fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function getErrorStatus(err: unknown): number | undefined {
  return isAxiosError(err) ? err.response?.status : undefined;
}

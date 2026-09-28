import { api } from "@/lib/api";

function saveBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Forces a save-to-disk download instead of navigating to the file, by fetching it
 * as a blob first. Falls back to opening the URL in a new tab if the fetch fails
 * (e.g. a cross-origin object storage bucket without CORS configured) — the user
 * can still save it manually from there.
 */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    saveBlob(await res.blob(), fileName);
  } catch {
    window.open(url, "_blank");
  }
}

/** Downloads a file from an authenticated API endpoint. Throws an Error carrying the API's message on failure. */
export async function downloadFromApi(path: string, fileName: string, params?: Record<string, unknown>): Promise<void> {
  try {
    const res = await api.get<Blob>(path, { params, responseType: "blob" });
    saveBlob(res.data, fileName);
  } catch (err: any) {
    // With responseType "blob", error bodies arrive as a Blob too.
    const data = err?.response?.data;
    let message = "Download failed";
    if (data instanceof Blob) {
      try {
        message = JSON.parse(await data.text()).message ?? message;
      } catch {
        // not JSON — keep the generic message
      }
    }
    throw new Error(message);
  }
}

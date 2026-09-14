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
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank");
  }
}

export type FileKind = "image" | "pdf" | "word" | "excel" | "csv" | "text" | "other";

export function getFileKind(mimeType: string): FileKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "application/msword" || mimeType.includes("wordprocessingml")) return "word";
  if (mimeType === "application/vnd.ms-excel" || mimeType.includes("spreadsheetml")) return "excel";
  if (mimeType === "text/csv") return "csv";
  if (mimeType === "text/plain") return "text";
  return "other";
}

export const FILE_KIND_ICON: Record<FileKind, string> = {
  image: "🖼️",
  pdf: "📕",
  word: "📄",
  excel: "📊",
  csv: "📊",
  text: "📃",
  other: "📎",
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

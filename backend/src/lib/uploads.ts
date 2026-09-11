import path from "node:path";
import fs from "node:fs/promises";
import { config } from "./config.js";

export const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

export const MAX_UPLOAD_BYTES = config.maxUploadMb * 1024 * 1024;

export async function ensureUploadDir() {
  await fs.mkdir(config.uploadDir, { recursive: true });
}

export function resolveUploadPath(fileName: string) {
  return path.join(config.uploadDir, fileName);
}

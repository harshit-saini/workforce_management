import path from "node:path";
import fs from "node:fs/promises";
import { MultipartFile } from "@fastify/multipart";
import { config } from "./config.js";
import { AppError } from "./errors.js";

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

/** Reads an upload into memory, turning the multipart size-limit error into a readable 413. */
export async function readUpload(file: MultipartFile, maxBytes: number): Promise<Buffer> {
  try {
    return await file.toBuffer();
  } catch (err) {
    if ((err as { code?: string })?.code === "FST_REQ_FILE_TOO_LARGE") {
      const limitMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
      throw new AppError(`"${file.filename}" is larger than the ${limitMb} MB limit`, 413, "FILE_TOO_LARGE");
    }
    throw err;
  }
}

/**
 * Consumes an upload we're about to reject. Replying while the body is still
 * streaming makes Node drop the connection, so the client would see a network
 * error instead of our message.
 */
export async function discardUpload(file: MultipartFile): Promise<void> {
  try {
    for await (const _chunk of file.file) {
      // drain
    }
  } catch {
    // size-limit or stream errors don't matter — we're rejecting it anyway
  }
}

export async function ensureUploadDir() {
  await fs.mkdir(config.uploadDir, { recursive: true });
}

export function resolveUploadPath(fileName: string) {
  return path.join(config.uploadDir, fileName);
}

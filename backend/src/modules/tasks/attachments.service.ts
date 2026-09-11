import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { MultipartFile } from "@fastify/multipart";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, resolveUploadPath, ensureUploadDir } from "../../lib/uploads.js";

export async function saveAttachment(
  taskId: string,
  uploadedById: string,
  file: MultipartFile,
  commentId?: string
) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw AppError.badRequest(`File type "${file.mimetype}" is not allowed`);
  }

  await ensureUploadDir();

  const storedName = `${randomUUID()}-${file.filename}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  const diskPath = resolveUploadPath(storedName);

  const buffer = await file.toBuffer();
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw AppError.badRequest(`File exceeds the maximum upload size`);
  }
  await fs.writeFile(diskPath, buffer);

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId,
      commentId,
      uploadedById,
      fileName: file.filename,
      fileUrl: `/uploads/${storedName}`,
      fileType: file.mimetype,
      fileSizeBytes: buffer.byteLength,
    },
  });

  await prisma.taskActivity.create({
    data: {
      taskId,
      userId: uploadedById,
      type: "ATTACHMENT_ADDED",
      message: `Attached file "${file.filename}"`,
    },
  });

  return attachment;
}

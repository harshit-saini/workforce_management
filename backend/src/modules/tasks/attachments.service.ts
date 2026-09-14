import { randomUUID } from "node:crypto";
import { MultipartFile } from "@fastify/multipart";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "../../lib/uploads.js";
import { storeFile } from "../../lib/storage.js";

export async function saveAttachment(
  taskId: string,
  uploadedById: string,
  file: MultipartFile,
  commentId?: string
) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw AppError.badRequest(`File type "${file.mimetype}" is not allowed`);
  }

  const storedName = `${randomUUID()}-${file.filename}`.replace(/[^a-zA-Z0-9._-]/g, "_");

  const buffer = await file.toBuffer();
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw AppError.badRequest(`File exceeds the maximum upload size`);
  }

  const { url } = await storeFile(buffer, storedName, file.mimetype);

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId,
      commentId,
      uploadedById,
      fileName: file.filename,
      fileUrl: url,
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

import { randomUUID } from "node:crypto";
import { MultipartFile } from "@fastify/multipart";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, discardUpload, readUpload } from "../../lib/uploads.js";
import { storeFile } from "../../lib/storage.js";

export async function saveAttachment(
  taskId: string,
  uploadedById: string,
  file: MultipartFile,
  commentId?: string
) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    await discardUpload(file);
    throw AppError.badRequest(
      `"${file.filename}" isn't a supported file type. Upload an image, PDF, Word, Excel, text or CSV file.`
    );
  }

  const storedName = `${randomUUID()}-${file.filename}`.replace(/[^a-zA-Z0-9._-]/g, "_");

  const buffer = await readUpload(file, MAX_UPLOAD_BYTES);
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

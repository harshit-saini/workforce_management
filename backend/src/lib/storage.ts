import fs from "node:fs/promises";
import { config } from "./config.js";
import { ensureUploadDir, resolveUploadPath } from "./uploads.js";

let s3ClientPromise: Promise<import("@aws-sdk/client-s3").S3Client> | null = null;

async function getS3Client() {
  if (!s3ClientPromise) {
    s3ClientPromise = import("@aws-sdk/client-s3").then(
      ({ S3Client }) =>
        new S3Client({
          region: config.s3.region,
          endpoint: config.s3.endpoint,
          credentials: {
            accessKeyId: config.s3.accessKeyId!,
            secretAccessKey: config.s3.secretAccessKey!,
          },
          // Required for R2/MinIO/most non-AWS S3-compatible providers.
          forcePathStyle: true,
        })
    );
  }
  return s3ClientPromise;
}

/**
 * Persists a file and returns the URL to store on the TaskAttachment record.
 * Uses S3-compatible object storage when configured (config.s3.enabled), otherwise
 * falls back to local disk under UPLOAD_DIR.
 */
export async function storeFile(buffer: Buffer, storedName: string, mimeType: string): Promise<{ url: string }> {
  if (config.s3.enabled) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: storedName,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    const base = config.s3.publicUrlBase || `${config.s3.endpoint}/${config.s3.bucket}`;
    return { url: `${base}/${storedName}` };
  }

  await ensureUploadDir();
  await fs.writeFile(resolveUploadPath(storedName), buffer);
  return { url: `/uploads/${storedName}` };
}

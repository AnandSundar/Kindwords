import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageConfig } from "@/server/config";
import { assertValidKey, type Storage } from "./index";

export function s3Storage(config: Extract<StorageConfig, { driver: "s3" }>): Storage {
  const { bucket, region, endpoint, accessKeyId, secretAccessKey } = config;
  const client = new S3Client({
    region,
    endpoint,
    // MinIO and most S3-compatible stores only serve path-style URLs.
    forcePathStyle: endpoint !== undefined,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });
  return {
    async put(key, data) {
      assertValidKey(key);
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data }));
    },
    async get(key) {
      assertValidKey(key);
      try {
        const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return Body ? Body.transformToWebStream() : null;
      } catch (error) {
        if (error instanceof NoSuchKey) return null;
        throw error;
      }
    },
    async delete(key) {
      assertValidKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

/**
 * S3-compatible storage abstraction for artifacts (videos, screenshots).
 * Reads bucket/region/credentials from central config (DB or env).
 */

import {
  type ObjectCannedACL,
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getConfig } from "@/lib/config";

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
}

const S3_ACL_VALUES = [
  "private",
  "public-read",
  "public-read-write",
  "authenticated-read",
  "aws-exec-read",
  "bucket-owner-read",
  "bucket-owner-full-control",
] as const;

async function getS3Config(): Promise<{
  bucket: string;
  region: string;
  folder?: string;
  acl?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicBaseUrl?: string;
}> {
  const c = await getConfig();
  const folderRaw = c.s3_folder || process.env.S3_FOLDER || "";
  const folder = folderRaw.trim().replace(/^\/+|\/+$/g, "") || undefined;
  const aclRaw = (c.s3_acl || process.env.S3_ACL || "").trim();
  const acl = aclRaw && S3_ACL_VALUES.includes(aclRaw as (typeof S3_ACL_VALUES)[number]) ? aclRaw : undefined;
  return {
    bucket: c.s3_bucket || process.env.S3_BUCKET || "qa-artifacts",
    region: c.s3_region || process.env.S3_REGION || "us-east-1",
    folder,
    acl,
    endpoint: c.s3_endpoint || process.env.S3_ENDPOINT || undefined,
    accessKeyId: c.s3_access_key_id || process.env.S3_ACCESS_KEY_ID || undefined,
    secretAccessKey: c.s3_secret_access_key || process.env.S3_SECRET_ACCESS_KEY || undefined,
    publicBaseUrl: c.s3_public_base_url || process.env.S3_PUBLIC_BASE_URL || undefined,
  };
}

function prefixKey(key: string, folder?: string): string {
  if (!folder) return key;
  return `${folder}/${key}`;
}

function createClient(cfg: Awaited<ReturnType<typeof getS3Config>>): S3Client {
  return new S3Client({
    region: cfg.region,
    ...(cfg.endpoint && { endpoint: cfg.endpoint, forcePathStyle: true }),
    ...(cfg.accessKeyId &&
      cfg.secretAccessKey && {
        credentials: {
          accessKeyId: cfg.accessKeyId,
          secretAccessKey: cfg.secretAccessKey,
        },
      }),
  });
}

function buildPublicUrl(key: string, cfg: Awaited<ReturnType<typeof getS3Config>>): string {
  if (cfg.publicBaseUrl) {
    return `${cfg.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
  if (cfg.endpoint) {
    return `${cfg.endpoint}/${cfg.bucket}/${key}`;
  }
  return `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key}`;
}

export async function uploadArtifact(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<UploadResult> {
  const cfg = await getS3Config();
  const client = createClient(cfg);
  const fullKey = prefixKey(key, cfg.folder);
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: fullKey,
      Body: body,
      ContentType: contentType,
      ...(cfg.acl && { ACL: cfg.acl as ObjectCannedACL }),
    })
  );
  return {
    key: fullKey,
    url: buildPublicUrl(fullKey, cfg),
    bucket: cfg.bucket,
  };
}

export async function getArtifact(key: string): Promise<Buffer | null> {
  const cfg = await getS3Config();
  const client = createClient(cfg);
  const fullKey = prefixKey(key, cfg.folder);
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: cfg.bucket, Key: fullKey })
    );
    const chunks: Uint8Array[] = [];
    if (!res.Body) return null;
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

export async function deleteArtifact(key: string): Promise<void> {
  const cfg = await getS3Config();
  const client = createClient(cfg);
  const fullKey = prefixKey(key, cfg.folder);
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: fullKey }));
}

export async function exists(key: string): Promise<boolean> {
  const cfg = await getS3Config();
  const client = createClient(cfg);
  const fullKey = prefixKey(key, cfg.folder);
  try {
    await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: fullKey }));
    return true;
  } catch {
    return false;
  }
}

/** Key prefix for execution artifacts: executions/{executionId}/video.webm | screenshot-N.png */
export function executionArtifactPrefix(executionId: string): string {
  return `executions/${executionId}/`;
}

export function executionVideoKey(executionId: string): string {
  return `${executionArtifactPrefix(executionId)}video.webm`;
}

export function executionScreenshotKey(executionId: string, index: number): string {
  return `${executionArtifactPrefix(executionId)}screenshot-${index}.png`;
}

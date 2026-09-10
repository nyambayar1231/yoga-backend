/**
 * S3 access for the presigned upload flow.
 *
 * No file bytes ever pass through this server: it signs a URL, the browser
 * PUTs straight to S3, and we ask S3 afterwards what actually landed. That
 * keeps large uploads off the API process entirely.
 */

import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AppError } from './errors.ts';

/** Long enough for a slow connection to finish, short enough to not linger. */
export const UPLOAD_URL_TTL_SECONDS = Number(process.env.S3_UPLOAD_TTL_SECONDS ?? 15 * 60);

/** Everything we write lives under one prefix, so a lifecycle rule can target it. */
const KEY_PREFIX = process.env.S3_PREFIX ?? 'uploads';

export type StorageErrorCode = 'NOT_CONFIGURED' | 'STORAGE_FAILED';

const STATUS_BY_CODE = {
  NOT_CONFIGURED: 500,
  STORAGE_FAILED: 502,
} as const;

export class StorageError extends AppError {
  constructor(code: StorageErrorCode, message: string) {
    super(STATUS_BY_CODE[code], code, message);
    this.name = 'StorageError';
  }
}

/**
 * Credentials come from the SDK's default chain: env vars locally, the
 * instance role on EC2. Nothing to configure here beyond the region.
 */
let cached: S3Client | undefined;

function client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT;

  cached ??= new S3Client({
    region: requireEnv('AWS_REGION'),
    // Set only to point at something other than AWS: MinIO, LocalStack, or
    // another S3-compatible store. Those address buckets by path, not by
    // subdomain, which is what forcePathStyle switches to.
    ...(endpoint !== undefined ? { endpoint, forcePathStyle: true } : {}),
    // The SDK otherwise adds a CRC32 of the body to every PutObject. On a
    // presigned URL there is no body to checksum yet, so it signs the one for
    // zero bytes and the browser's PUT is rejected as a mismatch. 'WHEN_REQUIRED'
    // leaves it off unless the operation genuinely needs one.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return cached;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new StorageError('NOT_CONFIGURED', `${name} is not set (load it from .env)`);
  }
  return value;
}

/**
 * `<prefix>/<uuid><ext>`. A random name, because the client's filename is
 * theirs to choose: it could collide, contain anything, or be guessable by
 * someone who should not be reading the object. The real name is kept in
 * mongo, not in the key.
 */
export function buildKey(filename: string): string {
  const ext = extname(filename).toLowerCase();
  // Anything stranger than a plain extension is dropped rather than sanitised.
  const suffix = /^\.[a-z0-9]{1,12}$/.test(ext) ? ext : '';
  return `${KEY_PREFIX}/${randomUUID()}${suffix}`;
}

export interface UploadTarget {
  url: string;
  expiresAt: Date;
}

/**
 * The signature covers the host only (`X-Amz-SignedHeaders=host`), so the
 * client's PUT is not forced to repeat this Content-Type - whatever header it
 * sends is what the object ends up with. This value is the default we ask for;
 * what S3 actually stored is read back on confirmation.
 */
export async function createUploadUrl(key: string, contentType: string): Promise<UploadTarget> {
  const command = new PutObjectCommand({
    Bucket: requireEnv('S3_BUCKET'),
    Key: key,
    ContentType: contentType,
  });

  try {
    const url = await getSignedUrl(client(), command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
    return { url, expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000) };
  } catch (error) {
    throw new StorageError('STORAGE_FAILED', `Could not sign an upload URL: ${String(error)}`);
  }
}

export interface StoredObject {
  size: number;
  contentType: string | undefined;
}

/**
 * What S3 actually holds at that key, or null if nothing does. This is how an
 * upload is confirmed: the client says it finished, and S3 is the one asked.
 */
export async function headObject(key: string): Promise<StoredObject | null> {
  try {
    const result = await client().send(
      new HeadObjectCommand({ Bucket: requireEnv('S3_BUCKET'), Key: key }),
    );
    return { size: result.ContentLength ?? 0, contentType: result.ContentType };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw new StorageError('STORAGE_FAILED', `Could not read ${key} from S3: ${String(error)}`);
  }
}

/**
 * HeadObject answers with a bare status and no error body, so the status is
 * the only tell.
 *
 * Worth knowing: S3 returns 403 rather than 404 for a missing object when the
 * caller lacks s3:ListBucket on the bucket. Grant it, or a file that simply
 * never arrived will surface as a storage failure instead of an unfinished
 * upload.
 */
function isNotFound(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  return status === 404 || (error as { name?: string })?.name === 'NotFound';
}

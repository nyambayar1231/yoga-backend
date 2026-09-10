import type { AuthUser } from '../../lib/auth.ts';
import { conflict, forbidden, notFound } from '../../lib/errors.ts';
import { buildKey, createUploadUrl, headObject } from '../../lib/s3.ts';
import { Upload, type UploadDocument } from '../../models/upload.ts';
import type { CreateUploadInput } from './upload.schema.ts';

export interface PreparedUpload {
  upload: UploadDocument;
  /** PUT the file here. Must carry the same Content-Type that was signed. */
  uploadUrl: string;
  expiresAt: Date;
}

/**
 * Hands out a URL the client uploads to directly, and records the intent.
 *
 * The row is written after the URL is signed: a signing failure should leave
 * nothing behind. It starts as 'pending' because at this point nothing has
 * been uploaded - only permission to upload has been given.
 */
export async function createUpload(
  user: AuthUser,
  { filename, contentType }: CreateUploadInput,
): Promise<PreparedUpload> {
  const key = buildKey(filename);
  const { url, expiresAt } = await createUploadUrl(key, contentType);

  const upload = await Upload.create({
    key,
    filename,
    contentType,
    status: 'pending',
    uploadedBy: user.id,
  });

  return { upload, uploadUrl: url, expiresAt };
}

export async function requireUploadById(id: string): Promise<UploadDocument> {
  const upload = await Upload.findById(id).exec();
  if (!upload) throw notFound('UPLOAD_NOT_FOUND', `No upload with id ${id}`);
  return upload;
}

/**
 * Confirms the file arrived, and only then records its size.
 *
 * S3 is the authority here, not the client: HeadObject is what proves the
 * object exists, and its ContentLength is the size we store. A client that
 * never uploaded, or that would like the row to claim a different size, gets
 * nowhere.
 *
 * Idempotent, because a client that retries a confirmation it already made
 * should not be punished for it.
 */
export async function completeUpload(id: string, user: AuthUser): Promise<UploadDocument> {
  const upload = await requireUploadById(id);

  // Anyone may upload, but only over their own pending row.
  if (user.role !== 'admin' && upload.uploadedBy.toString() !== user.id) {
    throw forbidden('You may only complete your own uploads');
  }

  if (upload.status === 'ready') return upload;

  const object = await headObject(upload.key);
  if (!object) {
    throw conflict(
      'UPLOAD_INCOMPLETE',
      'Nothing was uploaded to that key yet, or the upload did not finish',
    );
  }

  upload.size = object.size;
  // The PUT's own Content-Type is what S3 kept, and it need not match what the
  // client declared when it asked for the URL. Record what is actually there.
  if (object.contentType) upload.contentType = object.contentType;
  upload.status = 'ready';
  return upload.save();
}

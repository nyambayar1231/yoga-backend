import { z } from 'zod';

/**
 * Every file type is accepted, so an unknown type is not an error: it is just
 * the generic one. It still has to be signed into the URL, because the PUT
 * must carry the same value back.
 */
export const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** Body of POST /uploads. No size: S3 is asked for the real one afterwards. */
export const createUploadBody = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(150).default(DEFAULT_CONTENT_TYPE),
});

export type CreateUploadInput = z.infer<typeof createUploadBody>;

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/auth.ts';
import { idParam, validate } from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { completeUpload, createUpload, requireUploadById } from './upload.service.ts';
import { createUploadBody } from './upload.schema.ts';

export const uploadController = new Hono<AppEnv>();

// Any signed-in account may upload. What the file is for is not this
// endpoint's business - whatever references the upload decides that.
uploadController.use('*', requireAuth);

/**
 * POST /api/uploads
 * Body: { filename, contentType? }
 *
 * Returns the URL to PUT the file to. The request must repeat the same
 * Content-Type, or S3 rejects the signature.
 */
uploadController.post('/', validate('json', createUploadBody), async (c) => {
  const { upload, uploadUrl, expiresAt } = await createUpload(c.get('user'), c.req.valid('json'));
  c.header('Location', `/api/uploads/${upload.id}`);
  return c.json({ upload, uploadUrl, expiresAt }, 201);
});

/**
 * POST /api/uploads/:id/complete
 * Call once the PUT succeeded. Confirms against S3 and stores the real size.
 */
uploadController.post('/:id/complete', validate('param', idParam), async (c) =>
  c.json(await completeUpload(c.req.valid('param').id, c.get('user'))),
);

uploadController.get('/:id', validate('param', idParam), async (c) =>
  c.json(await requireUploadById(c.req.valid('param').id)),
);

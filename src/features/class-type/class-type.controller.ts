import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../lib/auth.ts';
import { booleanQuery, idParam, optionalText, page, pagination, validate } from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { requireRole } from '../../middleware/authorization.ts';
import { CLASS_CATEGORIES } from '../../models/class-type.ts';
import {
  countClassTypes,
  createClassType,
  listClassTypes,
  requireClassTypeById,
  setClassTypeActive,
  updateClassType,
} from './class-type.service.ts';

const createBody = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(CLASS_CATEGORIES),
  durationMinutes: z.number().int().min(5).max(600),
  capacity: z.number().int().min(1).max(500),
});

const updateBody = createBody.extend({ isActive: z.boolean() }).partial();

const listQuery = pagination.extend({
  search: optionalText,
  category: z.enum(CLASS_CATEGORIES).optional(),
  isActive: booleanQuery,
});

export const classTypeController = new Hono<AppEnv>();

// The catalogue is readable by anyone signed in; only an admin edits it.
classTypeController.use('*', requireAuth);

classTypeController.get('/', validate('query', listQuery), async (c) => {
  const { limit, skip, ...filter } = c.req.valid('query');

  const [classTypes, total] = await Promise.all([
    listClassTypes(filter, { limit, skip }),
    countClassTypes(filter),
  ]);

  return c.json(page(classTypes, total, { limit, skip }));
});

classTypeController.get('/:id', validate('param', idParam), async (c) =>
  c.json(await requireClassTypeById(c.req.valid('param').id)),
);

classTypeController.post('/', requireRole('admin'), validate('json', createBody), async (c) => {
  const classType = await createClassType(c.req.valid('json'));
  c.header('Location', `/api/class-types/${classType.id}`);
  return c.json(classType, 201);
});

classTypeController.patch(
  '/:id',
  requireRole('admin'),
  validate('param', idParam),
  validate('json', updateBody),
  async (c) => c.json(await updateClassType(c.req.valid('param').id, c.req.valid('json'))),
);

/** Retiring a class type leaves the sessions already scheduled from it alone. */
classTypeController.delete('/:id', requireRole('admin'), validate('param', idParam), async (c) =>
  c.json(await setClassTypeActive(c.req.valid('param').id, false)),
);

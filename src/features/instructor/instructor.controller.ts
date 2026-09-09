import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../lib/auth.ts';
import { booleanQuery, idParam, optionalText, page, pagination, validate } from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { requireRole } from '../../middleware/authorization.ts';
import {
  countInstructors,
  createInstructor,
  listInstructors,
  requireInstructorById,
  setInstructorActive,
  updateInstructor,
} from './instructor.service.ts';

const profileFields = {
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).optional(),
  bio: z.string().trim().max(2000).optional(),
  specialties: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
};

const createBody = z.object({
  ...profileFields,
  accountEmail: z.email().trim().toLowerCase(),
  password: z.string().nullish(),
});

const updateBody = z.object({ ...profileFields, isActive: z.boolean() }).partial();

const listQuery = pagination.extend({ search: optionalText, isActive: booleanQuery });

export const instructorController = new Hono<AppEnv>();

// Any signed-in user may look instructors up; only an admin may change them.
instructorController.use('*', requireAuth);

instructorController.get('/', validate('query', listQuery), async (c) => {
  const { limit, skip, ...filter } = c.req.valid('query');

  const [instructors, total] = await Promise.all([
    listInstructors(filter, { limit, skip }),
    countInstructors(filter),
  ]);

  return c.json(page(instructors, total, { limit, skip }));
});

instructorController.get('/:id', validate('param', idParam), async (c) =>
  c.json(await requireInstructorById(c.req.valid('param').id)),
);

/** Creates the profile and its instructor login in one call. */
instructorController.post('/', requireRole('admin'), validate('json', createBody), async (c) => {
  const { profile, user } = await createInstructor(c.req.valid('json'));
  c.header('Location', `/api/instructors/${profile.id}`);
  return c.json({ instructor: profile, user }, 201);
});

instructorController.patch(
  '/:id',
  requireRole('admin'),
  validate('param', idParam),
  validate('json', updateBody),
  async (c) => c.json(await updateInstructor(c.req.valid('param').id, c.req.valid('json'))),
);

/** Deactivation, not deletion: past sessions and assessments keep their author. */
instructorController.delete('/:id', requireRole('admin'), validate('param', idParam), async (c) =>
  c.json(await setInstructorActive(c.req.valid('param').id, false)),
);

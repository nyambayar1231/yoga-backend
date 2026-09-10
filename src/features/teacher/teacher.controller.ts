import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../lib/auth.ts';
import { booleanQuery, idParam, optionalText, page, pagination, validate } from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { requireRole } from '../../middleware/authorization.ts';
import {
  countTeachers,
  createTeacher,
  listTeachers,
  requireTeacherById,
  setTeacherActive,
  updateTeacher,
} from './teacher.service.ts';

const profileFields = {
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).optional(),
  bio: z.string().trim().max(2000).optional(),
  subjects: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
};

const createBody = z.object({
  ...profileFields,
  accountEmail: z.email().trim().toLowerCase(),
  password: z.string().nullish(),
});

const updateBody = z.object({ ...profileFields, isActive: z.boolean() }).partial();

const listQuery = pagination.extend({ search: optionalText, isActive: booleanQuery });

export const teacherController = new Hono<AppEnv>();

// Any signed-in user may look teachers up; only an admin may change them.
teacherController.use('*', requireAuth);

teacherController.get('/', validate('query', listQuery), async (c) => {
  const { limit, skip, ...filter } = c.req.valid('query');

  const [teachers, total] = await Promise.all([
    listTeachers(filter, { limit, skip }),
    countTeachers(filter),
  ]);

  return c.json(page(teachers, total, { limit, skip }));
});

teacherController.get('/:id', validate('param', idParam), async (c) =>
  c.json(await requireTeacherById(c.req.valid('param').id)),
);

/** Creates the profile and its teacher login in one call. */
teacherController.post('/', requireRole('admin'), validate('json', createBody), async (c) => {
  const { profile, user } = await createTeacher(c.req.valid('json'));
  c.header('Location', `/api/teachers/${profile.id}`);
  return c.json({ teacher: profile, user }, 201);
});

teacherController.patch(
  '/:id',
  requireRole('admin'),
  validate('param', idParam),
  validate('json', updateBody),
  async (c) => c.json(await updateTeacher(c.req.valid('param').id, c.req.valid('json'))),
);

/** Deactivation, not deletion: the record of what they taught stays intact. */
teacherController.delete('/:id', requireRole('admin'), validate('param', idParam), async (c) =>
  c.json(await setTeacherActive(c.req.valid('param').id, false)),
);

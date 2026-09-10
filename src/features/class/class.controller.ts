import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../lib/auth.ts';
import { booleanQuery, idParam, page, pagination, validate } from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { requireRole, requireStaff } from '../../middleware/authorization.ts';
import { CLASS_SECTIONS, MAX_GRADE, MIN_GRADE } from '../../models/class.ts';
import { enrollBody, schoolYear } from '../enrollment/enrollment.schema.ts';
import {
  countEnrollments,
  enrollStudent,
  listEnrollments,
} from '../enrollment/enrollment.service.ts';
import {
  countClasses,
  createClass,
  listClasses,
  requireClassById,
  setClassActive,
  updateClass,
} from './class.service.ts';

const classFields = {
  grade: z.coerce.number().int().min(MIN_GRADE).max(MAX_GRADE),
  section: z.enum(CLASS_SECTIONS),
};

const createBody = z.object(classFields);

const updateBody = z.object({ ...classFields, isActive: z.boolean() }).partial();

const listQuery = pagination.extend({
  grade: classFields.grade.optional(),
  section: classFields.section.optional(),
  isActive: booleanQuery,
});

/** The roster defaults to who is in the class now, not everyone ever. */
const rosterQuery = pagination.extend({
  schoolYear: schoolYear.optional(),
  isActive: booleanQuery.default(true),
});

export const classController = new Hono<AppEnv>();

// Every signed-in user may see what classes exist; only an admin changes them.
classController.use('*', requireAuth);

classController.get('/', validate('query', listQuery), async (c) => {
  const { limit, skip, ...filter } = c.req.valid('query');

  const [classes, total] = await Promise.all([
    listClasses(filter, { limit, skip }),
    countClasses(filter),
  ]);

  return c.json(page(classes, total, { limit, skip }));
});

classController.get('/:id', validate('param', idParam), async (c) =>
  c.json(await requireClassById(c.req.valid('param').id)),
);

classController.post('/', requireRole('admin'), validate('json', createBody), async (c) => {
  const group = await createClass(c.req.valid('json'));
  c.header('Location', `/api/classes/${group.id}`);
  return c.json(group, 201);
});

classController.patch(
  '/:id',
  requireRole('admin'),
  validate('param', idParam),
  validate('json', updateBody),
  async (c) => c.json(await updateClass(c.req.valid('param').id, c.req.valid('json'))),
);

/** Deactivation, not deletion: the enrolments that name this class stay valid. */
classController.delete('/:id', requireRole('admin'), validate('param', idParam), async (c) =>
  c.json(await setClassActive(c.req.valid('param').id, false)),
);

/** The roster: the enrolments of this class, each with its student resolved. */
classController.get(
  '/:id/students',
  requireStaff,
  validate('param', idParam),
  validate('query', rosterQuery),
  async (c) => {
    const { id } = c.req.valid('param');
    await requireClassById(id);

    const { limit, skip, ...rest } = c.req.valid('query');
    const filter = { ...rest, classId: id };

    const [enrollments, total] = await Promise.all([
      listEnrollments(filter, { limit, skip }, { populate: ['studentId'] }),
      countEnrollments(filter),
    ]);

    return c.json(page(enrollments, total, { limit, skip }));
  },
);

/** Puts a student into this class for a school year. */
classController.post(
  '/:id/students',
  requireRole('admin'),
  validate('param', idParam),
  validate('json', enrollBody),
  async (c) => {
    const enrollment = await enrollStudent({
      ...c.req.valid('json'),
      classId: c.req.valid('param').id,
    });

    c.header('Location', `/api/enrollments/${enrollment.id}`);
    return c.json(enrollment, 201);
  },
);

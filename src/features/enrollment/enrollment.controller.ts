import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../lib/auth.ts';
import { booleanQuery, idParam, objectId, page, pagination, validate } from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { assertStudentAccess, requireRole, requireStaff } from '../../middleware/authorization.ts';
import { schoolYear } from './enrollment.schema.ts';
import {
  countEnrollments,
  listEnrollments,
  requireEnrollmentById,
  setEnrollmentActive,
} from './enrollment.service.ts';

const listQuery = pagination.extend({
  studentId: objectId.optional(),
  classId: objectId.optional(),
  schoolYear: schoolYear.optional(),
  isActive: booleanQuery,
});

export const enrollmentController = new Hono<AppEnv>();

enrollmentController.use('*', requireAuth);

/** Both sides resolved: this is the view that answers "who is where". */
enrollmentController.get('/', requireStaff, validate('query', listQuery), async (c) => {
  const { limit, skip, ...filter } = c.req.valid('query');

  const [enrollments, total] = await Promise.all([
    listEnrollments(filter, { limit, skip }, { populate: ['studentId', 'classId'] }),
    countEnrollments(filter),
  ]);

  return c.json(page(enrollments, total, { limit, skip }));
});

enrollmentController.get('/:id', validate('param', idParam), async (c) => {
  const enrollment = await requireEnrollmentById(c.req.valid('param').id);
  // A student may read their own enrolment and nobody else's.
  assertStudentAccess(c.get('user'), enrollment.studentId.toString());
  return c.json(enrollment);
});

/** Reactivating runs the one-class-per-year check again, so it can 409. */
enrollmentController.patch(
  '/:id',
  requireRole('admin'),
  validate('param', idParam),
  validate('json', z.object({ isActive: z.boolean() })),
  async (c) =>
    c.json(await setEnrollmentActive(c.req.valid('param').id, c.req.valid('json').isActive)),
);

/** Unenrolling deactivates the row; it stays as the record of where they were. */
enrollmentController.delete('/:id', requireRole('admin'), validate('param', idParam), async (c) =>
  c.json(await setEnrollmentActive(c.req.valid('param').id, false)),
);

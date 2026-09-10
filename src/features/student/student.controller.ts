import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../lib/auth.ts';
import {
  booleanQuery,
  dateInput,
  idParam,
  optionalText,
  page,
  pagination,
  validate,
} from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { assertStudentAccess, requireRole, requireStaff } from '../../middleware/authorization.ts';
import { GENDERS } from '../../models/student.ts';
import { schoolYear } from '../enrollment/enrollment.schema.ts';
import { countEnrollments, listEnrollments } from '../enrollment/enrollment.service.ts';
import {
  countStudents,
  createStudent,
  listStudents,
  requireStudentById,
  setStudentActive,
  updateStudent,
} from './student.service.ts';

const profileFields = {
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: dateInput.optional(),
  gender: z.enum(GENDERS).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.email().trim().toLowerCase().optional(),
  guardian: z
    .object({
      name: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(1).max(30),
      relation: z.string().trim().max(60).optional(),
    })
    .optional(),
  enrolledAt: dateInput.optional(),
};

const createBody = z.object({
  ...profileFields,
  /** The login email. Also used as the profile email when none is given. */
  accountEmail: z.email().trim().toLowerCase(),
  password: z.string().nullish(),
});

const updateBody = z.object({ ...profileFields, isActive: z.boolean() }).partial();

const listQuery = pagination.extend({ search: optionalText, isActive: booleanQuery });

/** A student's class history: every class, newest first, unless narrowed. */
const enrollmentQuery = pagination.extend({
  schoolYear: schoolYear.optional(),
  isActive: booleanQuery,
});

export const studentController = new Hono<AppEnv>();

studentController.use('*', requireAuth);

studentController.get('/', requireStaff, validate('query', listQuery), async (c) => {
  const { limit, skip, ...filter } = c.req.valid('query');

  const [students, total] = await Promise.all([
    listStudents(filter, { limit, skip }),
    countStudents(filter),
  ]);

  return c.json(page(students, total, { limit, skip }));
});

/** Creates the profile and its student login in one call. */
studentController.post('/', requireRole('admin'), validate('json', createBody), async (c) => {
  const { profile, user } = await createStudent(c.req.valid('json'));
  c.header('Location', `/api/students/${profile.id}`);
  return c.json({ student: profile, user }, 201);
});

studentController.get('/:id', validate('param', idParam), async (c) => {
  const { id } = c.req.valid('param');
  assertStudentAccess(c.get('user'), id);
  return c.json(await requireStudentById(id));
});

studentController.patch(
  '/:id',
  requireRole('admin'),
  validate('param', idParam),
  validate('json', updateBody),
  async (c) => c.json(await updateStudent(c.req.valid('param').id, c.req.valid('json'))),
);

/** Deactivation, not deletion: their place on past rosters stays valid. */
studentController.delete('/:id', requireRole('admin'), validate('param', idParam), async (c) =>
  c.json(await setStudentActive(c.req.valid('param').id, false)),
);

/** Which classes this student is in, and has been in. */
studentController.get(
  '/:id/enrollments',
  validate('param', idParam),
  validate('query', enrollmentQuery),
  async (c) => {
    const { id } = c.req.valid('param');
    assertStudentAccess(c.get('user'), id);

    const { limit, skip, ...rest } = c.req.valid('query');
    const filter = { ...rest, studentId: id };

    const [enrollments, total] = await Promise.all([
      listEnrollments(filter, { limit, skip }, { populate: ['classId'] }),
      countEnrollments(filter),
    ]);

    return c.json(page(enrollments, total, { limit, skip }));
  },
);

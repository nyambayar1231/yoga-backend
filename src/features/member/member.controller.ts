import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../lib/auth.ts';
import {
  booleanQuery,
  dateInput,
  idParam,
  objectId,
  optionalText,
  page,
  pagination,
  validate,
} from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import {
  assertMemberAccess,
  requireRole,
  requireStaff,
} from '../../middleware/authorization.ts';
import { GENDERS } from '../../models/member.ts';
import { ATTENDANCE_STATUSES } from '../../models/attendance.ts';
import {
  countMemberAttendance,
  listMemberAttendance,
} from '../attendance/attendance.service.ts';
import { assessmentBody } from '../assessment/assessment.schema.ts';
import {
  countAssessments,
  createAssessmentFor,
  listAssessments,
} from '../assessment/assessment.service.ts';
import {
  countMembers,
  createMember,
  listMembers,
  requireMemberById,
  setMemberActive,
  updateMember,
} from './member.service.ts';

const profileFields = {
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: dateInput.optional(),
  gender: z.enum(GENDERS).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.email().trim().toLowerCase().optional(),
  emergencyContact: z
    .object({
      name: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(1).max(30),
    })
    .optional(),
  joinedAt: dateInput.optional(),
};

const createBody = z.object({
  ...profileFields,
  /** The login email. Also used as the profile email when none is given. */
  accountEmail: z.email().trim().toLowerCase(),
  password: z.string().nullish(),
});

const updateBody = z.object({ ...profileFields, isActive: z.boolean() }).partial();

const listQuery = pagination.extend({ search: optionalText, isActive: booleanQuery });

const attendanceQuery = pagination.extend({ status: z.enum(ATTENDANCE_STATUSES).optional() });

const assessmentQuery = pagination.extend({
  type: optionalText,
  from: dateInput.optional(),
  to: dateInput.optional(),
});

export const memberController = new Hono<AppEnv>();

memberController.use('*', requireAuth);

memberController.get('/', requireStaff, validate('query', listQuery), async (c) => {
  const { limit, skip, ...filter } = c.req.valid('query');

  const [members, total] = await Promise.all([
    listMembers(filter, { limit, skip }),
    countMembers(filter),
  ]);

  return c.json(page(members, total, { limit, skip }));
});

/** Creates the profile and its member login in one call. */
memberController.post('/', requireRole('admin'), validate('json', createBody), async (c) => {
  const { profile, user } = await createMember(c.req.valid('json'));
  c.header('Location', `/api/members/${profile.id}`);
  return c.json({ member: profile, user }, 201);
});

memberController.get('/:id', validate('param', idParam), async (c) => {
  const { id } = c.req.valid('param');
  assertMemberAccess(c.get('user'), id);
  return c.json(await requireMemberById(id));
});

memberController.patch(
  '/:id',
  requireRole('admin'),
  validate('param', idParam),
  validate('json', updateBody),
  async (c) => c.json(await updateMember(c.req.valid('param').id, c.req.valid('json'))),
);

/** Deactivation, not deletion: attendance and assessments stay valid. */
memberController.delete('/:id', requireRole('admin'), validate('param', idParam), async (c) =>
  c.json(await setMemberActive(c.req.valid('param').id, false)),
);

memberController.get(
  '/:id/attendance',
  validate('param', idParam),
  validate('query', attendanceQuery),
  async (c) => {
    const { id } = c.req.valid('param');
    assertMemberAccess(c.get('user'), id);

    const { limit, skip, ...filter } = c.req.valid('query');
    const [records, total] = await Promise.all([
      listMemberAttendance(id, filter, { limit, skip }),
      countMemberAttendance(id, filter),
    ]);

    return c.json(page(records, total, { limit, skip }));
  },
);

memberController.get(
  '/:id/assessments',
  validate('param', idParam),
  validate('query', assessmentQuery),
  async (c) => {
    const { id } = c.req.valid('param');
    assertMemberAccess(c.get('user'), id);

    const { limit, skip, ...filter } = c.req.valid('query');
    const query = { ...filter, memberId: id };

    const [assessments, total] = await Promise.all([
      listAssessments(query, { limit, skip }),
      countAssessments(query),
    ]);

    return c.json(page(assessments, total, { limit, skip }));
  },
);

memberController.post(
  '/:id/assessments',
  requireStaff,
  validate('param', idParam),
  validate('json', assessmentBody),
  async (c) => {
    const assessment = await createAssessmentFor(c.get('user'), {
      ...c.req.valid('json'),
      memberId: c.req.valid('param').id,
    });

    c.header('Location', `/api/assessments/${assessment.id}`);
    return c.json(assessment, 201);
  },
);

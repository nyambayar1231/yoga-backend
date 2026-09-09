import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../lib/auth.ts';
import { badRequest, notFound } from '../../lib/errors.ts';
import {
  dateInput,
  idParam,
  objectId,
  page,
  pagination,
  parseOrThrow,
  readOptionalJson,
  validate,
} from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import {
  assertSessionManager,
  ownMemberId,
  requireRole,
} from '../../middleware/authorization.ts';
import { SESSION_STATUSES } from '../../models/class-session.ts';
import {
  countSessionAttendance,
  listSessionAttendance,
  registerMember,
} from '../attendance/attendance.service.ts';
import {
  countClassSessions,
  countOccupiedSeats,
  createClassSession,
  getClassSessionDetail,
  listClassSessions,
  requireClassSessionById,
  setClassSessionStatus,
  updateClassSession,
} from './class-session.service.ts';

const createBody = z.object({
  classTypeId: objectId,
  instructorId: objectId,
  startAt: dateInput,
  /** Defaults to startAt plus the class type's duration. */
  endAt: dateInput.optional(),
  /** Defaults to the class type's capacity. */
  capacity: z.number().int().min(1).max(500).optional(),
});

const updateBody = createBody.partial();

const listQuery = pagination.extend({
  from: dateInput.optional(),
  to: dateInput.optional(),
  classTypeId: objectId.optional(),
  instructorId: objectId.optional(),
  status: z.enum(SESSION_STATUSES).optional(),
});

/** A member registering themselves sends no body; staff name the member. */
const registerBody = z.object({ memberId: objectId.optional() });

export const classSessionController = new Hono<AppEnv>();

classSessionController.use('*', requireAuth);

classSessionController.get('/', validate('query', listQuery), async (c) => {
  const { limit, skip, ...filter } = c.req.valid('query');

  const [sessions, total] = await Promise.all([
    listClassSessions(filter, { limit, skip }),
    countClassSessions(filter),
  ]);

  return c.json(page(sessions, total, { limit, skip }));
});

/** Includes the live seat count, which is what the booking screen needs. */
classSessionController.get('/:id', validate('param', idParam), async (c) => {
  const { id } = c.req.valid('param');

  const session = await getClassSessionDetail(id);
  if (!session) throw notFound('CLASS_SESSION_NOT_FOUND', `No class session with id ${id}`);

  const occupied = await countOccupiedSeats(session._id);
  return c.json({ ...session.toJSON(), occupiedSeats: occupied, freeSeats: session.capacity - occupied });
});

classSessionController.post('/', requireRole('admin'), validate('json', createBody), async (c) => {
  const session = await createClassSession(c.req.valid('json'));
  c.header('Location', `/api/class-sessions/${session.id}`);
  return c.json(session, 201);
});

classSessionController.patch(
  '/:id',
  requireRole('admin'),
  validate('param', idParam),
  validate('json', updateBody),
  async (c) => c.json(await updateClassSession(c.req.valid('param').id, c.req.valid('json'))),
);

/**
 * Cancelling keeps the session and its attendance rows: members need to see
 * that the class they booked was called off.
 */
classSessionController.post('/:id/cancel', validate('param', idParam), async (c) => {
  const session = await requireClassSessionById(c.req.valid('param').id);
  assertSessionManager(c.get('user'), session);

  return c.json(await setClassSessionStatus(session.id, 'cancelled'));
});

classSessionController.post('/:id/complete', validate('param', idParam), async (c) => {
  const session = await requireClassSessionById(c.req.valid('param').id);
  assertSessionManager(c.get('user'), session);

  return c.json(await setClassSessionStatus(session.id, 'completed'));
});

/** The roster. Only the admin and the instructor teaching it may see who booked. */
classSessionController.get(
  '/:id/attendance',
  validate('param', idParam),
  validate('query', pagination),
  async (c) => {
    const { id } = c.req.valid('param');
    assertSessionManager(c.get('user'), await requireClassSessionById(id));

    const { limit, skip } = c.req.valid('query');
    const [records, total] = await Promise.all([
      listSessionAttendance(id, { limit, skip }),
      countSessionAttendance(id),
    ]);

    return c.json(page(records, total, { limit, skip }));
  },
);

/** Members book themselves in; staff book on someone's behalf. */
classSessionController.post('/:id/attendance', validate('param', idParam), async (c) => {
  const { id } = c.req.valid('param');
  const user = c.get('user');
  let memberId: string;

  if (user.role === 'member') {
    memberId = ownMemberId(user);
  } else {
    assertSessionManager(user, await requireClassSessionById(id));

    const body = parseOrThrow(registerBody, await readOptionalJson(c));
    if (body.memberId === undefined) {
      throw badRequest('MEMBER_REQUIRED', 'memberId is required when booking for someone else');
    }
    memberId = body.memberId;
  }

  const attendance = await registerMember(id, memberId);
  c.header('Location', `/api/attendance/${attendance.id}`);
  return c.json(attendance, 201);
});

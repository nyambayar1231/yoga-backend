import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, AuthUser } from '../../lib/auth.ts';
import { forbidden } from '../../lib/errors.ts';
import { idParam, validate } from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { assertSessionManager, ownMemberId } from '../../middleware/authorization.ts';
import { ATTENDANCE_STATUSES, type AttendanceDocument } from '../../models/attendance.ts';
import { requireClassSessionById } from '../class-session/class-session.service.ts';
import { requireAttendanceById, setAttendanceStatus } from './attendance.service.ts';

const updateBody = z.object({ status: z.enum(ATTENDANCE_STATUSES) });

/**
 * Staff who run the class mark people in and out. A member may only cancel,
 * and only their own booking - nobody marks themselves as attended.
 */
async function assertMayChangeStatus(
  user: AuthUser,
  attendance: AttendanceDocument,
  status: (typeof ATTENDANCE_STATUSES)[number],
): Promise<void> {
  if (user.role === 'member') {
    if (ownMemberId(user) !== attendance.memberId.toString()) {
      throw forbidden('You may only change your own booking');
    }
    if (status !== 'cancelled') {
      throw forbidden('A member may only cancel a booking');
    }
    return;
  }

  assertSessionManager(user, await requireClassSessionById(attendance.classSessionId.toString()));
}

export const attendanceController = new Hono<AppEnv>();

attendanceController.use('*', requireAuth);

attendanceController.get('/:id', validate('param', idParam), async (c) => {
  const attendance = await requireAttendanceById(c.req.valid('param').id);
  await assertMayChangeStatus(c.get('user'), attendance, attendance.status);
  return c.json(attendance);
});

/** Check in, cancel, or mark a no-show. */
attendanceController.patch(
  '/:id',
  validate('param', idParam),
  validate('json', updateBody),
  async (c) => {
    const { status } = c.req.valid('json');

    const attendance = await requireAttendanceById(c.req.valid('param').id);
    await assertMayChangeStatus(c.get('user'), attendance, status);

    return c.json(await setAttendanceStatus(attendance.id, status));
  },
);

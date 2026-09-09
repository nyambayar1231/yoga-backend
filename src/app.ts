import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { assessmentController } from './features/assessment/assessment.controller.ts';
import { attendanceController } from './features/attendance/attendance.controller.ts';
import { authController } from './features/auth/auth.controller.ts';
import { classSessionController } from './features/class-session/class-session.controller.ts';
import { classTypeController } from './features/class-type/class-type.controller.ts';
import { instructorController } from './features/instructor/instructor.controller.ts';
import { memberController } from './features/member/member.controller.ts';
import { userController } from './features/user/user.controller.ts';
import type { AppEnv } from './lib/auth.ts';
import { AppError } from './lib/errors.ts';

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', logger());

  // Cookie auth means the browser sends credentials automatically, so a
  // third-party page could trigger authenticated requests. This checks Origin.
  app.use('*', csrf());

  app.get('/health', (c) => c.json({ status: 'healthy', uptime: process.uptime() }));

  app.route('/api/auth', authController);
  app.route('/api/users', userController);
  app.route('/api/members', memberController);
  app.route('/api/instructors', instructorController);
  app.route('/api/class-types', classTypeController);
  app.route('/api/class-sessions', classSessionController);
  app.route('/api/attendance', attendanceController);
  app.route('/api/assessments', assessmentController);

  app.notFound((c) => c.json({ code: 'NOT_FOUND', error: 'No such endpoint' }, 404));

  /**
   * One place that turns a thrown error into a response, so services can throw
   * AppError and controllers stay free of try/catch.
   */
  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(
        {
          code: error.code,
          error: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
        error.status,
      );
    }

    // Thrown by Hono itself, most often for a body it could not parse.
    if (error instanceof HTTPException) {
      return error.res ?? c.json({ code: 'BAD_REQUEST', error: error.message }, error.status);
    }

    // A schema rule we did not also express in zod, or a malformed id that
    // slipped past validation. Both are the caller's fault, not a server fault.
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return c.json({ code: 'INVALID_INPUT', error: error.message }, 400);
    }

    console.error('Unhandled error:', error);
    return c.json({ code: 'INTERNAL_ERROR', error: 'Something went wrong' }, 500);
  });

  return app;
}

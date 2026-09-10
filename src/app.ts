import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { authController } from './features/auth/auth.controller.ts';
import { classController } from './features/class/class.controller.ts';
import { enrollmentController } from './features/enrollment/enrollment.controller.ts';
import { studentController } from './features/student/student.controller.ts';
import { teacherController } from './features/teacher/teacher.controller.ts';
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
  app.route('/api/students', studentController);
  app.route('/api/teachers', teacherController);
  app.route('/api/classes', classController);
  app.route('/api/enrollments', enrollmentController);

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

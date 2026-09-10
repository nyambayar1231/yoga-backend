import type { MiddlewareHandler } from 'hono';
import type { AppEnv, AuthUser } from '../lib/auth.ts';
import { forbidden } from '../lib/errors.ts';
import type { UserRole } from '../models/user.ts';

/** Use after requireAuth: `route.use('*', requireAuth, requireRole('admin'))`. */
export function requireRole(...roles: UserRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      return c.json({ code: 'FORBIDDEN', error: 'You may not perform this action' }, 403);
    }
    await next();
  };
}

/** Admins can do everything a teacher can, so the two travel together. */
export const requireStaff = requireRole('admin', 'teacher');

/** The profile a 'student' account is attached to. */
export function ownStudentId(user: AuthUser): string {
  if (user.studentId === undefined) {
    throw forbidden('This account is not linked to a student profile');
  }
  return user.studentId;
}

/**
 * Staff may read any student; a student only ever their own record. Called with
 * the id from the URL, which is exactly the value that must not be trusted.
 */
export function assertStudentAccess(user: AuthUser, studentId: string): void {
  if (user.role === 'student' && ownStudentId(user) !== studentId) {
    throw forbidden('You may only access your own records');
  }
}

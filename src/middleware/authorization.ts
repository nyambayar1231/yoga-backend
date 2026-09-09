import type { MiddlewareHandler } from 'hono';
import type { Types } from 'mongoose';
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

/** Admins can do everything an instructor can, so the two travel together. */
export const requireStaff = requireRole('admin', 'instructor');

/** The profile a 'member' account is attached to. */
export function ownMemberId(user: AuthUser): string {
  if (user.memberId === undefined) {
    throw forbidden('This account is not linked to a member profile');
  }
  return user.memberId;
}

/**
 * Staff may read any member; a member only ever their own record. Called with
 * the id from the URL, which is exactly the value that must not be trusted.
 */
export function assertMemberAccess(user: AuthUser, memberId: string): void {
  if (user.role === 'member' && ownMemberId(user) !== memberId) {
    throw forbidden('You may only access your own records');
  }
}

/**
 * Admins manage every session; an instructor only the ones they teach. Keeps
 * the `instructor` role from meaning "may edit anyone's classes".
 */
export function assertSessionManager(
  user: AuthUser,
  session: { instructorId: Types.ObjectId },
): void {
  if (user.role === 'admin') return;
  if (user.role === 'instructor' && user.instructorId === session.instructorId.toString()) return;
  throw forbidden('Only an admin or the instructor teaching this class may do that');
}

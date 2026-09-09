import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { AUTH_COOKIE, clearAuthCookie, readToken, type AppEnv } from '../lib/auth.ts';
import type { UserRole } from '../models/user.ts';

/** Rejects the request unless a valid auth cookie is present. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, AUTH_COOKIE);
  if (!token) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const user = await readToken(token);
  if (!user) {
    clearAuthCookie(c); // stale or tampered cookie, get rid of it
    return c.json({ error: 'Session expired or invalid' }, 401);
  }

  c.set('user', user);
  await next();
};

/** Use after requireAuth: `app.use('/admin/*', requireAuth, requireRole('admin'))`. */
export function requireRole(...roles: UserRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  };
}

/** Attaches the user when a cookie is present, but never rejects. */
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, AUTH_COOKIE);
  if (token) {
    const user = await readToken(token);
    if (user) c.set('user', user);
  }
  await next();
};

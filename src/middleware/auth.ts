import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { AUTH_COOKIE, clearAuthCookie, readToken, type AppEnv } from '../lib/auth.ts';

/** Rejects the request unless a valid auth cookie is present. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, AUTH_COOKIE);
  if (!token) {
    return c.json({ code: 'UNAUTHENTICATED', error: 'Not authenticated' }, 401);
  }

  const user = await readToken(token);
  if (!user) {
    clearAuthCookie(c); // stale or tampered cookie, get rid of it
    return c.json({ code: 'UNAUTHENTICATED', error: 'Session expired or invalid' }, 401);
  }

  c.set('user', user);
  await next();
};

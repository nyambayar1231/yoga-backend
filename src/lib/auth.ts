import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import type { UserRole } from '../models/user.ts';

export const AUTH_COOKIE = 'school_cms_token';

/** Pinned explicitly on both sign and verify to rule out algorithm confusion. */
const JWT_ALG = 'HS256';

/** One week by default. Keep it short-ish: a JWT cannot be revoked before it expires. */
export const TOKEN_TTL_SECONDS = Number(process.env.JWT_TTL_SECONDS ?? 60 * 60 * 24 * 7);

/**
 * The trusted identity on the request context. The profile ids travel in the
 * token so ownership checks ("is this my data?") never need a database round
 * trip, and never trust a studentId sent by the client.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  studentId?: string;
  teacherId?: string;
}

/** Hono generics so `c.get('user')` is typed everywhere. */
export type AppEnv = {
  Variables: {
    user: AuthUser;
  };
};

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET is missing or too short (needs >= 32 chars)');
  }
  return secret;
}

export function issueToken(user: AuthUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      ...(user.studentId !== undefined ? { studentId: user.studentId } : {}),
      ...(user.teacherId !== undefined ? { teacherId: user.teacherId } : {}),
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    },
    getSecret(),
    JWT_ALG,
  );
}

/** Returns null for any invalid, tampered or expired token. */
export async function readToken(token: string): Promise<AuthUser | null> {
  try {
    const payload = await verify(token, getSecret(), JWT_ALG);
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      return null;
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role as UserRole,
      ...(typeof payload.studentId === 'string' ? { studentId: payload.studentId } : {}),
      ...(typeof payload.teacherId === 'string' ? { teacherId: payload.teacherId } : {}),
    };
  } catch {
    return null;
  }
}

export function setAuthCookie(c: Context, token: string): void {
  setCookie(c, AUTH_COOKIE, token, {
    httpOnly: true, // JS cannot read it, so XSS cannot steal it
    sameSite: 'Lax', // not sent on cross-site POSTs
    secure: process.env.NODE_ENV === 'production', // HTTPS-only outside dev
    path: '/',
    maxAge: TOKEN_TTL_SECONDS,
  });
}

export function clearAuthCookie(c: Context): void {
  deleteCookie(c, AUTH_COOKIE, { path: '/' });
}

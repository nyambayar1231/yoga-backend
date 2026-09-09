import { Hono } from 'hono';
import { z } from 'zod';
import {
  clearAuthCookie,
  issueToken,
  setAuthCookie,
  TOKEN_TTL_SECONDS,
  type AppEnv,
  type AuthUser,
} from '../../lib/auth.ts';
import { validate } from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import type { UserDocument } from '../../models/user.ts';
import { authenticateUser, changePassword, getUserById } from '../user/user.service.ts';

const loginBody = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

/** The identity that goes into the token and comes back out of /me. */
function toAuthUser(user: UserDocument): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    ...(user.memberId ? { memberId: user.memberId.toString() } : {}),
    ...(user.instructorId ? { instructorId: user.instructorId.toString() } : {}),
  };
}

export const authController = new Hono<AppEnv>();

authController.post('/login', validate('json', loginBody), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await authenticateUser(email, password);
  const identity = toAuthUser(user);
  setAuthCookie(c, await issueToken(identity));

  return c.json({ user: identity, expiresIn: TOKEN_TTL_SECONDS });
});

authController.post('/logout', (c) => {
  clearAuthCookie(c);
  return c.json({ ok: true });
});

/** Re-reads the user, so a deactivation or role change takes effect at once. */
authController.get('/me', requireAuth, async (c) => {
  const user = await getUserById(c.get('user').id);

  if (!user || !user.isActive) {
    clearAuthCookie(c);
    return c.json({ code: 'UNAUTHENTICATED', error: 'Account is no longer active' }, 401);
  }

  return c.json({ user: toAuthUser(user) });
});

authController.post(
  '/change-password',
  requireAuth,
  validate('json', changePasswordBody),
  async (c) => {
    const { currentPassword, newPassword } = c.req.valid('json');
    await changePassword(c.get('user').id, currentPassword, newPassword);
    return c.json({ ok: true });
  },
);

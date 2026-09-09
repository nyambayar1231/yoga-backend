import { Hono } from 'hono';
import {
  clearAuthCookie,
  issueToken,
  setAuthCookie,
  TOKEN_TTL_SECONDS,
  type AppEnv,
} from '../../lib/auth.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { authenticateUser, getUserById, UserError } from '../user/user.service.ts';

interface LoginBody {
  email: string;
  password: string;
}

/** Minimal body validation: enough to reject junk before touching the database. */
async function readLoginBody(body: unknown): Promise<LoginBody | null> {
  if (typeof body !== 'object' || body === null) return null;
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  if (email.trim() === '' || password === '') return null;
  return { email, password };
}

export const authController = new Hono<AppEnv>();

authController.post('/login', async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'Body must be valid JSON' }, 400);
  }

  const body = await readLoginBody(raw);
  if (!body) {
    return c.json({ error: 'email and password are required' }, 400);
  }

  try {
    const user = await authenticateUser(body.email, body.password);
    const token = await issueToken({ id: user.id, email: user.email, role: user.role });
    setAuthCookie(c, token);

    return c.json({
      user: { id: user.id, email: user.email, role: user.role },
      expiresIn: TOKEN_TTL_SECONDS,
    });
  } catch (error) {
    if (error instanceof UserError) {
      // Same message for unknown email and wrong password: do not leak which accounts exist.
      if (error.code === 'INVALID_CREDENTIALS') {
        return c.json({ error: 'Email or password is incorrect' }, 401);
      }
      if (error.code === 'USER_INACTIVE') {
        return c.json({ error: 'This account is deactivated' }, 403);
      }
    }
    throw error;
  }
});

authController.post('/logout', (c) => {
  clearAuthCookie(c);
  return c.json({ ok: true });
});

/** Who am I? Reads the cookie, then re-reads the user so role changes take effect. */
authController.get('/me', requireAuth, async (c) => {
  const claims = c.get('user');
  const user = await getUserById(claims.id);

  if (!user || !user.isActive) {
    clearAuthCookie(c);
    return c.json({ error: 'Account is no longer active' }, 401);
  }

  return c.json({ user: { id: user.id, email: user.email, role: user.role } });
});

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/auth.ts';
import { requireAuth, requireRole } from '../../middleware/auth.ts';
import { USER_ROLES, type UserDocument, type UserRole } from '../../models/user.ts';
import { countUsers, createUser, listUsers, UserError } from './user.service.ts';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Deliberately loose: the real check is whether mail to it bounces. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** passwordHash is select:false, but shape the response explicitly anyway. */
function toPublicUser(user: UserDocument) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    memberId: user.memberId?.toString() ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function parseIntParam(value: string | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
}

export const userController = new Hono<AppEnv>();

// Every route below needs a valid auth cookie.
userController.use('*', requireAuth);

/**
 * GET /api/users
 * Optional query: ?role=admin&isActive=true&limit=50&skip=0
 * `total` always reflects the full match count, so a capped page is obvious.
 */
userController.get('/', async (c) => {
  const { role, isActive, limit: rawLimit, skip: rawSkip } = c.req.query();

  if (role !== undefined && !USER_ROLES.includes(role as UserRole)) {
    return c.json({ error: `role must be one of: ${USER_ROLES.join(', ')}` }, 400);
  }
  if (isActive !== undefined && isActive !== 'true' && isActive !== 'false') {
    return c.json({ error: 'isActive must be true or false' }, 400);
  }

  const limit = parseIntParam(rawLimit, DEFAULT_LIMIT);
  const skip = parseIntParam(rawSkip, 0);
  if (limit === null || skip === null) {
    return c.json({ error: 'limit and skip must be non-negative integers' }, 400);
  }

  const filter = {
    ...(role !== undefined ? { role: role as UserRole } : {}),
    ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
  };

  const [users, total] = await Promise.all([
    listUsers({ ...filter, limit: Math.min(limit, MAX_LIMIT), skip }),
    countUsers(filter),
  ]);

  return c.json({
    users: users.map(toPublicUser),
    total,
    limit: Math.min(limit, MAX_LIMIT),
    skip,
  });
});

interface CreateUserBody {
  email: string;
  password: string;
  role?: UserRole;
  isActive?: boolean;
  memberId?: string;
}

type ParsedBody = { ok: true; value: CreateUserBody } | { ok: false; error: string };

function parseCreateUserBody(raw: unknown): ParsedBody {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Body must be a JSON object' };
  }

  const { email, password, role, isActive, memberId } = raw as Record<string, unknown>;

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return { ok: false, error: 'A valid email is required' };
  }
  if (typeof password !== 'string' || password === '') {
    return { ok: false, error: 'password is required' };
  }
  if (role !== undefined && !USER_ROLES.includes(role as UserRole)) {
    return { ok: false, error: `role must be one of: ${USER_ROLES.join(', ')}` };
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return { ok: false, error: 'isActive must be a boolean' };
  }
  if (memberId !== undefined && typeof memberId !== 'string') {
    return { ok: false, error: 'memberId must be a string' };
  }

  return {
    ok: true,
    value: {
      email: email.trim(),
      password,
      ...(role !== undefined ? { role: role as UserRole } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(memberId !== undefined ? { memberId } : {}),
    },
  };
}

/**
 * POST /api/users  (admin only)
 * Body: { email, password, role?, isActive? }
 * Password rules are enforced by the service, not here.
 */
userController.post('/', requireRole('admin'), async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'Body must be valid JSON' }, 400);
  }

  const parsed = parseCreateUserBody(raw);
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, 400);
  }

  try {
    const user = await createUser(parsed.value);
    c.header('Location', `/api/users/${user.id}`);
    return c.json({ user: toPublicUser(user) }, 201);
  } catch (error) {
    if (error instanceof UserError) {
      if (error.code === 'EMAIL_IN_USE' || error.code === 'MEMBER_ALREADY_LINKED') {
        return c.json({ error: error.message }, 409);
      }
      if (
        error.code === 'WEAK_PASSWORD' ||
        error.code === 'MEMBER_ID_REQUIRED' ||
        error.code === 'MEMBER_ID_NOT_ALLOWED' ||
        error.code === 'MEMBER_NOT_FOUND'
      ) {
        return c.json({ error: error.message, details: error.details }, 400);
      }
    }
    throw error;
  }
});

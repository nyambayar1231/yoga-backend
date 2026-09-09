import { Hono } from 'hono';
import type { AppEnv } from '../../lib/auth.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { USER_ROLES, type UserDocument, type UserRole } from '../../models/user.ts';
import { countUsers, listUsers } from './user.service.ts';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** passwordHash is select:false, but shape the response explicitly anyway. */
function toPublicUser(user: UserDocument) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
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

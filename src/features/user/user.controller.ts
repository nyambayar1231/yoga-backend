import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../lib/auth.ts';
import { booleanQuery, idParam, objectId, page, pagination, validate } from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { requireRole } from '../../middleware/authorization.ts';
import { USER_ROLES } from '../../models/user.ts';
import { userEmailBody } from '../messaging/messaging.schema.ts';
import { sendUserEmail } from '../messaging/messaging.service.ts';
import {
  countUsers,
  createUser,
  listUsers,
  requireUserById,
  setPassword,
  setUserActive,
  updateUser,
} from './user.service.ts';

const email = z.email().trim().toLowerCase();

const listQuery = pagination.extend({
  role: z.enum(USER_ROLES).optional(),
  isActive: booleanQuery,
  /** Which account holds a given profile: the only way back from a profile to its login. */
  studentId: objectId.optional(),
});

const createBody = z.object({
  email,
  /** null creates an account that cannot log in until a password is set. */
  password: z.string().nullish(),
  role: z.enum(USER_ROLES),
  isActive: z.boolean().optional(),
  studentId: objectId.optional(),
  teacherId: objectId.optional(),
});

const updateBody = z
  .object({
    email,
    role: z.enum(USER_ROLES),
    isActive: z.boolean(),
    studentId: objectId,
    teacherId: objectId,
  })
  .partial();

export const userController = new Hono<AppEnv>();

// Accounts are administrative: everything here is admin-only.
userController.use('*', requireAuth, requireRole('admin'));

userController.get('/', validate('query', listQuery), async (c) => {
  const { limit, skip, ...filter } = c.req.valid('query');

  const [users, total] = await Promise.all([
    listUsers(filter, { limit, skip }),
    countUsers(filter),
  ]);

  return c.json(page(users, total, { limit, skip }));
});

userController.post('/', validate('json', createBody), async (c) => {
  const user = await createUser(c.req.valid('json'));
  c.header('Location', `/api/users/${user.id}`);
  return c.json(user, 201);
});

userController.get('/:id', validate('param', idParam), async (c) =>
  c.json(await requireUserById(c.req.valid('param').id)),
);

userController.patch(
  '/:id',
  validate('param', idParam),
  validate('json', updateBody),
  async (c) => c.json(await updateUser(c.req.valid('param').id, c.req.valid('json'))),
);

/** Admin reset. The user's own change goes through POST /api/auth/change-password. */
userController.put(
  '/:id/password',
  validate('param', idParam),
  validate('json', z.object({ password: z.string().min(1) })),
  async (c) => {
    await setPassword(c.req.valid('param').id, c.req.valid('json').password);
    return c.json({ ok: true });
  },
);

/** Deactivation, not deletion: the account stays attached to its history. */
userController.delete('/:id', validate('param', idParam), async (c) =>
  c.json(await setUserActive(c.req.valid('param').id, false)),
);

/**
 * Emails the account holder. Admin-only like the rest of this controller, and
 * blocking: the response says whether the message actually went out.
 */
userController.post(
  '/:id/email',
  validate('param', idParam),
  validate('json', userEmailBody),
  async (c) => c.json(await sendUserEmail(c.req.valid('param').id, c.req.valid('json'))),
);

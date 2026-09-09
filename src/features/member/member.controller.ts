import { Hono } from 'hono';
import type { AppEnv } from '../../lib/auth.ts';
import { requireAuth, requireRole } from '../../middleware/auth.ts';
import type { MemberDocument } from '../../models/member.ts';
import { UserError } from '../user/user.service.ts';
import { countMembers, createMember, listMembers } from './member.service.ts';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const NAME_MAX = 100;

/** Deliberately loose: the real check is whether mail to it bounces. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublicMember(member: MemberDocument) {
  return {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    fullName: member.fullName,
    initials: member.initials,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}

function parseIntParam(value: string | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
}

interface CreateMemberBody {
  firstName: string;
  lastName: string;
  email: string;
  password?: string | null;
}

type ParsedBody = { ok: true; value: CreateMemberBody } | { ok: false; error: string };

function parseCreateMemberBody(raw: unknown): ParsedBody {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Body must be a JSON object' };
  }

  const { firstName, lastName, email, password } = raw as Record<string, unknown>;

  for (const [field, value] of [
    ['firstName', firstName],
    ['lastName', lastName],
  ] as const) {
    if (typeof value !== 'string' || value.trim() === '') {
      return { ok: false, error: `${field} is required` };
    }
    if (value.trim().length > NAME_MAX) {
      return { ok: false, error: `${field} must be at most ${NAME_MAX} characters` };
    }
  }

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return { ok: false, error: 'A valid email is required' };
  }
  // Explicit null is allowed and means "no password yet".
  if (password !== undefined && password !== null && typeof password !== 'string') {
    return { ok: false, error: 'password must be a string or null' };
  }
  if (typeof password === 'string' && password === '') {
    return { ok: false, error: 'password must not be empty - use null for no password' };
  }

  return {
    ok: true,
    value: {
      firstName: (firstName as string).trim(),
      lastName: (lastName as string).trim(),
      email: email.trim(),
      password: (password as string | null | undefined) ?? null,
    },
  };
}

export const memberController = new Hono<AppEnv>();

// Members are registered by an admin, so the whole resource is admin-only.
memberController.use('*', requireAuth, requireRole('admin'));

/**
 * POST /api/members
 * Body: { firstName, lastName, email, password? }
 * Creates the member and its 'member' account in one call. password may be
 * null, which creates an account that cannot log in until a password is set.
 */
memberController.post('/', async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'Body must be valid JSON' }, 400);
  }

  const parsed = parseCreateMemberBody(raw);
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, 400);
  }

  try {
    const { member, user } = await createMember(parsed.value);
    c.header('Location', `/api/members/${member.id}`);

    return c.json(
      {
        member: toPublicMember(member),
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          memberId: user.memberId?.toString() ?? null,
          hasPassword: user.passwordHash !== undefined,
        },
      },
      201,
    );
  } catch (error) {
    if (error instanceof UserError) {
      if (error.code === 'EMAIL_IN_USE') {
        return c.json({ error: error.message }, 409);
      }
      if (error.code === 'WEAK_PASSWORD') {
        return c.json({ error: error.message, details: error.details }, 400);
      }
    }
    throw error;
  }
});

/**
 * GET /api/members
 * Optional query: ?search=oyu&limit=50&skip=0
 * Use this to find the id to pass as `memberId` when creating a member login.
 */
memberController.get('/', async (c) => {
  const { search, limit: rawLimit, skip: rawSkip } = c.req.query();

  const limit = parseIntParam(rawLimit, DEFAULT_LIMIT);
  const skip = parseIntParam(rawSkip, 0);
  if (limit === null || skip === null) {
    return c.json({ error: 'limit and skip must be non-negative integers' }, 400);
  }

  const capped = Math.min(limit, MAX_LIMIT);
  const options = { ...(search !== undefined ? { search } : {}), limit: capped, skip };

  const [members, total] = await Promise.all([
    listMembers(options),
    countMembers(search !== undefined ? { search } : {}),
  ]);

  return c.json({ members: members.map(toPublicMember), total, limit: capped, skip });
});

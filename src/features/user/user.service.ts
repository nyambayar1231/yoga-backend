import { isValidObjectId } from 'mongoose';
import { badRequest, conflict, notFound, unauthorized, AppError } from '../../lib/errors.ts';
import {
  checkPasswordStrength,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../../lib/password.ts';
import type { Pagination } from '../../lib/http.ts';
import { Instructor } from '../../models/instructor.ts';
import { Member } from '../../models/member.ts';
import { User, type IUser, type UserDocument, type UserRole } from '../../models/user.ts';

const DUPLICATE_KEY = 11000;

export interface ProfileLink {
  memberId?: string;
  instructorId?: string;
}

export interface CreateUserInput extends ProfileLink {
  email: string;
  /** Null or omitted creates an account that cannot log in until a password is set. */
  password?: string | null;
  role: UserRole;
  isActive?: boolean;
}

export interface ListUsersFilter {
  role?: UserRole;
  isActive?: boolean;
}

/** The profile field `createWithAccount` fills in for each role it supports. */
const PROFILE_FIELD = {
  member: 'memberId',
  instructor: 'instructorId',
} as const satisfies Record<'member' | 'instructor', keyof ProfileLink>;

function assertStrongPassword(password: string): void {
  const { valid, errors } = checkPasswordStrength(password);
  if (!valid) {
    throw badRequest('WEAK_PASSWORD', `Password ${errors.join(', ')}`, errors);
  }
}

async function assertProfileExists(
  field: keyof ProfileLink,
  id: string | undefined,
): Promise<void> {
  if (id === undefined) return;

  const exists =
    isValidObjectId(id) &&
    (field === 'memberId'
      ? await Member.exists({ _id: id })
      : await Instructor.exists({ _id: id }));

  if (!exists) {
    throw notFound('PROFILE_NOT_FOUND', `No profile with ${field} ${id}`);
  }
}

/**
 * A login points at the profile its role implies, and never at one it has no
 * use for. The one asymmetry is deliberate: an admin may also hold an
 * instructor profile, because an admin is allowed to do instructor-level work
 * and teaching a session or authoring an assessment has to name an instructor.
 */
async function assertProfileLink(role: UserRole, link: ProfileLink): Promise<void> {
  if (link.memberId !== undefined && role !== 'member') {
    throw badRequest('PROFILE_LINK_INVALID', `memberId is not valid for role '${role}'`);
  }
  if (link.instructorId !== undefined && role === 'member') {
    throw badRequest('PROFILE_LINK_INVALID', "instructorId is not valid for role 'member'");
  }

  if (role === 'member' && link.memberId === undefined) {
    throw badRequest('PROFILE_REQUIRED', "Role 'member' requires memberId - create the profile first");
  }
  if (role === 'instructor' && link.instructorId === undefined) {
    throw badRequest(
      'PROFILE_REQUIRED',
      "Role 'instructor' requires instructorId - create the profile first",
    );
  }

  await assertProfileExists('memberId', link.memberId);
  await assertProfileExists('instructorId', link.instructorId);
}

/**
 * Pre-flight for callers that create a profile document first: checks the
 * password and that the email is free, so they can bail out before there is
 * anything to roll back.
 */
export async function assertAccountCreatable(account: {
  email: string;
  password?: string | null;
}): Promise<void> {
  if (account.password != null) assertStrongPassword(account.password);

  if (await User.exists({ email: account.email.toLowerCase().trim() })) {
    throw conflict('EMAIL_IN_USE', `Email ${account.email} is already registered`);
  }
}

export async function createUser(input: CreateUserInput): Promise<UserDocument> {
  if (input.password != null) assertStrongPassword(input.password);
  await assertProfileLink(input.role, input);

  try {
    return await User.create({
      email: input.email,
      role: input.role,
      ...(input.password != null ? { passwordHash: await hashPassword(input.password) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.memberId !== undefined ? { memberId: input.memberId } : {}),
      ...(input.instructorId !== undefined ? { instructorId: input.instructorId } : {}),
    });
  } catch (error) {
    throw translateDuplicateKey(error, input.email) ?? error;
  }
}

/**
 * Creates a profile and the login that points at it.
 *
 * Two collections and no transaction: a standalone mongod does not support them
 * and this has to run in local development too. So everything that can be
 * checked is checked up front, and a failed account write deletes the profile
 * again. A profile is never left behind without its login.
 */
export async function createWithAccount<T extends { id: string; deleteOne: () => unknown }>(
  account: { email: string; password?: string | null },
  role: keyof typeof PROFILE_FIELD,
  createProfile: () => Promise<T>,
): Promise<{ profile: T; user: UserDocument }> {
  await assertAccountCreatable(account);

  const profile = await createProfile();
  try {
    const user = await createUser({
      ...account,
      role,
      [PROFILE_FIELD[role]]: profile.id,
    });
    return { profile, user };
  } catch (error) {
    // Lost a race on the email, or the account write failed: undo the profile.
    try {
      await profile.deleteOne();
    } catch (rollbackError) {
      console.error(`Failed to roll back ${role} ${profile.id}:`, rollbackError);
    }
    throw error;
  }
}

export function getUserById(id: string): Promise<UserDocument | null> {
  return User.findById(id).exec();
}

export async function requireUserById(id: string): Promise<UserDocument> {
  const user = await getUserById(id);
  if (!user) throw notFound('USER_NOT_FOUND', `No user with id ${id}`);
  return user;
}

export function listUsers(
  filter: ListUsersFilter,
  { limit, skip }: Pagination,
): Promise<UserDocument[]> {
  return User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
}

export function countUsers(filter: ListUsersFilter): Promise<number> {
  return User.countDocuments(filter).exec();
}

export type UpdateUserInput = Partial<Pick<IUser, 'email' | 'role' | 'isActive'>> & ProfileLink;

export async function updateUser(id: string, input: UpdateUserInput): Promise<UserDocument> {
  const user = await requireUserById(id);
  const touchesLinks =
    input.role !== undefined || input.memberId !== undefined || input.instructorId !== undefined;

  user.set(input);

  // Drop the link the new role no longer has any use for. An admin keeps the
  // instructor profile they teach under, so promoting an instructor - or
  // demoting an admin who teaches - leaves their classes and assessments
  // pointing at the same person. Only a member has no use for one.
  if (user.role !== 'member') user.set('memberId', undefined);
  if (user.role === 'member') user.set('instructorId', undefined);

  // Validate what the document will actually look like, rather than trying to
  // predict it: whatever survived the clearing above is the real link.
  if (touchesLinks) {
    await assertProfileLink(user.role, {
      memberId: user.memberId?.toString(),
      instructorId: user.instructorId?.toString(),
    });
  }

  try {
    return await user.save();
  } catch (error) {
    throw translateDuplicateKey(error, input.email ?? user.email) ?? error;
  }
}

/** Replaces a password after verifying the current one. */
export async function changePassword(
  id: string,
  currentPassword: string,
  newPassword: string,
): Promise<UserDocument> {
  const user = await User.findById(id).select('+passwordHash').exec();
  if (!user) throw notFound('USER_NOT_FOUND', `No user with id ${id}`);

  if (user.passwordHash === undefined) {
    throw badRequest('PASSWORD_NOT_SET', 'This account has no password yet - ask an admin to set one');
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw badRequest('INVALID_CREDENTIALS', 'Current password is incorrect');
  }

  assertStrongPassword(newPassword);
  user.passwordHash = await hashPassword(newPassword);
  return user.save();
}

/** Sets a password without knowing the old one (admin reset, seeding). */
export async function setPassword(id: string, newPassword: string): Promise<UserDocument> {
  assertStrongPassword(newPassword);

  const user = await requireUserById(id);
  user.passwordHash = await hashPassword(newPassword);
  return user.save();
}

/**
 * Verifies an email/password pair. Transparently upgrades the stored hash when
 * it was created with fewer bcrypt rounds than we use now.
 */
export async function authenticateUser(email: string, password: string): Promise<UserDocument> {
  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select('+passwordHash')
    .exec();

  // Same error for an unknown email, a wrong password and an account with no
  // password set: none of them reveal which accounts exist.
  if (!user || user.passwordHash === undefined) {
    throw unauthorized('Email or password is incorrect');
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized('Email or password is incorrect');
  }
  if (!user.isActive) {
    throw new AppError(403, 'USER_INACTIVE', 'This account is deactivated');
  }

  if (needsRehash(user.passwordHash)) {
    user.passwordHash = await hashPassword(password);
    await user.save();
  }

  return user;
}

export async function setUserActive(id: string, isActive: boolean): Promise<UserDocument> {
  const user = await requireUserById(id);
  user.isActive = isActive;
  return user.save();
}

/** Two unique indexes exist (email, and one per profile), so read which one broke. */
function translateDuplicateKey(error: unknown, email: string): AppError | null {
  if (
    typeof error !== 'object' ||
    error === null ||
    (error as { code?: number }).code !== DUPLICATE_KEY
  ) {
    return null;
  }

  const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  if ('memberId' in keyPattern || 'instructorId' in keyPattern) {
    return conflict('PROFILE_ALREADY_LINKED', 'That profile already has a login');
  }
  return conflict('EMAIL_IN_USE', `Email ${email} is already registered`);
}

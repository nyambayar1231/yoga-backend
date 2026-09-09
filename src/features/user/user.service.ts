import { User, type IUser, type UserDocument, type UserRole } from '../../models/user.ts';
import {
  checkPasswordStrength,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../../lib/password.ts';

export type UserErrorCode =
  | 'EMAIL_IN_USE'
  | 'WEAK_PASSWORD'
  | 'USER_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'USER_INACTIVE';

export class UserError extends Error {
  readonly code: UserErrorCode;
  readonly details: string[];

  constructor(code: UserErrorCode, message: string, details: string[] = []) {
    super(message);
    this.name = 'UserError';
    this.code = code;
    this.details = details;
  }
}

export interface CreateUserInput {
  email: string;
  password: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface ListUsersOptions {
  role?: UserRole;
  isActive?: boolean;
  limit?: number;
  skip?: number;
}

const DUPLICATE_KEY = 11000;

function assertStrongPassword(password: string): void {
  const { valid, errors } = checkPasswordStrength(password);
  if (!valid) {
    throw new UserError('WEAK_PASSWORD', `Password ${errors.join(', ')}`, errors);
  }
}

export async function createUser(input: CreateUserInput): Promise<UserDocument> {
  assertStrongPassword(input.password);

  const passwordHash = await hashPassword(input.password);

  try {
    return await User.create({
      email: input.email,
      passwordHash,
      // role / isActive fall back to the schema defaults when omitted
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new UserError('EMAIL_IN_USE', `Email ${input.email} is already registered`);
    }
    throw error;
  }
}

export function getUserById(id: string): Promise<UserDocument | null> {
  return User.findById(id).exec();
}

export function getUserByEmail(email: string): Promise<UserDocument | null> {
  return User.findByEmail(email);
}

export async function requireUserById(id: string): Promise<UserDocument> {
  const user = await getUserById(id);
  if (!user) {
    throw new UserError('USER_NOT_FOUND', `No user with id ${id}`);
  }
  return user;
}

export function listUsers(options: ListUsersOptions = {}): Promise<UserDocument[]> {
  const { role, isActive, limit = 50, skip = 0 } = options;

  const filter: Record<string, unknown> = {};
  if (role !== undefined) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive;

  return User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
}

export function countUsers(options: Pick<ListUsersOptions, 'role' | 'isActive'> = {}): Promise<number> {
  const filter: Record<string, unknown> = {};
  if (options.role !== undefined) filter.role = options.role;
  if (options.isActive !== undefined) filter.isActive = options.isActive;

  return User.countDocuments(filter).exec();
}

export type UpdateUserInput = Partial<Pick<IUser, 'email' | 'role' | 'isActive'>>;

export async function updateUser(id: string, input: UpdateUserInput): Promise<UserDocument> {
  const user = await requireUserById(id);
  user.set(input);

  try {
    return await user.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new UserError('EMAIL_IN_USE', `Email ${input.email} is already registered`);
    }
    throw error;
  }
}

/** Replaces a password after verifying the current one. */
export async function changePassword(
  id: string,
  currentPassword: string,
  newPassword: string,
): Promise<UserDocument> {
  const user = await User.findById(id).select('+passwordHash').exec();
  if (!user) {
    throw new UserError('USER_NOT_FOUND', `No user with id ${id}`);
  }

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new UserError('INVALID_CREDENTIALS', 'Current password is incorrect');
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
 * Verifies an email/password pair. Transparently upgrades the stored hash
 * when it was created with fewer bcrypt rounds than we use now.
 */
export async function authenticateUser(email: string, password: string): Promise<UserDocument> {
  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select('+passwordHash')
    .exec();

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new UserError('INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  if (!user.isActive) {
    throw new UserError('USER_INACTIVE', 'This account is deactivated');
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

export async function deleteUser(id: string): Promise<void> {
  const { deletedCount } = await User.deleteOne({ _id: id }).exec();
  if (deletedCount === 0) {
    throw new UserError('USER_NOT_FOUND', `No user with id ${id}`);
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === DUPLICATE_KEY
  );
}

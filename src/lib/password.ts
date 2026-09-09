import bcrypt from 'bcrypt';

/** bcrypt only considers the first 72 bytes of a password. */
export const PASSWORD_MAX_LENGTH = 72;
export const PASSWORD_MIN_LENGTH = 8;
export const BCRYPT_ROUNDS = 12;

/**
 * Standard strength pattern: at least 8 characters, with at least one
 * lowercase letter, one uppercase letter and one special character.
 */
export const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9])[\S\s]{8,72}$/;

export interface PasswordCheck {
  valid: boolean;
  errors: string[];
}

/** Collects every rule a password fails, so callers can report them all at once. */
export function checkPasswordStrength(password: string): PasswordCheck {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`must be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_LENGTH) {
    errors.push(`must be at most ${PASSWORD_MAX_LENGTH} bytes long`);
  }
  if (!/[a-z]/.test(password)) {
    errors.push('must contain a lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('must contain an uppercase letter');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('must contain a special character');
  }

  return { valid: errors.length === 0, errors };
}

export function isStrongPassword(password: string): boolean {
  return checkPasswordStrength(password).valid;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** True when a stored hash was made with fewer rounds than we now use. */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) < BCRYPT_ROUNDS;
  } catch {
    return true;
  }
}

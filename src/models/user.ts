import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { schemaOptions } from './base.ts';

export const USER_ROLES = ['admin', 'instructor', 'member'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Authentication and authorization only. Profile data lives in `members` and
 * `instructors`; this document just says who may log in and as what.
 */
export interface IUser {
  email: string;
  /** Absent until a password is set: accounts can be created without one. */
  passwordHash?: string;
  role: UserRole;
  isActive: boolean;
  /** Set only for role 'member'. */
  memberId?: Types.ObjectId;
  /** Set only for role 'instructor'. */
  instructorId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: USER_ROLES, required: true },
    isActive: { type: Boolean, default: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
    instructorId: { type: Schema.Types.ObjectId, ref: 'Instructor' },
  },
  schemaOptions(['passwordHash']),
);

// At most one login per profile. Sparse, so the many users without one of these
// references do not collide with each other on null.
userSchema.index({ memberId: 1 }, { unique: true, sparse: true });
userSchema.index({ instructorId: 1 }, { unique: true, sparse: true });

export const User = model<IUser>('User', userSchema);

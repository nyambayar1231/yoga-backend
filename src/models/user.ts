import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { schemaOptions } from './base.ts';

export const USER_ROLES = ['admin', 'teacher', 'student'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Authentication and authorization only. Profile data lives in `students` and
 * `teachers`; this document just says who may log in and as what.
 */
export interface IUser {
  email: string;
  /** Absent until a password is set: accounts can be created without one. */
  passwordHash?: string;
  role: UserRole;
  isActive: boolean;
  /** Set only for role 'student'. */
  studentId?: Types.ObjectId;
  /** Set only for role 'teacher'. */
  teacherId?: Types.ObjectId;
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
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher' },
  },
  schemaOptions(['passwordHash']),
);

// At most one login per profile. Sparse, so the many users without one of these
// references do not collide with each other on null.
userSchema.index({ studentId: 1 }, { unique: true, sparse: true });
userSchema.index({ teacherId: 1 }, { unique: true, sparse: true });

export const User = model<IUser>('User', userSchema);

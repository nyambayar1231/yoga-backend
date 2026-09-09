import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export const USER_ROLES = ['admin', 'instructor'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Raw shape of a user document. */
export interface IUser {
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface IUserVirtuals {}

interface IUserMethods {
  isAdmin(): boolean;
  canManageClasses(): boolean;
}

export interface IUserModel extends Model<IUser, {}, IUserMethods, IUserVirtuals> {
  findByEmail(email: string): Promise<UserDocument | null>;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods & IUserVirtuals>;

const userSchema = new Schema<IUser, IUserModel, IUserMethods, {}, IUserVirtuals>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: "instructor" },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

/**
 * Schema class loaded onto `userSchema` via `loadClass`.
 * Getters become virtuals, methods become instance methods, statics become model statics.
 */
export class UserSchemaClass {
  // Declared for `this` typing inside the class; erased at runtime.
  declare role: UserRole;
  declare isActive: boolean;

  isAdmin(): boolean {
    return this.role === 'admin';
  }

  canManageClasses(): boolean {
    return this.isActive && (this.role === 'admin' || this.role === 'instructor');
  }

  static findByEmail(this: IUserModel, email: string): Promise<UserDocument | null> {
    return this.findOne({ email: email.toLowerCase().trim() }).exec();
  }
}

userSchema.loadClass(UserSchemaClass);

export const User = model<IUser, IUserModel>('User', userSchema);
export { userSchema };

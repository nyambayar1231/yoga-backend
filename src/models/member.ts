import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

/** Raw shape of a member document. */
export interface IMember {
  firstName: string;
  lastName: string;
  createdAt: Date;
  updatedAt: Date;
}

interface IMemberVirtuals {
  fullName: string;
  initials: string;
}

export interface IMemberModel extends Model<IMember, {}, {}, IMemberVirtuals> {
  findByFullName(firstName: string, lastName: string): Promise<MemberDocument | null>;
  searchByName(term: string): Promise<MemberDocument[]>;
}

export type MemberDocument = HydratedDocument<IMember, IMemberVirtuals>;

const memberSchema = new Schema<IMember, IMemberModel, {}, {}, IMemberVirtuals>(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

/** Keeps a user-supplied term from being read as a regular expression. */
function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Schema class loaded onto `memberSchema` via `loadClass`.
 * Getters become virtuals, methods become instance methods, statics become model statics.
 */
export class MemberSchemaClass {
  // Declared for `this` typing inside the class; erased at runtime.
  declare firstName: string;
  declare lastName: string;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get initials(): string {
    return `${this.firstName[0] ?? ''}${this.lastName[0] ?? ''}`.toUpperCase();
  }

  static findByFullName(
    this: IMemberModel,
    firstName: string,
    lastName: string,
  ): Promise<MemberDocument | null> {
    return this.findOne({
      firstName: new RegExp(`^${escapeRegex(firstName.trim())}$`, 'i'),
      lastName: new RegExp(`^${escapeRegex(lastName.trim())}$`, 'i'),
    }).exec();
  }

  /** Case-insensitive partial match on either name. */
  static searchByName(this: IMemberModel, term: string): Promise<MemberDocument[]> {
    const pattern = new RegExp(escapeRegex(term.trim()), 'i');
    return this.find({ $or: [{ firstName: pattern }, { lastName: pattern }] })
      .sort({ lastName: 1, firstName: 1 })
      .exec();
  }
}

memberSchema.loadClass(MemberSchemaClass);

export const Member = model<IMember, IMemberModel>('Member', memberSchema);
export { memberSchema };

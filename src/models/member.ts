import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { schemaOptions } from './base.ts';

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export interface IEmergencyContact {
  name: string;
  phone: string;
}

/** The member's profile. Attendance and assessments live in their own collections. */
export interface IMember {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  gender?: Gender;
  phone?: string;
  email?: string;
  emergencyContact?: IEmergencyContact;
  joinedAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface IMemberVirtuals {
  fullName: string;
}

type MemberModel = Model<IMember, {}, {}, IMemberVirtuals>;

export type MemberDocument = HydratedDocument<IMember, IMemberVirtuals>;

const memberSchema = new Schema<IMember, MemberModel, {}, {}, IMemberVirtuals>(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: GENDERS },
    phone: { type: String, trim: true, maxlength: 30 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    emergencyContact: {
      type: new Schema<IEmergencyContact>(
        {
          name: { type: String, required: true, trim: true, maxlength: 100 },
          phone: { type: String, required: true, trim: true, maxlength: 30 },
        },
        { _id: false },
      ),
    },
    joinedAt: { type: Date, default: () => new Date() },
    isActive: { type: Boolean, default: true },
  },
  schemaOptions(),
);

memberSchema.virtual('fullName').get(function (this: IMember) {
  return `${this.firstName} ${this.lastName}`;
});

memberSchema.index({ lastName: 1, firstName: 1 });
// Not unique: the studio does not guarantee one email per member.
memberSchema.index({ email: 1 }, { sparse: true });

export const Member = model<IMember, MemberModel>('Member', memberSchema);

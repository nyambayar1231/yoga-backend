import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { schemaOptions } from './base.ts';

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export interface IGuardian {
  name: string;
  phone: string;
  /** 'mother', 'father', 'grandparent', ... */
  relation?: string;
}

/**
 * The student's profile. Which class they are in is not stored here: that is a
 * row in `enrollments`, so a student keeps a record of every class they have
 * been through rather than only the current one.
 */
export interface IStudent {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  gender?: Gender;
  phone?: string;
  email?: string;
  guardian?: IGuardian;
  enrolledAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface IStudentVirtuals {
  fullName: string;
}

type StudentModel = Model<IStudent, {}, {}, IStudentVirtuals>;

export type StudentDocument = HydratedDocument<IStudent, IStudentVirtuals>;

const studentSchema = new Schema<IStudent, StudentModel, {}, {}, IStudentVirtuals>(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: GENDERS },
    phone: { type: String, trim: true, maxlength: 30 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    guardian: {
      type: new Schema<IGuardian>(
        {
          name: { type: String, required: true, trim: true, maxlength: 100 },
          phone: { type: String, required: true, trim: true, maxlength: 30 },
          relation: { type: String, trim: true, maxlength: 60 },
        },
        { _id: false },
      ),
    },
    enrolledAt: { type: Date, default: () => new Date() },
    isActive: { type: Boolean, default: true },
  },
  schemaOptions(),
);

studentSchema.virtual('fullName').get(function (this: IStudent) {
  return `${this.firstName} ${this.lastName}`;
});

studentSchema.index({ lastName: 1, firstName: 1 });
// Not unique: the school does not guarantee one email per student.
studentSchema.index({ email: 1 }, { sparse: true });

export const Student = model<IStudent, StudentModel>('Student', studentSchema);

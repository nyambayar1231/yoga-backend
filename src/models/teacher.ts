import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { schemaOptions } from './base.ts';

/** The teacher's profile. Their login lives in `users.teacherId`. */
export interface ITeacher {
  firstName: string;
  lastName: string;
  phone?: string;
  bio?: string;
  /** What they teach: 'mathematics', 'physics', ... */
  subjects: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ITeacherVirtuals {
  fullName: string;
}

type TeacherModel = Model<ITeacher, {}, {}, ITeacherVirtuals>;

export type TeacherDocument = HydratedDocument<ITeacher, ITeacherVirtuals>;

const teacherSchema = new Schema<ITeacher, TeacherModel, {}, {}, ITeacherVirtuals>(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 30 },
    bio: { type: String, trim: true, maxlength: 2000 },
    subjects: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  schemaOptions(),
);

teacherSchema.virtual('fullName').get(function (this: ITeacher) {
  return `${this.firstName} ${this.lastName}`;
});

teacherSchema.index({ lastName: 1, firstName: 1 });

export const Teacher = model<ITeacher, TeacherModel>('Teacher', teacherSchema);

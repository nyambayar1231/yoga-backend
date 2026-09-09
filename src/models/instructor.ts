import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { schemaOptions } from './base.ts';

/** The instructor's profile. Their login lives in `users.instructorId`. */
export interface IInstructor {
  firstName: string;
  lastName: string;
  phone?: string;
  bio?: string;
  specialties: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface IInstructorVirtuals {
  fullName: string;
}

type InstructorModel = Model<IInstructor, {}, {}, IInstructorVirtuals>;

export type InstructorDocument = HydratedDocument<IInstructor, IInstructorVirtuals>;

const instructorSchema = new Schema<IInstructor, InstructorModel, {}, {}, IInstructorVirtuals>(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 30 },
    bio: { type: String, trim: true, maxlength: 2000 },
    specialties: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  schemaOptions(),
);

instructorSchema.virtual('fullName').get(function (this: IInstructor) {
  return `${this.firstName} ${this.lastName}`;
});

instructorSchema.index({ lastName: 1, firstName: 1 });

export const Instructor = model<IInstructor, InstructorModel>('Instructor', instructorSchema);

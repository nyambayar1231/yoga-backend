import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { schemaOptions } from './base.ts';

/** A school year, written as the two calendar years it spans: '2026-2027'. */
export const SCHOOL_YEAR_PATTERN = /^\d{4}-\d{4}$/;

/**
 * The student <-> class join. Its own collection rather than a `classId` on the
 * student, so moving up a grade adds a row instead of overwriting one: a
 * student keeps the record of every class they have been in.
 */
export interface IEnrollment {
  studentId: Types.ObjectId;
  classId: Types.ObjectId;
  schoolYear: string;
  enrolledAt: Date;
  /** False once the student leaves the class. The row stays as history. */
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type EnrollmentDocument = HydratedDocument<IEnrollment>;

const enrollmentSchema = new Schema<IEnrollment>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    schoolYear: { type: String, required: true, trim: true, match: SCHOOL_YEAR_PATTERN },
    enrolledAt: { type: Date, default: () => new Date() },
    isActive: { type: Boolean, default: true },
  },
  schemaOptions(),
);

// One row per student per class, whatever its state. Putting a student back
// into a class they left reuses the row instead of stacking duplicates.
enrollmentSchema.index({ studentId: 1, classId: 1 }, { unique: true });
// The roster: who is in this class this year.
enrollmentSchema.index({ classId: 1, schoolYear: 1 });
// A student's own history, newest first.
enrollmentSchema.index({ studentId: 1, enrolledAt: -1 });

export const Enrollment = model<IEnrollment>('Enrollment', enrollmentSchema);

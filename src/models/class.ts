import { Schema, model, type HydratedDocument } from 'mongoose';
import { schemaOptions } from './base.ts';

/** Grades the school runs. */
export const MIN_GRADE = 1;
export const MAX_GRADE = 5;

export const CLASS_SECTIONS = ['a', 'b'] as const;
export type ClassSection = (typeof CLASS_SECTIONS)[number];

/** The full roll: 1a, 1b, 2a, 2b, 3a, 3b, 4a, 4b, 5a, 5b. */
export const ALL_CLASSES: readonly { grade: number; section: ClassSection }[] = Array.from(
  { length: MAX_GRADE - MIN_GRADE + 1 },
  (_unused, index) => MIN_GRADE + index,
).flatMap((grade) => CLASS_SECTIONS.map((section) => ({ grade, section })));

export function className(grade: number, section: ClassSection): string {
  return `${grade}${section}`;
}

/**
 * A class group - grade 1 section A, and so on. It is the group itself, not a
 * lesson: which students are in it is a row per student in `enrollments`.
 */
export interface IClass {
  grade: number;
  section: ClassSection;
  /** Derived from grade and section, stored so it can be searched and sorted. */
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ClassDocument = HydratedDocument<IClass>;

const classSchema = new Schema<IClass>(
  {
    grade: { type: Number, required: true, min: MIN_GRADE, max: MAX_GRADE },
    section: { type: String, enum: CLASS_SECTIONS, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, unique: true, lowercase: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  schemaOptions(),
);

// Kept in step with grade/section on every write, so `name` can never drift
// away from the two fields it is derived from.
classSchema.pre('validate', function () {
  if (this.grade !== undefined && this.section !== undefined) {
    this.name = className(this.grade, this.section);
  }
});

// One 1a. The unique index on `name` says the same thing, but this is the pair
// the application actually reasons about.
classSchema.index({ grade: 1, section: 1 }, { unique: true });

export const Class = model<IClass>('Class', classSchema);

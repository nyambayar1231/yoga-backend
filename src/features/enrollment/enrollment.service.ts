import type { QueryFilter } from 'mongoose';
import { conflict, notFound } from '../../lib/errors.ts';
import type { Pagination } from '../../lib/http.ts';
import { Class } from '../../models/class.ts';
import {
  Enrollment,
  type IEnrollment,
  type EnrollmentDocument,
} from '../../models/enrollment.ts';
import { Student } from '../../models/student.ts';

const DUPLICATE_KEY = 11000;

/** Only the fields the caller actually needs off the other side of the join. */
const STUDENT_FIELDS = 'firstName lastName email isActive';
const CLASS_FIELDS = 'grade section name isActive';

export interface EnrollInput {
  studentId: string;
  classId: string;
  schoolYear: string;
}

export interface ListEnrollmentsFilter {
  studentId?: string;
  classId?: string;
  schoolYear?: string;
  isActive?: boolean;
}

export interface ListEnrollmentsOptions {
  /** Which side of the join to resolve. Neither, by default. */
  populate?: readonly ('studentId' | 'classId')[];
}

/**
 * Puts a student into a class for a school year.
 *
 * A student sits in one class at a time, so an active enrolment elsewhere in
 * the same year is a conflict rather than a second row - move them out first.
 * Re-enrolling into a class they previously left revives the original row,
 * which is what the unique index on (studentId, classId) is there to force.
 */
export async function enrollStudent(input: EnrollInput): Promise<EnrollmentDocument> {
  const [student, group] = await Promise.all([
    Student.findById(input.studentId).exec(),
    Class.findById(input.classId).exec(),
  ]);

  if (!student) throw notFound('STUDENT_NOT_FOUND', `No student with id ${input.studentId}`);
  if (!group) throw notFound('CLASS_NOT_FOUND', `No class with id ${input.classId}`);

  const clash = await Enrollment.findOne({
    studentId: input.studentId,
    schoolYear: input.schoolYear,
    classId: { $ne: input.classId },
    isActive: true,
  }).exec();

  if (clash) {
    throw conflict(
      'ALREADY_ENROLLED',
      `That student is already in another class for ${input.schoolYear}`,
    );
  }

  const existing = await Enrollment.findOne({
    studentId: input.studentId,
    classId: input.classId,
  }).exec();

  if (existing) {
    if (existing.isActive && existing.schoolYear === input.schoolYear) {
      throw conflict(
        'ALREADY_ENROLLED',
        `That student is already in ${group.name} for ${input.schoolYear}`,
      );
    }

    existing.schoolYear = input.schoolYear;
    existing.isActive = true;
    existing.enrolledAt = new Date();
    return existing.save();
  }

  try {
    return await Enrollment.create(input);
  } catch (error) {
    // Lost a race with a concurrent enrolment of the same pair.
    if ((error as { code?: number }).code === DUPLICATE_KEY) {
      throw conflict('ALREADY_ENROLLED', `That student is already in ${group.name}`);
    }
    throw error;
  }
}

function buildFilter(filter: ListEnrollmentsFilter): QueryFilter<IEnrollment> {
  const query: QueryFilter<IEnrollment> = {};
  if (filter.studentId !== undefined) query.studentId = filter.studentId;
  if (filter.classId !== undefined) query.classId = filter.classId;
  if (filter.schoolYear !== undefined) query.schoolYear = filter.schoolYear;
  if (filter.isActive !== undefined) query.isActive = filter.isActive;
  return query;
}

export function listEnrollments(
  filter: ListEnrollmentsFilter,
  { limit, skip }: Pagination,
  { populate = [] }: ListEnrollmentsOptions = {},
): Promise<EnrollmentDocument[]> {
  const query = Enrollment.find(buildFilter(filter))
    .sort({ enrolledAt: -1 })
    .skip(skip)
    .limit(limit);

  if (populate.includes('studentId')) query.populate('studentId', STUDENT_FIELDS);
  if (populate.includes('classId')) query.populate('classId', CLASS_FIELDS);

  return query.exec();
}

export function countEnrollments(filter: ListEnrollmentsFilter): Promise<number> {
  return Enrollment.countDocuments(buildFilter(filter)).exec();
}

export async function requireEnrollmentById(id: string): Promise<EnrollmentDocument> {
  const enrollment = await Enrollment.findById(id).exec();
  if (!enrollment) throw notFound('ENROLLMENT_NOT_FOUND', `No enrollment with id ${id}`);
  return enrollment;
}

/** Takes a student out of a class. The row stays: it is where they used to be. */
export async function setEnrollmentActive(
  id: string,
  isActive: boolean,
): Promise<EnrollmentDocument> {
  const enrollment = await requireEnrollmentById(id);

  // Reviving a row runs into the same one-class-per-year rule as a fresh
  // enrolment, so go back through it rather than flipping the flag here.
  if (isActive && !enrollment.isActive) {
    return enrollStudent({
      studentId: enrollment.studentId.toString(),
      classId: enrollment.classId.toString(),
      schoolYear: enrollment.schoolYear,
    });
  }

  enrollment.isActive = isActive;
  return enrollment.save();
}

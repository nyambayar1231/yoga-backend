import type { QueryFilter } from 'mongoose';
import { escapeRegex, type Pagination } from '../../lib/http.ts';
import { notFound } from '../../lib/errors.ts';
import { Instructor, type IInstructor, type InstructorDocument } from '../../models/instructor.ts';
import type { UserDocument } from '../../models/user.ts';
import { createWithAccount } from '../user/user.service.ts';

export type InstructorProfileInput = Omit<
  IInstructor,
  'createdAt' | 'updatedAt' | 'isActive' | 'specialties'
> &
  Partial<Pick<IInstructor, 'specialties'>>;

export type UpdateInstructorInput = Partial<Omit<IInstructor, 'createdAt' | 'updatedAt'>>;

export interface CreateInstructorInput extends InstructorProfileInput {
  /** The login email. */
  accountEmail: string;
  password?: string | null;
}

export interface ListInstructorsFilter {
  search?: string;
  isActive?: boolean;
}

/** Registers an instructor and the 'instructor' login that points at it. */
export async function createInstructor(
  input: CreateInstructorInput,
): Promise<{ profile: InstructorDocument; user: UserDocument }> {
  const { accountEmail, password, ...profile } = input;

  return createWithAccount({ email: accountEmail, password }, 'instructor', () =>
    Instructor.create(profile),
  );
}

function buildFilter({ search, isActive }: ListInstructorsFilter): QueryFilter<IInstructor> {
  const filter: QueryFilter<IInstructor> = {};
  if (isActive !== undefined) filter.isActive = isActive;

  if (search !== undefined) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ firstName: pattern }, { lastName: pattern }, { specialties: pattern }];
  }
  return filter;
}

export function listInstructors(
  filter: ListInstructorsFilter,
  { limit, skip }: Pagination,
): Promise<InstructorDocument[]> {
  return Instructor.find(buildFilter(filter))
    .sort({ lastName: 1, firstName: 1 })
    .skip(skip)
    .limit(limit)
    .exec();
}

export function countInstructors(filter: ListInstructorsFilter): Promise<number> {
  return Instructor.countDocuments(buildFilter(filter)).exec();
}

export async function requireInstructorById(id: string): Promise<InstructorDocument> {
  const instructor = await Instructor.findById(id).exec();
  if (!instructor) throw notFound('INSTRUCTOR_NOT_FOUND', `No instructor with id ${id}`);
  return instructor;
}

export async function updateInstructor(
  id: string,
  patch: UpdateInstructorInput,
): Promise<InstructorDocument> {
  const instructor = await requireInstructorById(id);
  instructor.set(patch);
  return instructor.save();
}

/**
 * Instructors are deactivated, never deleted: past sessions and assessments
 * keep their instructorId and must still resolve to a profile.
 */
export async function setInstructorActive(
  id: string,
  isActive: boolean,
): Promise<InstructorDocument> {
  const instructor = await requireInstructorById(id);
  instructor.isActive = isActive;
  return instructor.save();
}

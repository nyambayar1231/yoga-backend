import type { QueryFilter } from 'mongoose';
import { escapeRegex, type Pagination } from '../../lib/http.ts';
import { notFound } from '../../lib/errors.ts';
import { Student, type IStudent, type StudentDocument } from '../../models/student.ts';
import type { UserDocument } from '../../models/user.ts';
import { createWithAccount } from '../user/user.service.ts';

export type StudentProfileInput = Omit<
  IStudent,
  'createdAt' | 'updatedAt' | 'isActive' | 'enrolledAt'
> &
  Partial<Pick<IStudent, 'enrolledAt'>>;

export type UpdateStudentInput = Partial<Omit<IStudent, 'createdAt' | 'updatedAt'>>;

export interface CreateStudentInput extends StudentProfileInput {
  /** The login email. Also stored on the profile when none is given separately. */
  accountEmail: string;
  /** Null or omitted: the account exists but cannot log in until a password is set. */
  password?: string | null;
}

export interface ListStudentsFilter {
  search?: string;
  isActive?: boolean;
}

/**
 * Registers a student and the 'student' login that points at it.
 *
 * Duplicate names are allowed through: two pupils genuinely share a name, and
 * refusing to register a real one is the worse failure.
 */
export async function createStudent(
  input: CreateStudentInput,
): Promise<{ profile: StudentDocument; user: UserDocument }> {
  const { accountEmail, password, ...profile } = input;

  return createWithAccount({ email: accountEmail, password }, 'student', () =>
    Student.create({ ...profile, email: profile.email ?? accountEmail }),
  );
}

function buildFilter({ search, isActive }: ListStudentsFilter): QueryFilter<IStudent> {
  const filter: QueryFilter<IStudent> = {};
  if (isActive !== undefined) filter.isActive = isActive;

  if (search !== undefined) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ firstName: pattern }, { lastName: pattern }, { email: pattern }];
  }
  return filter;
}

export function listStudents(
  filter: ListStudentsFilter,
  { limit, skip }: Pagination,
): Promise<StudentDocument[]> {
  return Student.find(buildFilter(filter))
    .sort({ lastName: 1, firstName: 1 })
    .skip(skip)
    .limit(limit)
    .exec();
}

export function countStudents(filter: ListStudentsFilter): Promise<number> {
  return Student.countDocuments(buildFilter(filter)).exec();
}

export async function requireStudentById(id: string): Promise<StudentDocument> {
  const student = await Student.findById(id).exec();
  if (!student) throw notFound('STUDENT_NOT_FOUND', `No student with id ${id}`);
  return student;
}

export async function updateStudent(
  id: string,
  patch: UpdateStudentInput,
): Promise<StudentDocument> {
  const student = await requireStudentById(id);
  student.set(patch);
  return student.save();
}

/**
 * Students are deactivated, never deleted: a pupil who leaves the school stays
 * on the rosters of the classes they were actually in.
 */
export async function setStudentActive(id: string, isActive: boolean): Promise<StudentDocument> {
  const student = await requireStudentById(id);
  student.isActive = isActive;
  return student.save();
}

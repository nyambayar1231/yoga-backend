import type { QueryFilter } from 'mongoose';
import { escapeRegex, type Pagination } from '../../lib/http.ts';
import { notFound } from '../../lib/errors.ts';
import { Teacher, type ITeacher, type TeacherDocument } from '../../models/teacher.ts';
import type { UserDocument } from '../../models/user.ts';
import { createWithAccount } from '../user/user.service.ts';

export type TeacherProfileInput = Omit<
  ITeacher,
  'createdAt' | 'updatedAt' | 'isActive' | 'subjects'
> &
  Partial<Pick<ITeacher, 'subjects'>>;

export type UpdateTeacherInput = Partial<Omit<ITeacher, 'createdAt' | 'updatedAt'>>;

export interface CreateTeacherInput extends TeacherProfileInput {
  /** The login email. */
  accountEmail: string;
  password?: string | null;
}

export interface ListTeachersFilter {
  search?: string;
  isActive?: boolean;
}

/** Registers a teacher and the 'teacher' login that points at it. */
export async function createTeacher(
  input: CreateTeacherInput,
): Promise<{ profile: TeacherDocument; user: UserDocument }> {
  const { accountEmail, password, ...profile } = input;

  return createWithAccount({ email: accountEmail, password }, 'teacher', () =>
    Teacher.create(profile),
  );
}

function buildFilter({ search, isActive }: ListTeachersFilter): QueryFilter<ITeacher> {
  const filter: QueryFilter<ITeacher> = {};
  if (isActive !== undefined) filter.isActive = isActive;

  if (search !== undefined) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ firstName: pattern }, { lastName: pattern }, { subjects: pattern }];
  }
  return filter;
}

export function listTeachers(
  filter: ListTeachersFilter,
  { limit, skip }: Pagination,
): Promise<TeacherDocument[]> {
  return Teacher.find(buildFilter(filter))
    .sort({ lastName: 1, firstName: 1 })
    .skip(skip)
    .limit(limit)
    .exec();
}

export function countTeachers(filter: ListTeachersFilter): Promise<number> {
  return Teacher.countDocuments(buildFilter(filter)).exec();
}

export async function requireTeacherById(id: string): Promise<TeacherDocument> {
  const teacher = await Teacher.findById(id).exec();
  if (!teacher) throw notFound('TEACHER_NOT_FOUND', `No teacher with id ${id}`);
  return teacher;
}

export async function updateTeacher(
  id: string,
  patch: UpdateTeacherInput,
): Promise<TeacherDocument> {
  const teacher = await requireTeacherById(id);
  teacher.set(patch);
  return teacher.save();
}

/**
 * Teachers are deactivated, never deleted: a teacher who leaves the school is
 * still the teacher recorded on everything they did while they were here.
 */
export async function setTeacherActive(id: string, isActive: boolean): Promise<TeacherDocument> {
  const teacher = await requireTeacherById(id);
  teacher.isActive = isActive;
  return teacher.save();
}

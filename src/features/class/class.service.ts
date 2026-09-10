import type { QueryFilter } from 'mongoose';
import { conflict, notFound } from '../../lib/errors.ts';
import type { Pagination } from '../../lib/http.ts';
import {
  Class,
  className,
  type IClass,
  type ClassDocument,
  type ClassSection,
} from '../../models/class.ts';

const DUPLICATE_KEY = 11000;

export interface ClassInput {
  grade: number;
  section: ClassSection;
}

export interface ListClassesFilter {
  grade?: number;
  section?: ClassSection;
  isActive?: boolean;
}

export async function createClass(input: ClassInput): Promise<ClassDocument> {
  try {
    return await Class.create(input);
  } catch (error) {
    if ((error as { code?: number }).code === DUPLICATE_KEY) {
      throw conflict(
        'CLASS_EXISTS',
        `Class ${className(input.grade, input.section)} already exists`,
      );
    }
    throw error;
  }
}

function buildFilter({ grade, section, isActive }: ListClassesFilter): QueryFilter<IClass> {
  const filter: QueryFilter<IClass> = {};
  if (grade !== undefined) filter.grade = grade;
  if (section !== undefined) filter.section = section;
  if (isActive !== undefined) filter.isActive = isActive;
  return filter;
}

export function listClasses(
  filter: ListClassesFilter,
  { limit, skip }: Pagination,
): Promise<ClassDocument[]> {
  return Class.find(buildFilter(filter))
    .sort({ grade: 1, section: 1 })
    .skip(skip)
    .limit(limit)
    .exec();
}

export function countClasses(filter: ListClassesFilter): Promise<number> {
  return Class.countDocuments(buildFilter(filter)).exec();
}

export async function requireClassById(id: string): Promise<ClassDocument> {
  const group = await Class.findById(id).exec();
  if (!group) throw notFound('CLASS_NOT_FOUND', `No class with id ${id}`);
  return group;
}

export async function updateClass(id: string, patch: Partial<ClassInput>): Promise<ClassDocument> {
  const group = await requireClassById(id);
  group.set(patch);

  try {
    return await group.save();
  } catch (error) {
    if ((error as { code?: number }).code === DUPLICATE_KEY) {
      throw conflict('CLASS_EXISTS', `Class ${group.name} already exists`);
    }
    throw error;
  }
}

/**
 * Retiring a class leaves its enrolments alone: who was in 3a is still true
 * after the school stops running a 3a.
 */
export async function setClassActive(id: string, isActive: boolean): Promise<ClassDocument> {
  const group = await requireClassById(id);
  group.isActive = isActive;
  return group.save();
}

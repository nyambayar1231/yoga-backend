import type { QueryFilter } from 'mongoose';
import { conflict, notFound } from '../../lib/errors.ts';
import { escapeRegex, type Pagination } from '../../lib/http.ts';
import { ClassType, type IClassType, type ClassTypeDocument } from '../../models/class-type.ts';

export type ClassTypeInput = Omit<IClassType, 'createdAt' | 'updatedAt' | 'isActive'>;

export interface ListClassTypesFilter {
  search?: string;
  category?: IClassType['category'];
  isActive?: boolean;
}

const DUPLICATE_KEY = 11000;

export async function createClassType(input: ClassTypeInput): Promise<ClassTypeDocument> {
  try {
    return await ClassType.create(input);
  } catch (error) {
    if ((error as { code?: number }).code === DUPLICATE_KEY) {
      throw conflict('CLASS_TYPE_EXISTS', `A class type named "${input.name}" already exists`);
    }
    throw error;
  }
}

function buildFilter({ search, category, isActive }: ListClassTypesFilter): QueryFilter<IClassType> {
  const filter: QueryFilter<IClassType> = {};
  if (category !== undefined) filter.category = category;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search !== undefined) filter.name = new RegExp(escapeRegex(search), 'i');
  return filter;
}

export function listClassTypes(
  filter: ListClassTypesFilter,
  { limit, skip }: Pagination,
): Promise<ClassTypeDocument[]> {
  return ClassType.find(buildFilter(filter)).sort({ name: 1 }).skip(skip).limit(limit).exec();
}

export function countClassTypes(filter: ListClassTypesFilter): Promise<number> {
  return ClassType.countDocuments(buildFilter(filter)).exec();
}

export async function requireClassTypeById(id: string): Promise<ClassTypeDocument> {
  const classType = await ClassType.findById(id).exec();
  if (!classType) throw notFound('CLASS_TYPE_NOT_FOUND', `No class type with id ${id}`);
  return classType;
}

/**
 * Editing a class type never touches sessions already scheduled from it: they
 * carry their own capacity, so a booked session cannot shrink under a member.
 */
export async function updateClassType(
  id: string,
  patch: Partial<ClassTypeInput>,
): Promise<ClassTypeDocument> {
  const classType = await requireClassTypeById(id);
  classType.set(patch);

  try {
    return await classType.save();
  } catch (error) {
    if ((error as { code?: number }).code === DUPLICATE_KEY) {
      throw conflict('CLASS_TYPE_EXISTS', `A class type named "${patch.name}" already exists`);
    }
    throw error;
  }
}

export async function setClassTypeActive(
  id: string,
  isActive: boolean,
): Promise<ClassTypeDocument> {
  const classType = await requireClassTypeById(id);
  classType.isActive = isActive;
  return classType.save();
}

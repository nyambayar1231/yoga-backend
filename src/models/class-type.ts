import { Schema, model, type HydratedDocument } from 'mongoose';
import { schemaOptions } from './base.ts';

export const CLASS_CATEGORIES = ['yoga', 'pilates', 'other'] as const;
export type ClassCategory = (typeof CLASS_CATEGORIES)[number];

/**
 * What a class is, never when it runs. "Yoga 101" is one class type however
 * many times a week it is scheduled - the occurrences are class sessions.
 */
export interface IClassType {
  name: string;
  description?: string;
  category: ClassCategory;
  durationMinutes: number;
  capacity: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ClassTypeDocument = HydratedDocument<IClassType>;

const classTypeSchema = new Schema<IClassType>(
  {
    // Unique so "Yoga 101" cannot be entered twice with different capacities.
    name: { type: String, required: true, unique: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 2000 },
    category: { type: String, enum: CLASS_CATEGORIES, required: true },
    durationMinutes: { type: Number, required: true, min: 5, max: 600 },
    capacity: { type: Number, required: true, min: 1, max: 500 },
    isActive: { type: Boolean, default: true },
  },
  schemaOptions(),
);

export const ClassType = model<IClassType>('ClassType', classTypeSchema);

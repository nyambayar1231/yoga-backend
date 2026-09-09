import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { schemaOptions } from './base.ts';

export const SESSION_STATUSES = ['scheduled', 'cancelled', 'completed'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * One dated occurrence of a class type. Capacity is copied from the class type
 * at creation so changing the catalogue later cannot resize sessions already
 * booked - the session keeps the number members registered against.
 */
export interface IClassSession {
  classTypeId: Types.ObjectId;
  instructorId: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  capacity: number;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type ClassSessionDocument = HydratedDocument<IClassSession>;

const classSessionSchema = new Schema<IClassSession>(
  {
    classTypeId: { type: Schema.Types.ObjectId, ref: 'ClassType', required: true },
    instructorId: { type: Schema.Types.ObjectId, ref: 'Instructor', required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    capacity: { type: Number, required: true, min: 1, max: 500 },
    status: { type: String, enum: SESSION_STATUSES, default: 'scheduled' },
  },
  schemaOptions(),
);

// Timetable by date, then the two ways the studio narrows it down.
classSessionSchema.index({ startAt: 1 });
classSessionSchema.index({ instructorId: 1, startAt: 1 });
classSessionSchema.index({ classTypeId: 1, startAt: 1 });

export const ClassSession = model<IClassSession>('ClassSession', classSessionSchema);

import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { schemaOptions } from './base.ts';

export const ATTENDANCE_STATUSES = ['registered', 'attended', 'cancelled', 'no_show'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Statuses that occupy a seat. Cancelled and no-show rows free their place. */
export const OCCUPYING_STATUSES: readonly AttendanceStatus[] = ['registered', 'attended'];

/**
 * The member <-> class session join. Its own collection rather than an array on
 * either side, because both sides grow without bound.
 */
export interface IAttendance {
  memberId: Types.ObjectId;
  classSessionId: Types.ObjectId;
  status: AttendanceStatus;
  checkedInAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AttendanceDocument = HydratedDocument<IAttendance>;

const attendanceSchema = new Schema<IAttendance>(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    classSessionId: { type: Schema.Types.ObjectId, ref: 'ClassSession', required: true },
    status: { type: String, enum: ATTENDANCE_STATUSES, default: 'registered' },
    checkedInAt: { type: Date },
  },
  schemaOptions(),
);

// One row per member per session, whatever its status. Registering again after
// cancelling reuses the row instead of stacking duplicates.
attendanceSchema.index({ memberId: 1, classSessionId: 1 }, { unique: true });
attendanceSchema.index({ memberId: 1, createdAt: -1 });
attendanceSchema.index({ classSessionId: 1 });

export const Attendance = model<IAttendance>('Attendance', attendanceSchema);

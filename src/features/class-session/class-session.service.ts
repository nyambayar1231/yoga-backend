import type { PopulateOptions, QueryFilter, Types } from 'mongoose';
import { badRequest, conflict, notFound } from '../../lib/errors.ts';
import type { Pagination } from '../../lib/http.ts';
import { Attendance, OCCUPYING_STATUSES } from '../../models/attendance.ts';
import {
  ClassSession,
  type ClassSessionDocument,
  type IClassSession,
  type SessionStatus,
} from '../../models/class-session.ts';
import { requireClassTypeById } from '../class-type/class-type.service.ts';
import { requireInstructorById } from '../instructor/instructor.service.ts';

export interface CreateClassSessionInput {
  classTypeId: string;
  instructorId: string;
  startAt: Date;
  /** Defaults to startAt plus the class type's duration. */
  endAt?: Date;
  /** Defaults to the class type's capacity. */
  capacity?: number;
}

export type UpdateClassSessionInput = Partial<CreateClassSessionInput>;

export interface ListClassSessionsFilter {
  from?: Date;
  to?: Date;
  classTypeId?: string;
  instructorId?: string;
  status?: SessionStatus;
}

/** Names and titles the timetable always wants, and nothing else. */
const LIST_POPULATE: PopulateOptions[] = [
  { path: 'classTypeId', select: 'name category durationMinutes' },
  { path: 'instructorId', select: 'firstName lastName' },
];

/**
 * An instructor cannot teach two classes at once. Only scheduled sessions
 * collide - a cancelled one has freed the slot.
 */
async function assertInstructorFree(
  instructorId: string | Types.ObjectId,
  startAt: Date,
  endAt: Date,
  excludeSessionId?: Types.ObjectId,
): Promise<void> {
  const clash = await ClassSession.findOne({
    instructorId,
    status: 'scheduled',
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
    ...(excludeSessionId ? { _id: { $ne: excludeSessionId } } : {}),
  }).exec();

  if (clash) {
    throw conflict(
      'INSTRUCTOR_DOUBLE_BOOKED',
      `That instructor already teaches a class from ${clash.startAt.toISOString()} to ${clash.endAt.toISOString()}`,
    );
  }
}

export async function createClassSession(
  input: CreateClassSessionInput,
): Promise<ClassSessionDocument> {
  const classType = await requireClassTypeById(input.classTypeId);
  if (!classType.isActive) {
    throw badRequest('CLASS_TYPE_INACTIVE', `Class type "${classType.name}" is not active`);
  }

  const instructor = await requireInstructorById(input.instructorId);
  if (!instructor.isActive) {
    throw badRequest('INSTRUCTOR_INACTIVE', 'That instructor is no longer active');
  }

  const endAt =
    input.endAt ?? new Date(input.startAt.getTime() + classType.durationMinutes * 60_000);
  if (endAt <= input.startAt) {
    throw badRequest('INVALID_TIME_RANGE', 'endAt must be after startAt');
  }

  await assertInstructorFree(instructor.id, input.startAt, endAt);

  return ClassSession.create({
    classTypeId: classType._id,
    instructorId: instructor._id,
    startAt: input.startAt,
    endAt,
    capacity: input.capacity ?? classType.capacity,
  });
}

function buildFilter(filter: ListClassSessionsFilter): QueryFilter<IClassSession> {
  const query: QueryFilter<IClassSession> = {};

  if (filter.classTypeId !== undefined) query.classTypeId = filter.classTypeId;
  if (filter.instructorId !== undefined) query.instructorId = filter.instructorId;
  if (filter.status !== undefined) query.status = filter.status;

  if (filter.from !== undefined || filter.to !== undefined) {
    query.startAt = {
      ...(filter.from !== undefined ? { $gte: filter.from } : {}),
      ...(filter.to !== undefined ? { $lte: filter.to } : {}),
    };
  }
  return query;
}

export function listClassSessions(
  filter: ListClassSessionsFilter,
  { limit, skip }: Pagination,
): Promise<ClassSessionDocument[]> {
  return ClassSession.find(buildFilter(filter))
    .sort({ startAt: 1 })
    .skip(skip)
    .limit(limit)
    .populate(LIST_POPULATE)
    .exec();
}

export function countClassSessions(filter: ListClassSessionsFilter): Promise<number> {
  return ClassSession.countDocuments(buildFilter(filter)).exec();
}

export async function requireClassSessionById(id: string): Promise<ClassSessionDocument> {
  const session = await ClassSession.findById(id).exec();
  if (!session) throw notFound('CLASS_SESSION_NOT_FOUND', `No class session with id ${id}`);
  return session;
}

export function getClassSessionDetail(id: string): Promise<ClassSessionDocument | null> {
  return ClassSession.findById(id).populate(LIST_POPULATE).exec();
}

/** Seats currently taken. Cancelled and no-show rows have released theirs. */
export function countOccupiedSeats(sessionId: string | Types.ObjectId): Promise<number> {
  return Attendance.countDocuments({
    classSessionId: sessionId,
    status: { $in: OCCUPYING_STATUSES },
  }).exec();
}

export async function updateClassSession(
  id: string,
  patch: UpdateClassSessionInput,
): Promise<ClassSessionDocument> {
  const session = await requireClassSessionById(id);

  if (patch.classTypeId !== undefined) {
    session.classTypeId = (await requireClassTypeById(patch.classTypeId))._id;
  }
  if (patch.instructorId !== undefined) {
    const instructor = await requireInstructorById(patch.instructorId);
    if (!instructor.isActive) {
      throw badRequest('INSTRUCTOR_INACTIVE', 'That instructor is no longer active');
    }
    session.instructorId = instructor._id;
  }
  if (patch.startAt !== undefined) session.startAt = patch.startAt;
  if (patch.endAt !== undefined) session.endAt = patch.endAt;

  if (session.endAt <= session.startAt) {
    throw badRequest('INVALID_TIME_RANGE', 'endAt must be after startAt');
  }

  if (patch.capacity !== undefined) {
    // Shrinking below the people already booked would silently oversell it.
    const occupied = await countOccupiedSeats(session._id);
    if (patch.capacity < occupied) {
      throw conflict(
        'CAPACITY_BELOW_BOOKINGS',
        `${occupied} members are already booked, so capacity cannot drop to ${patch.capacity}`,
      );
    }
    session.capacity = patch.capacity;
  }

  if (session.status === 'scheduled') {
    await assertInstructorFree(session.instructorId, session.startAt, session.endAt, session._id);
  }

  return session.save();
}

/** Cancelled sessions stay in the database: the attendance history points at them. */
export async function setClassSessionStatus(
  id: string,
  status: SessionStatus,
): Promise<ClassSessionDocument> {
  const session = await requireClassSessionById(id);
  session.status = status;
  return session.save();
}

import type { QueryFilter, Types } from 'mongoose';
import { badRequest, conflict, notFound } from '../../lib/errors.ts';
import type { Pagination } from '../../lib/http.ts';
import {
  Attendance,
  OCCUPYING_STATUSES,
  type AttendanceDocument,
  type AttendanceStatus,
  type IAttendance,
} from '../../models/attendance.ts';
import { countOccupiedSeats, requireClassSessionById } from '../class-session/class-session.service.ts';
import { requireMemberById } from '../member/member.service.ts';

const DUPLICATE_KEY = 11000;

export interface ListMemberAttendanceFilter {
  status?: AttendanceStatus;
}

function occupies(status: AttendanceStatus): boolean {
  return OCCUPYING_STATUSES.includes(status);
}

async function assertSeatAvailable(
  sessionId: Types.ObjectId,
  capacity: number,
): Promise<void> {
  if ((await countOccupiedSeats(sessionId)) >= capacity) {
    throw conflict('SESSION_FULL', 'That class is full');
  }
}

/**
 * Registers a member for a session.
 *
 * A member who cancelled and comes back reuses their existing row rather than
 * creating a second one - the unique index would reject it anyway.
 */
export async function registerMember(
  classSessionId: string,
  memberId: string,
): Promise<AttendanceDocument> {
  const session = await requireClassSessionById(classSessionId);
  if (session.status !== 'scheduled') {
    throw badRequest('SESSION_NOT_OPEN', `This class is ${session.status}`);
  }

  const member = await requireMemberById(memberId);
  if (!member.isActive) {
    throw badRequest('MEMBER_INACTIVE', 'That member is not active');
  }

  const existing = await Attendance.findOne({ classSessionId: session._id, memberId: member._id })
    .exec();

  if (existing && occupies(existing.status)) {
    throw conflict('ALREADY_REGISTERED', 'That member is already registered for this class');
  }

  await assertSeatAvailable(session._id, session.capacity);

  if (existing) {
    existing.status = 'registered';
    existing.checkedInAt = undefined;
    return existing.save();
  }

  try {
    return await Attendance.create({ classSessionId: session._id, memberId: member._id });
  } catch (error) {
    // Two simultaneous registrations for the same member: the index caught it.
    if ((error as { code?: number }).code === DUPLICATE_KEY) {
      throw conflict('ALREADY_REGISTERED', 'That member is already registered for this class');
    }
    throw error;
  }
}

export async function requireAttendanceById(id: string): Promise<AttendanceDocument> {
  const attendance = await Attendance.findById(id).exec();
  if (!attendance) throw notFound('ATTENDANCE_NOT_FOUND', `No attendance record with id ${id}`);
  return attendance;
}

/**
 * Moves a registration through its lifecycle: checked in, cancelled, no-show.
 * Taking a seat back up (say un-cancelling) re-checks capacity.
 */
export async function setAttendanceStatus(
  id: string,
  status: AttendanceStatus,
): Promise<AttendanceDocument> {
  const attendance = await requireAttendanceById(id);

  if (!occupies(attendance.status) && occupies(status)) {
    const session = await requireClassSessionById(attendance.classSessionId.toString());
    await assertSeatAvailable(session._id, session.capacity);
  }

  attendance.status = status;
  attendance.checkedInAt = status === 'attended' ? (attendance.checkedInAt ?? new Date()) : undefined;

  return attendance.save();
}

/** The roster for one class, in registration order. */
export function listSessionAttendance(
  classSessionId: string,
  { limit, skip }: Pagination,
): Promise<AttendanceDocument[]> {
  return Attendance.find({ classSessionId })
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .populate({ path: 'memberId', select: 'firstName lastName phone' })
    .exec();
}

export function countSessionAttendance(classSessionId: string): Promise<number> {
  return Attendance.countDocuments({ classSessionId }).exec();
}

function memberFilter(
  memberId: string,
  { status }: ListMemberAttendanceFilter,
): QueryFilter<IAttendance> {
  return { memberId, ...(status !== undefined ? { status } : {}) };
}

/** One member's history, newest first. */
export function listMemberAttendance(
  memberId: string,
  filter: ListMemberAttendanceFilter,
  { limit, skip }: Pagination,
): Promise<AttendanceDocument[]> {
  return Attendance.find(memberFilter(memberId, filter))
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'classSessionId',
      select: 'startAt endAt status classTypeId',
      populate: { path: 'classTypeId', select: 'name category' },
    })
    .exec();
}

export function countMemberAttendance(
  memberId: string,
  filter: ListMemberAttendanceFilter,
): Promise<number> {
  return Attendance.countDocuments(memberFilter(memberId, filter)).exec();
}

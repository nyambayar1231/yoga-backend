import type { PopulateOptions, QueryFilter } from 'mongoose';
import type { AuthUser } from '../../lib/auth.ts';
import { badRequest, forbidden, notFound } from '../../lib/errors.ts';
import { assertMemberAccess } from '../../middleware/authorization.ts';
import type { Pagination } from '../../lib/http.ts';
import { Assessment, type AssessmentDocument, type IAssessment } from '../../models/assessment.ts';
import { requireInstructorById } from '../instructor/instructor.service.ts';
import { requireMemberById } from '../member/member.service.ts';

export interface CreateAssessmentInput {
  memberId: string;
  instructorId: string;
  assessmentDate?: Date;
  type: string;
  data?: Record<string, unknown>;
  notes?: string;
}

export type UpdateAssessmentInput = Partial<
  Pick<CreateAssessmentInput, 'assessmentDate' | 'type' | 'data' | 'notes'>
>;

export interface ListAssessmentsFilter {
  memberId?: string;
  instructorId?: string;
  type?: string;
  from?: Date;
  to?: Date;
}

const LIST_POPULATE: PopulateOptions[] = [
  { path: 'memberId', select: 'firstName lastName' },
  { path: 'instructorId', select: 'firstName lastName' },
];

export async function createAssessment(
  input: CreateAssessmentInput,
): Promise<AssessmentDocument> {
  const member = await requireMemberById(input.memberId);
  const instructor = await requireInstructorById(input.instructorId);

  if (!instructor.isActive) {
    throw badRequest('INSTRUCTOR_INACTIVE', 'That instructor is no longer active');
  }

  return Assessment.create({
    memberId: member._id,
    instructorId: instructor._id,
    type: input.type,
    ...(input.assessmentDate !== undefined ? { assessmentDate: input.assessmentDate } : {}),
    ...(input.data !== undefined ? { data: input.data } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });
}

function buildFilter(filter: ListAssessmentsFilter): QueryFilter<IAssessment> {
  const query: QueryFilter<IAssessment> = {};

  if (filter.memberId !== undefined) query.memberId = filter.memberId;
  if (filter.instructorId !== undefined) query.instructorId = filter.instructorId;
  if (filter.type !== undefined) query.type = filter.type;

  if (filter.from !== undefined || filter.to !== undefined) {
    query.assessmentDate = {
      ...(filter.from !== undefined ? { $gte: filter.from } : {}),
      ...(filter.to !== undefined ? { $lte: filter.to } : {}),
    };
  }
  return query;
}

export function listAssessments(
  filter: ListAssessmentsFilter,
  { limit, skip }: Pagination,
): Promise<AssessmentDocument[]> {
  return Assessment.find(buildFilter(filter))
    .sort({ assessmentDate: -1 })
    .skip(skip)
    .limit(limit)
    .populate(LIST_POPULATE)
    .exec();
}

export function countAssessments(filter: ListAssessmentsFilter): Promise<number> {
  return Assessment.countDocuments(buildFilter(filter)).exec();
}

export async function requireAssessmentById(id: string): Promise<AssessmentDocument> {
  const assessment = await Assessment.findById(id).exec();
  if (!assessment) throw notFound('ASSESSMENT_NOT_FOUND', `No assessment with id ${id}`);
  return assessment;
}

/**
 * The member and the recorded instructor are fixed: an assessment is a
 * historical record of who evaluated whom, not a mutable row.
 */
export async function updateAssessment(
  id: string,
  patch: UpdateAssessmentInput,
): Promise<AssessmentDocument> {
  const assessment = await requireAssessmentById(id);
  assessment.set(patch);
  return assessment.save();
}

/**
 * Creates an assessment on behalf of the signed-in user.
 *
 * An instructor is always recorded as the author of their own assessments -
 * they cannot file one under someone else's name. An admin may name the
 * instructor, and falls back to their own instructor profile if they teach.
 */
export function createAssessmentFor(
  user: AuthUser,
  input: Omit<CreateAssessmentInput, 'instructorId'> & { instructorId?: string },
): Promise<AssessmentDocument> {
  const instructorId =
    user.role === 'instructor' ? user.instructorId : (input.instructorId ?? user.instructorId);

  if (instructorId === undefined) {
    throw badRequest(
      'INSTRUCTOR_REQUIRED',
      'instructorId is required: this account has no instructor profile of its own',
    );
  }

  return createAssessment({ ...input, instructorId });
}

/** Staff see every assessment; a member only their own. */
export function assertAssessmentAccess(user: AuthUser, assessment: AssessmentDocument): void {
  assertMemberAccess(user, assessment.memberId.toString());
}

/** Only an admin or the instructor who wrote it may change an assessment. */
export function assertAssessmentAuthor(user: AuthUser, assessment: AssessmentDocument): void {
  if (user.role === 'admin') return;
  if (user.role === 'instructor' && user.instructorId === assessment.instructorId.toString()) {
    return;
  }
  throw forbidden('Only an admin or the instructor who wrote it may change this assessment');
}

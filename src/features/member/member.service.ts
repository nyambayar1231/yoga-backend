import type { QueryFilter } from 'mongoose';
import { escapeRegex, type Pagination } from '../../lib/http.ts';
import { notFound } from '../../lib/errors.ts';
import { Member, type IMember, type MemberDocument } from '../../models/member.ts';
import type { UserDocument } from '../../models/user.ts';
import { createWithAccount } from '../user/user.service.ts';

export type MemberProfileInput = Omit<IMember, 'createdAt' | 'updatedAt' | 'isActive' | 'joinedAt'> &
  Partial<Pick<IMember, 'joinedAt'>>;

export type UpdateMemberInput = Partial<Omit<IMember, 'createdAt' | 'updatedAt'>>;

export interface CreateMemberInput extends MemberProfileInput {
  /** The login email. Also stored on the profile when none is given separately. */
  accountEmail: string;
  /** Null or omitted: the account exists but cannot log in until a password is set. */
  password?: string | null;
}

export interface ListMembersFilter {
  search?: string;
  isActive?: boolean;
}

/**
 * Registers a member and the 'member' login that points at it.
 *
 * Duplicate names are allowed through: two people genuinely share a name, and
 * refusing to register a real person is the worse failure.
 */
export async function createMember(
  input: CreateMemberInput,
): Promise<{ profile: MemberDocument; user: UserDocument }> {
  const { accountEmail, password, ...profile } = input;

  return createWithAccount({ email: accountEmail, password }, 'member', () =>
    Member.create({ ...profile, email: profile.email ?? accountEmail }),
  );
}

function buildFilter({ search, isActive }: ListMembersFilter): QueryFilter<IMember> {
  const filter: QueryFilter<IMember> = {};
  if (isActive !== undefined) filter.isActive = isActive;

  if (search !== undefined) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ firstName: pattern }, { lastName: pattern }, { email: pattern }];
  }
  return filter;
}

export function listMembers(
  filter: ListMembersFilter,
  { limit, skip }: Pagination,
): Promise<MemberDocument[]> {
  return Member.find(buildFilter(filter))
    .sort({ lastName: 1, firstName: 1 })
    .skip(skip)
    .limit(limit)
    .exec();
}

export function countMembers(filter: ListMembersFilter): Promise<number> {
  return Member.countDocuments(buildFilter(filter)).exec();
}

export async function requireMemberById(id: string): Promise<MemberDocument> {
  const member = await Member.findById(id).exec();
  if (!member) throw notFound('MEMBER_NOT_FOUND', `No member with id ${id}`);
  return member;
}

export async function updateMember(
  id: string,
  patch: UpdateMemberInput,
): Promise<MemberDocument> {
  const member = await requireMemberById(id);
  member.set(patch);
  return member.save();
}

/**
 * Members are deactivated, never deleted: their attendance and assessments stay
 * meaningful and must keep pointing at a real profile.
 */
export async function setMemberActive(id: string, isActive: boolean): Promise<MemberDocument> {
  const member = await requireMemberById(id);
  member.isActive = isActive;
  return member.save();
}

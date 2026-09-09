import { Member, nameSearchFilter, type MemberDocument } from '../../models/member.ts';
import { isValidObjectId, type QueryFilter } from 'mongoose';
import type { IMember } from '../../models/member.ts';

export type MemberErrorCode = 'MEMBER_NOT_FOUND';

export class MemberError extends Error {
  readonly code: MemberErrorCode;

  constructor(code: MemberErrorCode, message: string) {
    super(message);
    this.name = 'MemberError';
    this.code = code;
  }
}

export interface CreateMemberInput {
  firstName: string;
  lastName: string;
}

export interface ListMembersOptions {
  search?: string;
  limit?: number;
  skip?: number;
}

/**
 * Two people can genuinely share a name, so duplicates are allowed through
 * rather than refusing to register a real person.
 */
export function createMember(input: CreateMemberInput): Promise<MemberDocument> {
  return Member.create({ firstName: input.firstName, lastName: input.lastName });
}

function buildFilter(search: string | undefined): QueryFilter<IMember> {
  return search !== undefined && search.trim() !== '' ? nameSearchFilter(search) : {};
}

export function listMembers(options: ListMembersOptions = {}): Promise<MemberDocument[]> {
  const { search, limit = 50, skip = 0 } = options;

  return Member.find(buildFilter(search))
    .sort({ lastName: 1, firstName: 1 })
    .skip(skip)
    .limit(limit)
    .exec();
}

export function countMembers(options: Pick<ListMembersOptions, 'search'> = {}): Promise<number> {
  return Member.countDocuments(buildFilter(options.search)).exec();
}

export async function getMemberById(id: string): Promise<MemberDocument | null> {
  if (!isValidObjectId(id)) return null;
  return Member.findById(id).exec();
}

export async function requireMemberById(id: string): Promise<MemberDocument> {
  const member = await getMemberById(id);
  if (!member) {
    throw new MemberError('MEMBER_NOT_FOUND', `No member with id ${id}`);
  }
  return member;
}

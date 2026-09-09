import { Member, nameSearchFilter, type MemberDocument } from '../../models/member.ts';
import { isValidObjectId, type QueryFilter } from 'mongoose';
import type { IMember } from '../../models/member.ts';
import type { UserDocument } from '../../models/user.ts';
import { assertUserCreatable, createUser } from '../user/user.service.ts';

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
  email: string;
  /** Null or omitted: the account exists but cannot log in until a password is set. */
  password?: string | null;
}

export interface RegisteredMember {
  member: MemberDocument;
  user: UserDocument;
}

export interface ListMembersOptions {
  search?: string;
  limit?: number;
  skip?: number;
}

/**
 * Registers a member and the 'member' account that points at it.
 *
 * Two collections, and a standalone mongod has no transactions, so this checks
 * everything it can up front and compensates with a delete if the account
 * still fails. A member is never left without its account.
 *
 * Two people can genuinely share a name, so duplicate names are allowed
 * through rather than refusing to register a real person.
 */
export async function createMember(input: CreateMemberInput): Promise<RegisteredMember> {
  const account = {
    email: input.email,
    password: input.password ?? null,
    role: 'member' as const,
  };

  // Fails on a weak password or a taken email before anything is written.
  await assertUserCreatable(account);

  const member = await Member.create({
    firstName: input.firstName,
    lastName: input.lastName,
  });

  try {
    const user = await createUser({ ...account, memberId: member.id });
    return { member, user };
  } catch (error) {
    // Lost a race on the email, or the account write failed: undo the member.
    try {
      await Member.deleteOne({ _id: member._id }).exec();
    } catch (rollbackError) {
      console.error(`Failed to roll back member ${member.id}:`, rollbackError);
    }
    throw error;
  }
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

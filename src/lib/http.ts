import { zValidator } from '@hono/zod-validator';
import { isValidObjectId } from 'mongoose';
import { z, type ZodType } from 'zod';
import { badRequest } from './errors.ts';

/** A string that Mongoose will accept as an ObjectId. */
export const objectId = z.string().refine(isValidObjectId, 'must be a valid id');

export const idParam = z.object({ id: objectId });

export const MAX_PAGE_SIZE = 200;

export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export type Pagination = z.infer<typeof pagination>;

/** Uniform list envelope. `total` is the full match count, not the page size. */
export interface Page<T> {
  data: T[];
  total: number;
  limit: number;
  skip: number;
}

export function page<T>(data: T[], total: number, { limit, skip }: Pagination): Page<T> {
  return { data, total, limit, skip };
}

/** Structural, so it accepts the error from both zValidator and safeParse. */
function issueDetails(error: {
  issues: readonly { path: PropertyKey[]; message: string }[];
}): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/** Wraps zValidator so validation failures share the error shape of AppError. */
export function validate<T extends ZodType>(target: 'json' | 'query' | 'param', schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED',
          error: `Invalid request ${target}`,
          details: issueDetails(result.error),
        },
        400,
      );
    }
  });
}

/** For bodies read by hand rather than through `validate`. */
export function parseOrThrow<T extends ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest('VALIDATION_FAILED', 'Invalid request json', issueDetails(result.error));
  }
  return result.data;
}

/** `.optional()` on a query string, but an empty string counts as absent. */
export const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === '' ? undefined : value));

/** Keeps a user-supplied term from being read as a regular expression. */
export function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Query strings carry 'true'/'false', not booleans. */
export const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

/** An ISO date in a query string or body. */
export const dateInput = z.coerce.date();

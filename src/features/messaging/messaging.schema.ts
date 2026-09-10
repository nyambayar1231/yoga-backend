import { z } from 'zod';

/** Falls back to something recognisable when the client sends only a body. */
export const DEFAULT_SUBJECT = 'A message from your school';

const MAX_TEXT_LENGTH = 5_000;

/** Body of POST /users/:id/email - the recipient comes from the URL. */
export const userEmailBody = z.object({
  subject: z.string().trim().min(1).max(200).default(DEFAULT_SUBJECT),
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
});

export type UserEmailInput = z.infer<typeof userEmailBody>;

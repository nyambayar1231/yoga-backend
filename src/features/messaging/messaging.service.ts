import { escapeHtml, sendEmail } from '../../lib/email.ts';
import { requireUserById } from '../user/user.service.ts';
import type { UserEmailInput } from './messaging.schema.ts';

export interface SentMessage {
  /** Resend's message id, for looking the delivery up later. */
  id: string;
  /** Echoed back so the sender can see where it actually went. */
  to: string;
}

/** Plain text is what the sender typed, so line breaks are the whole formatting. */
function toHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Sends one message to a user's account email.
 *
 * Deliberately blocking: the sender is waiting on the response and needs to
 * know whether it went out. Nothing is queued or retried beyond the single
 * retry in the Resend client.
 *
 * A deactivated account is still emailable on purpose - telling someone their
 * access was removed is exactly the kind of message this endpoint is for.
 */
export async function sendUserEmail(
  userId: string,
  { subject, text }: UserEmailInput,
): Promise<SentMessage> {
  const user = await requireUserById(userId);

  const { id } = await sendEmail({ to: user.email, subject, text, html: toHtml(text) });

  // No record of the message is kept, so the log is the only trace it happened.
  console.log(`Emailed user ${user.id} at ${user.email} (resend id ${id})`);

  return { id, to: user.email };
}

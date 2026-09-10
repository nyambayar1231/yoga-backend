/**
 * Sends one real email to prove the Resend setup works end to end.
 *
 *   npm run email:test                      # uses .env as is
 *   npm run email:test -- someone@else.com  # different recipient
 *   NODE_ENV=production npm run email:test  # refuse to no-op if the key is missing
 *
 * No database involved - this only exercises src/lib/email.ts.
 */

import { EmailError, isValidEmail, sendEmail } from '../lib/email.ts';

const DEFAULT_TO = 'nyambayarlucky@gmail.com';

/** argv[2] wins, then TEST_EMAIL_TO, then the default. */
const to = process.argv[2] ?? process.env.TEST_EMAIL_TO ?? DEFAULT_TO;

const sentAt = new Date().toISOString();

async function main(): Promise<void> {
  if (!isValidEmail(to)) {
    throw new EmailError('INVALID_EMAIL', `${to} is not a valid address`);
  }

  const from = process.env.EMAIL_FROM ?? '(EMAIL_FROM not set)';
  const hasKey = Boolean(process.env.RESEND_API_KEY);

  console.log('Sending test email');
  console.log(`  NODE_ENV: ${process.env.NODE_ENV ?? '(unset)'}`);
  console.log(`  from:     ${from}`);
  console.log(`  to:       ${to}`);
  console.log(`  api key:  ${hasKey ? 'set' : 'MISSING'}`);

  const { id } = await sendEmail({
    to,
    subject: `yoga-cms test email (${sentAt})`,
    text: [
      'This is a test email from yoga-cms-backend.',
      '',
      `Sent at: ${sentAt}`,
      `From:    ${from}`,
      '',
      'If you are reading this, Resend is configured correctly.',
    ].join('\n'),
    html: [
      '<p>This is a test email from <strong>yoga-cms-backend</strong>.</p>',
      `<p>Sent at: <code>${sentAt}</code><br>From: <code>${escapeHtml(from)}</code></p>`,
      '<p>If you are reading this, Resend is configured correctly.</p>',
    ].join(''),
  });

  // The dev path returns this instead of sending, which is easy to mistake for success.
  if (id === 'dev-not-sent') {
    console.warn('\nNothing was sent: RESEND_API_KEY is empty and NODE_ENV is not production.');
    console.warn('Put your key in .env, or re-run with NODE_ENV=production to make this fail loudly.');
    process.exitCode = 1;
    return;
  }

  console.log(`\nSent. Resend message id: ${id}`);
  console.log('Check https://resend.com/emails for its delivery status.');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

try {
  await main();
} catch (error) {
  if (error instanceof EmailError) {
    const status = error.status !== undefined ? ` (HTTP ${error.status})` : '';
    console.error(`\nSend failed [${error.code}]${status}: ${error.message}`);

    if (error.status === 403) {
      console.error(
        'With onboarding@resend.dev you can only email the address your Resend account uses.',
      );
    }
  } else {
    console.error('\nSend failed:', error);
  }
  process.exitCode = 1;
}

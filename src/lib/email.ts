/**
 * Minimal Resend client. https://resend.com/docs/api-reference/emails/send-email
 *
 * Deliberately a plain `fetch` call instead of the SDK: it is one endpoint, and
 * this keeps the dependency tree (and the surface we have to trust) small.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Resend allows 2 requests/second by default, so a slow reply is worth waiting for. */
const REQUEST_TIMEOUT_MS = 10_000;

/** One retry only: enough for a rate limit or a blip, not enough to pile up. */
const RETRY_DELAY_MS = 1_000;

export type EmailErrorCode = 'NOT_CONFIGURED' | 'INVALID_EMAIL' | 'SEND_FAILED';

export class EmailError extends Error {
  readonly code: EmailErrorCode;
  /** HTTP status from Resend, when the failure came from them. */
  readonly status?: number;

  constructor(code: EmailErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'EmailError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

/** Deliberately loose: the real check is whether mail to it bounces. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Accepts a bare address or a `Name <addr@example.com>` form. */
export function isValidEmail(address: string): boolean {
  const bare = address.trim().replace(/^.*<([^>]+)>$/, '$1');
  return EMAIL_PATTERN.test(bare.trim());
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  /** At least one of `html` or `text` is required. Send both when you can. */
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  /** Overrides EMAIL_FROM. Must be an address on a domain verified in Resend. */
  from?: string;
}

export interface SentEmail {
  id: string;
}

function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => v.trim()).filter((v) => v !== '');
}

function assertAddresses(field: string, addresses: string[]): void {
  for (const address of addresses) {
    if (!isValidEmail(address)) {
      throw new EmailError('INVALID_EMAIL', `${field} contains an invalid address: ${address}`);
    }
  }
}

/**
 * Without an API key we do not send. In development that is normal - the email
 * is printed so you can see what would have gone out - but in production a
 * missing key is a misconfiguration and must not fail silently.
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Sends one email and returns Resend's message id.
 * Throws EmailError on bad input, misconfiguration, or a rejected send.
 */
export async function sendEmail(input: SendEmailInput): Promise<SentEmail> {
  const to = toList(input.to);
  const cc = toList(input.cc);
  const bcc = toList(input.bcc);
  const replyTo = toList(input.replyTo);

  if (to.length === 0) {
    throw new EmailError('INVALID_EMAIL', 'At least one recipient is required');
  }
  assertAddresses('to', to);
  assertAddresses('cc', cc);
  assertAddresses('bcc', bcc);
  assertAddresses('replyTo', replyTo);

  if (input.subject.trim() === '') {
    throw new EmailError('SEND_FAILED', 'subject is required');
  }
  if (!input.html && !input.text) {
    throw new EmailError('SEND_FAILED', 'Either html or text is required');
  }

  const from = input.from ?? process.env.EMAIL_FROM;
  if (!from) {
    throw new EmailError('NOT_CONFIGURED', 'EMAIL_FROM is not set (load it from .env)');
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (isProduction()) {
      throw new EmailError('NOT_CONFIGURED', 'RESEND_API_KEY is not set');
    }
    console.warn(`[email] RESEND_API_KEY not set - not sending. To: ${to.join(', ')} | Subject: ${input.subject}`);
    return { id: 'dev-not-sent' };
  }

  const payload = {
    from,
    to,
    subject: input.subject,
    ...(input.html !== undefined ? { html: input.html } : {}),
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(cc.length > 0 ? { cc } : {}),
    ...(bcc.length > 0 ? { bcc } : {}),
    // The REST API is snake_case even though the SDK is not.
    ...(replyTo.length > 0 ? { reply_to: replyTo } : {}),
  };

  return post(apiKey, payload);
}

async function post(apiKey: string, payload: unknown, isRetry = false): Promise<SentEmail> {
  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Network error or timeout: worth one retry, then give up.
    if (!isRetry) return retry(apiKey, payload);
    throw new EmailError('SEND_FAILED', `Could not reach Resend: ${String(error)}`);
  }

  if (response.ok) {
    const body = (await response.json()) as { id?: string };
    if (!body.id) {
      throw new EmailError('SEND_FAILED', 'Resend accepted the email but returned no id');
    }
    return { id: body.id };
  }

  // Rate limited or Resend is having a bad minute: one retry. A 4xx from our
  // own payload will fail identically the second time, so it is not retried.
  if (!isRetry && (response.status === 429 || response.status >= 500)) {
    return retry(apiKey, payload);
  }

  throw new EmailError('SEND_FAILED', await describeFailure(response), response.status);
}

function retry(apiKey: string, payload: unknown): Promise<SentEmail> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      post(apiKey, payload, true).then(resolve, reject);
    }, RETRY_DELAY_MS);
  });
}

/** Resend returns `{ name, message, statusCode }`, but not for every failure. */
async function describeFailure(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; name?: string };
    if (body.message) {
      return `Resend rejected the email (${response.status}): ${body.message}`;
    }
  } catch {
    // fall through to the bare status
  }
  return `Resend rejected the email (${response.status} ${response.statusText})`;
}

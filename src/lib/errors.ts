import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Every expected failure is an AppError. The handler registered in app.ts turns
 * it into a JSON response, so controllers do not need try/catch around services.
 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details: unknown;

  constructor(status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code: string, message: string, details?: unknown): AppError =>
  new AppError(400, code, message, details);

export const unauthorized = (message = 'Not authenticated'): AppError =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = 'You may not perform this action'): AppError =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (code: string, message: string): AppError =>
  new AppError(404, code, message);

export const conflict = (code: string, message: string): AppError =>
  new AppError(409, code, message);

/**
 * A failure the user caused and can fix, as opposed to one we caused.
 *
 * The difference matters for what gets printed: a CliError prints its message
 * and its hint and nothing else, because a stack trace through esbuild tells
 * someone who forgot to run `ganju login` nothing at all. Anything that is not
 * a CliError keeps its stack, since that one really is a bug in here.
 */
export class CliError extends Error {
  readonly hint?: string;
  readonly exitCode: number;

  constructor(
    message: string,
    options: { hint?: string; exitCode?: number } = {}
  ) {
    super(message);
    this.name = 'CliError';
    this.hint = options.hint;
    this.exitCode = options.exitCode ?? 1;
  }
}

export const isCliError = (error: unknown): error is CliError =>
  error instanceof CliError;

/**
 * A failure the API answered with. Most commands only print it; the few that
 * can do something about it (a stale row version, a table busy copying) read
 * its `code` and `details`.
 */
export class ApiError extends CliError {
  readonly status: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;
  // Seconds, from a 429's Retry-After.
  readonly retryAfter?: number;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string;
      details?: Record<string, unknown>;
      retryAfter?: number;
      hint?: string;
    }
  ) {
    super(message, { hint: options.hint });
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.retryAfter = options.retryAfter;
  }
}

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof ApiError;

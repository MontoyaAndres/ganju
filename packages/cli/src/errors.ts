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

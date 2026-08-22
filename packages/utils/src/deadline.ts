// Bound how long we wait for a dispatched user script, without handing the
// binding an AbortSignal.
//
// The obvious version — `fetch(url, { signal })` on a Fetcher from a dispatch
// namespace — works when the binding is in the same process and fails when it is
// not: `AbortSignal serialization is not enabled`. A local `wrangler dev` proxies
// the dispatch namespace to the remote account, so every test run and every tool
// call raised that instead of running, while the deployed Worker was fine. A
// timeout that only works in production is worse than no timeout, because it
// breaks the environment where people are actually writing the code.
//
// What is lost by racing instead of aborting: the isolate keeps running after we
// stop waiting for it. That is what the per-script `limits.cpu_ms` ceiling is
// for, and this deadline was never a cost control — it bounds how long a person
// watches a spinner.
export class DeadlineError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    // Named the way an aborted fetch is, so a call site that already branches on
    // the name keeps reading the same way.
    this.name = 'TimeoutError';
  }
}

export const withDeadline = async <T>(
  work: Promise<T>,
  ms: number
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DeadlineError(ms)), ms);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export const isDeadlineError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'TimeoutError';

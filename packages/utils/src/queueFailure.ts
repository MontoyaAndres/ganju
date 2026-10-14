// How a failed queue job is handled: retried, given up on, or reported. Kept
// apart from processQueueBatch, which applies it, so the decision is testable
// on its own.

// A failure that no retry can fix — a credential that needs the user to
// reconnect, a resource that no longer exists. The job is reported once and
// acknowledged rather than retried into the dead-letter queue. Recognised by
// its `permanent` flag rather than its class, so an error built by another
// copy of this module still counts.
export class PermanentJobError extends Error {
  readonly permanent = true;

  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

export const isPermanentJobError = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  (error as { permanent?: unknown }).permanent === true;

export type QueueFailureKind =
  | 'permanent'
  | 'transient'
  | 'rateLimit'
  | 'other';

export interface QueueFailurePlan {
  // Hand the failure to the job's onError, which reports it.
  report: boolean;
  // No delivery follows this one: the job's work may be marked failed.
  final: boolean;
  // What to tell the queue about this message.
  action: 'ack' | 'retry';
  // Which backoff a retry waits out; null for the queue's default.
  backoff: 'transient' | 'rateLimit' | null;
}

// `attempts` is the queue's own count, 1 on the first delivery; a consumer
// with `maxRetries` retries gets maxRetries + 1 deliveries in all.
export const planQueueFailure = (
  kind: QueueFailureKind,
  attempts: number | undefined,
  maxRetries: number
): QueueFailurePlan => {
  if (kind === 'permanent') {
    return { report: true, final: true, action: 'ack', backoff: null };
  }
  const final = (attempts ?? 1) > maxRetries;
  if (kind === 'transient') {
    // A platform hiccup is retried quietly; only the last one is worth a
    // report, since nothing will run the job after it.
    return { report: final, final, action: 'retry', backoff: 'transient' };
  }
  return {
    report: true,
    final,
    action: 'retry',
    backoff: kind === 'rateLimit' ? 'rateLimit' : null
  };
};

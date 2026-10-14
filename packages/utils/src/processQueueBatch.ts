import { isRateLimitError, isTransientInfraError } from './retry';
import { constants } from './constants';
import { isPermanentJobError, planQueueFailure } from './queueFailure';
import type { QueueFailureKind } from './queueFailure';

export interface QueueMessageLike<T> {
  body: T;
  // Deliveries so far, including this one (Cloudflare Queues' `attempts`).
  attempts?: number;
  ack: () => void;
  retry: (opts?: { delaySeconds?: number }) => void;
}

export interface QueueBatchLike<T> {
  queue: string;
  messages: readonly QueueMessageLike<T>[];
}

export interface QueueFailureContext {
  // No delivery follows this one — the moment to mark the work failed. Before
  // it, a retry may still succeed, and a status flipped to failed in between
  // would show a resource as broken while it is being fixed.
  final: boolean;
}

export interface ProcessQueueBatchHandlers<T> {
  process: (body: T) => Promise<void>;
  onError: (
    error: unknown,
    body: T,
    queueName: string,
    context: QueueFailureContext
  ) => Promise<void>;
  // The consumer's configured `max_retries`.
  maxRetries?: number;
}

const failureKind = (error: unknown): QueueFailureKind => {
  if (isPermanentJobError(error)) return 'permanent';
  if (isTransientInfraError(error)) return 'transient';
  if (isRateLimitError(error)) return 'rateLimit';
  return 'other';
};

export const processQueueBatch = async <T>(
  batch: QueueBatchLike<T>,
  handlers: ProcessQueueBatchHandlers<T>
): Promise<void> => {
  const maxRetries = handlers.maxRetries ?? constants.QUEUE_MAX_RETRIES;
  for (const message of batch.messages) {
    try {
      await handlers.process(message.body);
      message.ack();
    } catch (error) {
      const plan = planQueueFailure(
        failureKind(error),
        message.attempts,
        maxRetries
      );
      if (plan.report) {
        await handlers.onError(error, message.body, batch.queue, {
          final: plan.final
        });
      }
      if (plan.action === 'ack') {
        message.ack();
      } else if (plan.backoff === 'transient') {
        message.retry({ delaySeconds: constants.TRANSIENT_BACKOFF_SECONDS });
      } else if (plan.backoff === 'rateLimit') {
        message.retry({ delaySeconds: constants.RATE_LIMIT_BACKOFF_SECONDS });
      } else {
        message.retry();
      }
    }
  }
};

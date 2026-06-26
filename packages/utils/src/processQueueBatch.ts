import { isRateLimitError, isTransientInfraError } from './retry';
import { constants } from './constants';

export interface QueueMessageLike<T> {
  body: T;
  ack: () => void;
  retry: (opts?: { delaySeconds?: number }) => void;
}

export interface QueueBatchLike<T> {
  queue: string;
  messages: readonly QueueMessageLike<T>[];
}

export interface ProcessQueueBatchHandlers<T> {
  process: (body: T) => Promise<void>;
  onError: (error: unknown, body: T, queueName: string) => Promise<void>;
}

export const processQueueBatch = async <T>(
  batch: QueueBatchLike<T>,
  handlers: ProcessQueueBatchHandlers<T>
): Promise<void> => {
  for (const message of batch.messages) {
    try {
      await handlers.process(message.body);
      message.ack();
    } catch (error) {
      if (isTransientInfraError(error)) {
        // Transient Cloudflare platform hiccup (e.g. a Durable Object /
        // Container reset). The job itself is fine, so re-run it after a short
        // backoff without reporting an error or marking the work failed.
        message.retry({ delaySeconds: constants.TRANSIENT_BACKOFF_SECONDS });
        continue;
      }
      await handlers.onError(error, message.body, batch.queue);
      if (isRateLimitError(error)) {
        message.retry({
          delaySeconds: constants.RATE_LIMIT_BACKOFF_SECONDS
        });
      } else {
        message.retry();
      }
    }
  }
};

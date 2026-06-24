import { constants } from './constants';

// Thrown when an organization hits a hard plan quota. It carries an explicit
// HTTP status (402 Payment Required) and a stable `code` so the API's central
// error handler can return them verbatim and the dashboard can recognise the
// block and show an "upgrade" call-to-action instead of a generic error.
export interface PlanLimitDetails {
  // Which quota was hit — one of constants.PLAN_FEATURE_*.
  feature: string;
  // The org's current effective plan (FREE / PRO / ENTERPRISE).
  plan: string;
  // The numeric limit that was exceeded, when applicable (e.g. 5 tools).
  limit?: number | null;
  // The current usage at the time of the block.
  used?: number | null;
}

export class PlanLimitError extends Error {
  readonly status = 402;
  readonly code = constants.PLAN_LIMIT_ERROR_CODE;
  readonly feature: string;
  readonly plan: string;
  readonly limit: number | null;
  readonly used: number | null;

  constructor(message: string, details: PlanLimitDetails) {
    super(message);
    this.name = 'PlanLimitError';
    this.feature = details.feature;
    this.plan = details.plan;
    this.limit = details.limit ?? null;
    this.used = details.used ?? null;
  }

  // The extra fields merged into the JSON error body so clients get structured
  // context alongside the message.
  toBody(): Record<string, unknown> {
    return {
      code: this.code,
      feature: this.feature,
      plan: this.plan,
      limit: this.limit,
      used: this.used,
      upgrade: true
    };
  }
}

export const isPlanLimitError = (error: unknown): error is PlanLimitError =>
  error instanceof PlanLimitError;

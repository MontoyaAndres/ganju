import { v7 as uuid } from 'uuid';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

// types
import type { ZodError } from 'zod';
import type { Context } from 'hono';

export interface HandleErrorOptions {
  service: string;
  metadata?: Record<string, unknown>;
  status?: number;
  artifactResourceId?: string | null;
}

export interface HandleErrorResult {
  refId: string;
  status: 400 | 401 | 402 | 403 | 404 | 409 | 500 | 503;
  body: Record<string, unknown>;
}

interface StatusCarryingError {
  status?: unknown;
  code?: unknown;
  toBody?: () => Record<string, unknown>;
}

interface RequestContext {
  method?: string | null;
  path?: string | null;
  query?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
}

interface DbSource {
  env: { HYPERDRIVE: { connectionString: string } };
}

export type HandleErrorSource =
  | Context
  | (DbSource & { request?: RequestContext });

const matchStatus = (message: string): 400 | 401 | 403 | 404 | 409 | null => {
  const lower = message.toLowerCase();

  if (/\bnot found\b/.test(lower)) return 404;
  if (/\bunauthorized\b/.test(lower)) return 401;
  if (/\bforbidden\b/.test(lower)) return 403;
  if (/\b(unique|already|already exists|duplicate)\b/.test(lower)) return 409;
  if (
    /\b(uri|unsupported|invalid|required|exceeds|must be|remove)\b/.test(lower)
  )
    return 400;

  return null;
};

/**
 * The language to answer a failed validation in.
 *
 * `packages/utils/src/fetcher.ts` sends the app's own locale on
 * `Accept-Language`, so this is what the reader is actually looking at rather
 * than whatever their browser is configured for. Anything else — a bot, a
 * direct API call — falls through to English.
 */
const requestLanguage = (source: HandleErrorSource): string =>
  isHonoContext(source)
    ? utils.languageFromHeader(source.req.header('accept-language'))
    : utils.constants.LANGUAGE_EN;

const isHonoContext = (source: HandleErrorSource): source is Context =>
  typeof (source as Context).get === 'function' &&
  typeof (source as Context).req?.method === 'string';

const extractContext = (source: HandleErrorSource): RequestContext => {
  if (isHonoContext(source)) {
    const c = source;
    const user = (c.get('user') as { id?: string } | undefined) || undefined;
    return {
      method: c.req.method,
      path: c.req.path,
      query: new URL(c.req.url).search || null,
      userAgent: c.req.header('user-agent') || null,
      ipAddress:
        c.req.header('cf-connecting-ip') ||
        c.req.header('x-forwarded-for') ||
        null,
      userId: user?.id || null,
      organizationId: c.req.param('organizationId') || null,
      projectId: c.req.param('projectId') || null
    };
  }
  return source.request ?? {};
};

export const handleError = async (
  source: HandleErrorSource,
  error: unknown,
  options: HandleErrorOptions
): Promise<HandleErrorResult> => {
  const refId = uuid();
  const err = error as { name?: string; message?: string; stack?: string };
  const carried = error as StatusCarryingError;

  let status: HandleErrorResult['status'];
  let body: Record<string, unknown>;

  if (err?.name === 'ZodError') {
    status = 400;
    // Re-rendered here rather than at the ~100 parse sites, and only in the
    // response — the `error_log` insert below still persists `err.message`,
    // Zod's own English dump from parse time.
    const language = requestLanguage(source);
    body = {
      errors: (error as ZodError).issues.map(issue => ({
        path: issue.path?.join('.') || '',
        message: utils.localizeZodIssue(issue, language)
      }))
    };
  } else if (typeof carried.status === 'number') {
    // The error knows its own HTTP status (e.g. PlanLimitError → 402). Trust it
    // and merge any structured fields it exposes into the response body.
    status = carried.status as HandleErrorResult['status'];
    body = {
      error: err?.message || String(error),
      ...(typeof carried.toBody === 'function' ? carried.toBody() : {})
    };
  } else if (options.status) {
    status = options.status as HandleErrorResult['status'];
    body = { id: refId, error: err?.message || String(error) };
  } else {
    const matched = matchStatus(err?.message || '');
    if (matched) {
      status = matched;
      body = { error: err?.message || '' };
    } else {
      status = 500;
      body = { id: refId, error: 'Internal Server Error' };
    }
  }

  const ctx = extractContext(source);
  const dbInstance = db.create(source);
  await dbInstance
    .insert(db.schema.errorLog)
    .values({
      service: options.service,
      referenceId: refId,
      name: err?.name || 'Error',
      message: err?.message || String(error),
      stack: err?.stack || null,
      status,
      ...ctx,
      artifactResourceId: options.artifactResourceId ?? null,
      metadata: options.metadata ?? null
    })
    .returning()
    .then(values =>
      console.warn(`Error saved with referenceId: ${values[0].referenceId}`)
    )
    .catch(e => console.error('Failed to persist error log', e));

  return { refId, status, body };
};

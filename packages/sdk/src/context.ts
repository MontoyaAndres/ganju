// Imported from the constants module rather than the @ganju/utils barrel, and
// this is the one place in the repo where that distinction earns its keep: this
// package is bundled into every customer's uploaded script, so reaching the
// barrel would ship zod, dayjs and the cipher suite inside each of them.
import { constants } from '@ganju/utils/constants';
// Same reasoning as the constants import above: a subpath, because the barrel
// would ship zod and the cipher suite inside every customer's bundle. base64.ts
// imports nothing at all, so this costs the script twenty lines.
import { bytesToBase64 } from '@ganju/utils/base64';

import type {
  Connection,
  CreatedResource,
  CreateResourceOptions,
  DeletedResource,
  DeleteResourceOptions,
  LogEntry,
  ResourceContent,
  ResourceMatch,
  ResourceSummary,
  SendFileOptions,
  SendFileReceipt,
  ToolContext,
  ToolEnv
} from './types';

// Typed sugar over the broker service binding, and nothing more. Everything that
// matters — which providers this tool may reach, whether a token is still valid,
// which artifact is asking — is decided by the broker from the bearer token.
// A check written here would be user-editable and therefore not a check.

const readError = async (response: Response): Promise<string> => {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  const error = body?.error;
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
    return JSON.stringify(error).slice(0, 500);
  }
  return `the broker returned ${response.status}`;
};

const toBase64 = (bytes: ArrayBuffer | Uint8Array): string =>
  bytesToBase64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));

const createLogBuffer = () => {
  const entries: LogEntry[] = [];
  const push = (level: LogEntry['level'], values: unknown[]) => {
    // Dropped silently past the cap rather than throwing: losing a log line
    // should never be the reason a tool call fails.
    if (entries.length >= constants.CUSTOM_CODE_MAX_LOGS) return;
    const message = values
      .map(value =>
        typeof value === 'string' ? value : JSON.stringify(value ?? null)
      )
      .join(' ');
    entries.push({
      level,
      message: message.slice(0, constants.CUSTOM_CODE_MAX_LOG_LENGTH)
    });
  };
  return { entries, push };
};

export const createContext = (env: ToolEnv) => {
  const logs = createLogBuffer();

  const call = async <T>(path: string, body?: unknown): Promise<T> => {
    const broker = env[constants.CUSTOM_CODE_BINDING_BROKER] as
      | { fetch: (url: string, init: RequestInit) => Promise<Response> }
      | undefined;
    const token = env[constants.CUSTOM_CODE_BINDING_TOKEN] as
      string | undefined;

    if (!broker || !token) {
      throw new Error(
        'This tool is running without its Ganju bindings, so host capabilities are unavailable.'
      );
    }

    const response = await broker.fetch(
      `${constants.CUSTOM_CODE_BROKER_ORIGIN}${path}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body ?? {})
      }
    );

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    return (await response.json()) as T;
  };

  const ctx: ToolContext = {
    connection: (provider: string) =>
      call<Connection>(constants.CUSTOM_CODE_BROKER_PATH_CONNECTION, {
        provider
      }),

    secret: async (name: string) => {
      const result = await call<{ value: string }>(
        constants.CUSTOM_CODE_BROKER_PATH_SECRET,
        { name }
      );
      return result.value;
    },

    resources: {
      search: async (query: string, limit?: number) => {
        const result = await call<{ results: ResourceMatch[] }>(
          constants.CUSTOM_CODE_BROKER_PATH_RESOURCES_SEARCH,
          limit === undefined ? { query } : { query, limit }
        );
        return result.results;
      },
      read: (uri: string) =>
        call<ResourceContent>(
          constants.CUSTOM_CODE_BROKER_PATH_RESOURCES_READ,
          { uri }
        ),
      list: async () => {
        const result = await call<{ resources: ResourceSummary[] }>(
          constants.CUSTOM_CODE_BROKER_PATH_RESOURCES_LIST
        );
        return result.resources;
      },
      create: async (options: CreateResourceOptions) => {
        // `bytes` is accepted as binary because that is what a script actually
        // holds — a fetched response body, an encoded document — and making
        // every caller base64 it themselves would be a step nobody gets right
        // the first time. A string is passed through as already-encoded.
        const { bytes, ...rest } = options;
        const body =
          bytes === undefined
            ? rest
            : {
                ...rest,
                bytes: typeof bytes === 'string' ? bytes : toBase64(bytes)
              };

        const result = await call<{ resource: CreatedResource }>(
          constants.CUSTOM_CODE_BROKER_PATH_RESOURCES_CREATE,
          body
        );
        return result.resource;
      },
      delete: async (uri: string, options?: DeleteResourceOptions) => {
        const result = await call<{ resource: DeletedResource }>(
          constants.CUSTOM_CODE_BROKER_PATH_RESOURCES_DELETE,
          { uri, children: options?.children ?? false }
        );
        return result.resource;
      }
    },

    sendFile: async (options: SendFileOptions) => {
      const { result } = await call<{ result: SendFileReceipt }>(
        constants.CUSTOM_CODE_BROKER_PATH_SEND_FILE,
        options
      );
      return result;
    },

    log: (...values: unknown[]) => logs.push('log', values)
  };

  return { ctx, logs: logs.entries };
};

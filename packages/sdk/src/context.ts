// Imported from the constants module rather than the @ganju/utils barrel, and
// this is the one place in the repo where that distinction earns its keep: this
// package is bundled into every customer's uploaded script, so reaching the
// barrel would ship zod, dayjs and the cipher suite inside each of them.
import { constants } from '@ganju/utils/constants';

import type {
  Connection,
  LogEntry,
  ResourceContent,
  ResourceMatch,
  ResourceSummary,
  SendFileOptions,
  ToolContext,
  ToolEnv
} from './types';

// Typed sugar over the broker service binding, and nothing more. Everything that
// matters — which providers this tool may reach, whether a token is still valid,
// which artifact is asking — is decided by the broker from the bearer token.
// A check written here would be user-editable and therefore not a check.

const readError = async (response: Response): Promise<string> => {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error || `the broker returned ${response.status}`;
};

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
      }
    },

    sendFile: (options: SendFileOptions) =>
      call<unknown>(constants.CUSTOM_CODE_BROKER_PATH_SEND_FILE, options),

    log: (...values: unknown[]) => logs.push('log', values)
  };

  return { ctx, logs: logs.entries };
};

// Both imports are narrow subpaths, and this is the one package in the repo
// where that matters: it is bundled into every customer's deployed script.
// The @ganju/utils barrel would ship zod, dayjs and the cipher suite inside each
// of them, and even the constants module — one large object literal a bundler
// cannot tree-shake — cost ~70KB to reach fourteen strings. sdkConstants holds
// exactly those, and base64.ts imports nothing at all.
import * as constants from '@ganju/utils/sdkConstants';
import { bytesToBase64 } from '@ganju/utils/base64';

import type {
  Connection,
  CreatedResource,
  ChannelsContext,
  DataContext,
  DataOperation,
  DataWhere,
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

// `callToken` is what the dispatcher signed for this call, naming the
// function it runs: ctx.data hands it to the broker, which records that
// function as the writer and applies its manifest's `data`.
export const createContext = (env: ToolEnv, callToken = '') => {
  const logs = createLogBuffer();

  const call = async <T>(path: string, body?: unknown): Promise<T> => {
    const broker = env[constants.CUSTOM_CODE_BINDING_BROKER] as
      | { fetch: (url: string, init: RequestInit) => Promise<Response> }
      | undefined;
    const token = env[constants.CUSTOM_CODE_BINDING_TOKEN] as
      | string
      | undefined;

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

  const dataCall = async <T>(op: string, args: object): Promise<T> => {
    if (!callToken) {
      throw new Error(
        'ctx.data works inside a function Ganju runs; this call came without one.'
      );
    }
    return (
      await call<{ result: T }>(constants.CUSTOM_CODE_BROKER_PATH_DATA, {
        call: callToken,
        op,
        args
      })
    ).result;
  };

  // One row by id, or the rows a filter matches.
  const target = (value: number | DataWhere) =>
    typeof value === 'number' ? { id: value } : { where: value };

  const single = async <T>(operation: DataOperation): Promise<T> => {
    const { results } = await dataCall<{ results: T[] }>('write', {
      operations: [operation]
    });
    return results[0];
  };

  const data: DataContext = {
    describe: table => dataCall('describe', table ? { table } : {}),
    query: args => dataCall('query', args),
    search: (table, text, options = {}) =>
      dataCall('query', { ...options, table, search: text }),
    insert: (async (
      table: string,
      values: Record<string, unknown> | Record<string, unknown>[]
    ) => {
      const result = await single<{ id?: number; ids?: number[] }>(
        Array.isArray(values)
          ? { op: 'insert', table, rows: values }
          : { op: 'insert', table, values }
      );
      return Array.isArray(values)
        ? { ids: result.ids ?? [] }
        : { id: result.id as number };
    }) as DataContext['insert'],
    update: async (table, which, set, options = {}) => {
      const guard = options.where;
      const base = target(which);
      const where = 'where' in base ? { ...base.where, ...guard } : guard;
      const result = await single<{ changed: number }>({
        op: 'update',
        table,
        set,
        ...('id' in base ? { id: base.id } : {}),
        ...(where ? { where } : {}),
        ...(options.expect !== undefined ? { expect: options.expect } : {})
      });
      return { changed: result.changed };
    },
    delete: async (table, which, options = {}) => {
      const guard = options.where;
      const base = target(which);
      const where = 'where' in base ? { ...base.where, ...guard } : guard;
      const result = await single<{ changed: number }>({
        op: 'delete',
        table,
        ...('id' in base ? { id: base.id } : {}),
        ...(where ? { where } : {}),
        ...(options.expect !== undefined ? { expect: options.expect } : {})
      });
      return { changed: result.changed };
    },
    write: operations => dataCall('write', { operations }),
    run: (name, params = {}, options = {}) =>
      dataCall('run', { name, params, ...options })
  };

  const channelCall = async <T>(path: string, body: object): Promise<T> => {
    if (!callToken) {
      throw new Error(
        'ctx.channels works inside a function Ganju runs; this call came without one.'
      );
    }
    return (await call<{ result: T }>(path, { call: callToken, ...body }))
      .result;
  };

  const channels: ChannelsContext = {
    send: message =>
      channelCall(constants.CUSTOM_CODE_BROKER_PATH_CHANNELS_SEND, message),
    post: message =>
      channelCall(constants.CUSTOM_CODE_BROKER_PATH_CHANNELS_POST, message)
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

    data,

    channels,

    log: (...values: unknown[]) => logs.push('log', values)
  };

  return { ctx, logs: logs.entries };
};

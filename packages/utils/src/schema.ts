import { z } from 'zod';

import { constants } from './constants';
import { isReservedSlug, isValidSlugFormat } from './slug';
import { isReservedToolName } from './reservedToolName';
import { slugifyTitle } from './slugifyTitle';

// A prompt title becomes a slash command; it must not collide with a command
// the channel runner handles itself (e.g. `/link`).
const PROMPT_TITLE = z
  .string()
  .min(3)
  .max(200)
  .refine(
    title => !constants.RESERVED_BOT_COMMANDS.includes(slugifyTitle(title)),
    { message: 'This title is reserved as a bot command' }
  );

const SCHEMA_DEFINITION = z.object({
  type: z.enum(constants.SCHEMA_DEFINITION_TYPES),
  properties: z.record(z.string(), z.any()).optional(),
  required: z.array(z.string()).optional(),
  items: z.any().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  enum: z.array(z.any()).optional()
});

const ORGANIZATION_CREATE = z.object({
  userId: z.uuid(),
  name: z.string().min(3).max(100),
  projectName: z.string().min(3).max(100),
  projectDescription: z.string().max(500)
});

const ORGANIZATION_CREATE_VIEW = z.object({
  name: z.string().min(3).max(100),
  projectName: z.string().min(3).max(100),
  projectDescription: z.string().max(500)
});

const ORGANIZATION_UPDATE = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string().min(3).max(100)
});

const ORGANIZATION_GET = z.object({
  id: z.uuid(),
  userId: z.uuid()
});

const AUTH_USER_GET = z.object({
  userId: z.uuid()
});

const PROJECT_CREATE = z.object({
  userId: z.uuid(),
  organizationId: z.uuid(),
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional()
});

const PROJECT_CREATE_VIEW = PROJECT_CREATE.omit({
  userId: true,
  organizationId: true
});

const PROJECT_UPDATE = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid(),
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional()
});

const PROJECT_GET = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  userId: z.uuid()
});

// Trim + lowercase before validating so invitations match regardless of how
// the inviter typed the address (membership lookups compare lowercased email).
const INVITATION_EMAIL = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }).max(254));

// Marketing-site contact form. `company_url` is a honeypot — a hidden field
// real users leave empty; the controller drops the submission if it's filled.
const CONTACT_MESSAGE = z.object({
  name: z.string().trim().min(1).max(constants.CONTACT_MAX_NAME_LENGTH),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      z
        .email({ message: 'Enter a valid email address' })
        .max(constants.CONTACT_MAX_EMAIL_LENGTH)
    ),
  message: z
    .string()
    .trim()
    .min(constants.CONTACT_MIN_MESSAGE_LENGTH)
    .max(constants.CONTACT_MAX_MESSAGE_LENGTH),
  company_url: z.string().optional()
});

const ORGANIZATION_INVITATION_CREATE = z.object({
  email: INVITATION_EMAIL,
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ORGANIZATION_INVITATION_CREATE_VIEW = ORGANIZATION_INVITATION_CREATE.omit(
  {
    userId: true,
    organizationId: true
  }
);

const ORGANIZATION_INVITATION_LIST = z.object({
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ORGANIZATION_INVITATION_REMOVE = z.object({
  invitationId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const PROJECT_INVITATION_CREATE = z.object({
  email: INVITATION_EMAIL,
  userId: z.uuid(),
  organizationId: z.uuid(),
  projectId: z.uuid()
});

const PROJECT_INVITATION_CREATE_VIEW = PROJECT_INVITATION_CREATE.omit({
  userId: true,
  organizationId: true,
  projectId: true
});

const PROJECT_INVITATION_LIST = z.object({
  userId: z.uuid(),
  organizationId: z.uuid(),
  projectId: z.uuid()
});

const PROJECT_INVITATION_REMOVE = z.object({
  invitationId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid(),
  projectId: z.uuid()
});

// Invitee acting on one of their own pending invitations. No org/project id —
// the invitation is matched to the caller by id + session email.
const INVITATION_RESPOND = z.object({
  invitationId: z.uuid(),
  userId: z.uuid(),
  action: z.enum(constants.INVITATION_RESPONSES)
});

const INVITATION_GET_BY_TOKEN = z.object({
  token: z.string().min(8).max(128)
});

const ORGANIZATION_MEMBER_LIST = z.object({
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ORGANIZATION_MEMBER_REMOVE = z.object({
  memberUserId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const PROJECT_MEMBER_LIST = z.object({
  userId: z.uuid(),
  organizationId: z.uuid(),
  projectId: z.uuid()
});

const PROJECT_MEMBER_REMOVE = z.object({
  memberUserId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid(),
  projectId: z.uuid()
});

const ARTIFACT_CREATE_PROMPT = z.object({
  title: PROMPT_TITLE,
  description: z.string().max(1000).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(constants.ROLE_MESSAGES),
        content: z.string()
      })
    )
    .min(1),
  schema: SCHEMA_DEFINITION,
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_UPDATE_PROMPT = z.object({
  promptId: z.uuid(),
  title: PROMPT_TITLE,
  description: z.string().max(1000).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(constants.ROLE_MESSAGES),
        content: z.string()
      })
    )
    .min(1),
  schema: SCHEMA_DEFINITION,
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_REMOVE_PROMPT = z.object({
  promptId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_GET_PROMPT = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const CRAWL_CONFIG = z.object({
  maxPages: z
    .number()
    .int()
    .min(1)
    .max(constants.CRAWL_MAX_PAGES_LIMIT)
    .default(constants.CRAWL_DEFAULT_MAX_PAGES),
  maxDepth: z
    .number()
    .int()
    .min(0)
    .max(constants.CRAWL_MAX_DEPTH_LIMIT)
    .default(constants.CRAWL_DEFAULT_MAX_DEPTH)
});

const ARTIFACT_CREATE_WEBSITE_VIEW = z.object({
  title: z.string().min(3).max(200),
  uri: z
    .url('Enter a valid URL')
    .refine(
      v => /^https?:\/\//i.test(v),
      'Only http and https URLs are supported'
    ),
  description: z.string().optional(),
  maxPages: z.number().int().min(1).max(constants.CRAWL_MAX_PAGES_LIMIT),
  maxDepth: z.number().int().min(0).max(constants.CRAWL_MAX_DEPTH_LIMIT)
});

const ARTIFACT_CREATE_WEBSITE = z.object({
  title: z.string().min(3).max(200),
  uri: z
    .url('Enter a valid URL')
    .refine(
      v => /^https?:\/\//i.test(v),
      'Only http and https URLs are supported'
    ),
  description: z.string().optional(),
  crawlConfig: z.object({
    maxPages: z.number().int().min(1).max(constants.CRAWL_MAX_PAGES_LIMIT),
    maxDepth: z.number().int().min(0).max(constants.CRAWL_MAX_DEPTH_LIMIT)
  }),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_UPDATE_WEBSITE_VIEW = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional()
});

const ARTIFACT_UPDATE_WEBSITE = ARTIFACT_UPDATE_WEBSITE_VIEW.extend({
  resourceId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const GOOGLE_DRIVE_ITEM = z.object({
  fileId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  isFolder: z.boolean().default(false),
  iconLink: z.string().optional(),
  webViewLink: z.string().optional(),
  modifiedTime: z.string().optional(),
  size: z.coerce.number().int().optional()
});

const ARTIFACT_CREATE_GOOGLE_DRIVE_VIEW = z.object({
  items: z.array(GOOGLE_DRIVE_ITEM)
});

const ARTIFACT_CREATE_GOOGLE_DRIVE = ARTIFACT_CREATE_GOOGLE_DRIVE_VIEW.extend({
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_SYNC_GOOGLE_DRIVE = z.object({
  resourceId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ONE_DRIVE_ITEM = z.object({
  itemId: z.string(),
  driveId: z.string().optional(),
  name: z.string(),
  mimeType: z.string().optional(),
  isFolder: z.boolean().default(false),
  webUrl: z.string().optional(),
  lastModifiedDateTime: z.string().optional(),
  size: z.coerce.number().int().optional()
});

const ARTIFACT_CREATE_ONE_DRIVE_VIEW = z.object({
  items: z.array(ONE_DRIVE_ITEM)
});

const ARTIFACT_CREATE_ONE_DRIVE = ARTIFACT_CREATE_ONE_DRIVE_VIEW.extend({
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_SYNC_ONE_DRIVE = z.object({
  resourceId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_CREATE_RESOURCE = z.object({
  title: z.string().min(3).max(200),
  uri: z.string(),
  type: z
    .enum(constants.RESOURCE_TYPES)
    .default(constants.RESOURCE_TYPE_STATIC),
  sourceType: z
    .enum(constants.RESOURCE_SOURCE_TYPES)
    .default(constants.RESOURCE_SOURCE_TYPE_FILE),
  description: z.string().max(1000).optional(),
  mimeType: z.enum(constants.MIMETYPES, {
    message: 'Unsupported mime type'
  }),
  content: z.string().optional(),
  size: z
    .number()
    .int()
    .min(0)
    .max(constants.MAX_FILE_SIZE, {
      message: `File size exceeds the ${constants.MAX_FILE_SIZE / (1024 * 1024)}MB limit`
    })
    .optional(),
  encoding: z.string().max(50).optional(),
  fileKey: z.string().optional(),
  fileName: z.string().optional(),
  annotations: z
    .object({
      audience: z.array(z.enum(constants.ROLE_MESSAGES)).optional(),
      priority: z.number().min(0).max(1).optional(),
      lastModified: z.string().datetime().optional()
    })
    .optional(),
  icons: z
    .array(
      z.object({
        src: z.string(),
        mimeType: z.string().optional(),
        sizes: z.array(z.string()).optional(),
        theme: z.enum(constants.RESOURCE_ICON_THEMES).optional()
      })
    )
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  crawlConfig: CRAWL_CONFIG.optional(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_UPDATE_RESOURCE = z.object({
  resourceId: z.uuid(),
  title: z.string().min(3).max(200),
  uri: z.string(),
  type: z
    .enum(constants.RESOURCE_TYPES)
    .default(constants.RESOURCE_TYPE_STATIC),
  sourceType: z
    .enum(constants.RESOURCE_SOURCE_TYPES)
    .default(constants.RESOURCE_SOURCE_TYPE_FILE),
  description: z.string().max(1000).optional(),
  mimeType: z.enum(constants.MIMETYPES, {
    message: 'Unsupported mime type'
  }),
  content: z.string().optional(),
  size: z
    .number()
    .int()
    .min(0)
    .max(constants.MAX_FILE_SIZE, {
      message: `File size exceeds the ${constants.MAX_FILE_SIZE / (1024 * 1024)}MB limit`
    })
    .optional(),
  encoding: z.string().max(50).optional(),
  fileKey: z.string().optional(),
  fileName: z.string().optional(),
  annotations: z
    .object({
      audience: z.array(z.enum(constants.ROLE_MESSAGES)).optional(),
      priority: z.number().min(0).max(1).optional(),
      lastModified: z.string().datetime().optional()
    })
    .optional(),
  icons: z
    .array(
      z.object({
        src: z.string(),
        mimeType: z.string().optional(),
        sizes: z.array(z.string()).optional(),
        theme: z.enum(constants.RESOURCE_ICON_THEMES).optional()
      })
    )
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_GET_RESOURCE = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_GET_RESOURCE_BY_ID = z.object({
  resourceId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_REMOVE_RESOURCE = z.object({
  resourceId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_UPLOAD_RESOURCE_FILE = z.object({
  resourceId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_DOWNLOAD_RESOURCE_FILE = z.object({
  resourceId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_CREATE_TOOL = z.object({
  toolDefinitionId: z.uuid(),
  config: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_UPDATE_TOOL = z.object({
  toolId: z.uuid(),
  config: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_GET_TOOL = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_REMOVE_TOOL = z.object({
  toolId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_GET_CREDENTIAL = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_REMOVE_CREDENTIAL = z.object({
  credentialId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

// Reads every managed OAuth provider and where the artifact stands with it.
// Same fields as the credential read above, kept separate because the two answer
// different questions — one lists stored secrets, the other lists connections
// whether or not one exists yet.
const ARTIFACT_LIST_CONNECTIONS = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_CREATE_CREDENTIAL = z.object({
  provider: z.enum(constants.CREDENTIAL_PROVIDERS),
  apiKey: z.string().min(1),
  label: z.string().trim().min(1).max(100).optional(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ORGANIZATION_LIST_LLM = z.object({
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ORGANIZATION_CREATE_LLM = z.object({
  name: z.string().min(1).max(200),
  provider: z.enum(constants.LLM_PROVIDERS),
  model: z.string().min(1).max(200),
  baseUrl: z.url().optional().or(z.literal('')),
  apiKey: z.string().min(1).max(500),
  systemPrompt: z.string().max(10000).optional(),
  config: z.record(z.string(), z.any()).optional(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ORGANIZATION_UPDATE_LLM = z.object({
  llmId: z.uuid(),
  name: z.string().min(1).max(200).optional(),
  provider: z.enum(constants.LLM_PROVIDERS).optional(),
  model: z.string().min(1).max(200).optional(),
  baseUrl: z.url().optional().or(z.literal('')).nullable(),
  apiKey: z.string().min(1).max(500).optional(),
  systemPrompt: z.string().max(10000).optional().nullable(),
  config: z.record(z.string(), z.any()).optional().nullable(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ORGANIZATION_REMOVE_LLM = z.object({
  llmId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ORGANIZATION_CREATE_LLM_VIEW = ORGANIZATION_CREATE_LLM.omit({
  userId: true,
  organizationId: true
});

const ORGANIZATION_UPDATE_LLM_VIEW = ORGANIZATION_UPDATE_LLM.omit({
  llmId: true,
  userId: true,
  organizationId: true
});

// `channel.config` is an open bag, so this stays loose — it only pins down the
// keys we actually read, and passes everything else through untouched.
// `debounceMs` is how long a burst from one participant is buffered before the
// agent answers it as a single turn; 0 disables buffering.
const CHANNEL_CONFIG = z.looseObject({
  debounceMs: z
    .number()
    .int()
    .refine(
      value =>
        value === constants.CHANNEL_DEBOUNCE_DISABLED ||
        (value >= constants.CHANNEL_DEBOUNCE_MIN_MS &&
          value <= constants.CHANNEL_DEBOUNCE_MAX_MS),
      `debounceMs must be 0 (disabled) or between ${constants.CHANNEL_DEBOUNCE_MIN_MS} and ${constants.CHANNEL_DEBOUNCE_MAX_MS} ms`
    )
    .optional()
});

const CHANNEL_CREATE = z.object({
  platform: z.enum(constants.CHANNEL_PLATFORMS),
  config: CHANNEL_CONFIG.optional(),
  credentials: z.record(z.string(), z.string()),
  llmId: z.uuid().nullable().optional(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const CHANNEL_UPDATE = z.object({
  channelId: z.uuid(),
  status: z.enum(constants.CHANNEL_STATUS).optional(),
  config: CHANNEL_CONFIG.optional(),
  credentials: z.record(z.string(), z.string()).optional(),
  llmId: z.uuid().nullable().optional(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

// Validates one artifact_tool.config of definition `http-endpoint`. Each row of
// this kind registers one named MCP tool at server boot (see apps/mcp tools
// README). Defaults are filled here so the dispatcher receives a fully-resolved
// config. Secrets are never inlined — auth references an artifact_credential by
// id (credentialId), validated as a uuid.
const HTTP_ENDPOINT_KEY_VALUE = z.object({
  name: z.string().min(1).max(256),
  value: z.string().max(8192)
});

const HTTP_ENDPOINT_AUTH = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(constants.HTTP_ENDPOINT_AUTH_KIND_NONE) }),
  z.object({
    kind: z.literal(constants.HTTP_ENDPOINT_AUTH_KIND_BEARER),
    credentialId: z.uuid()
  }),
  z.object({
    kind: z.literal(constants.HTTP_ENDPOINT_AUTH_KIND_BASIC),
    credentialId: z.uuid()
  }),
  z.object({
    kind: z.literal(constants.HTTP_ENDPOINT_AUTH_KIND_OAUTH),
    credentialId: z.uuid()
  }),
  z.object({
    kind: z.literal(constants.HTTP_ENDPOINT_AUTH_KIND_API_KEY),
    in: z.enum(['header', 'query']),
    name: z.string().min(1).max(256),
    credentialId: z.uuid()
  })
]);

const HTTP_ENDPOINT_CONFIG = z
  .object({
    // Identity — surfaced to the model. `name` becomes the MCP tool key.
    name: z
      .string()
      .regex(
        /^[a-zA-Z0-9_-]{1,64}$/,
        'Tool name must be 1-64 chars: letters, digits, underscore or hyphen'
      ),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    // Request.
    method: z.preprocess(
      v => (typeof v === 'string' ? v.toUpperCase() : v),
      z.enum(constants.HTTP_ENDPOINT_METHODS)
    ),
    url: z.string().min(1).max(2048),
    headers: z.array(HTTP_ENDPOINT_KEY_VALUE).max(50).default([]),
    query: z.array(HTTP_ENDPOINT_KEY_VALUE).max(50).default([]),
    body: z
      .object({
        kind: z.enum(constants.HTTP_ENDPOINT_BODY_KINDS),
        template: z.string().max(100_000).default('')
      })
      .default({ kind: constants.HTTP_ENDPOINT_BODY_KIND_NONE, template: '' }),
    // Input schema the model fills in (reuses the shared JSON-schema shape).
    inputSchema: SCHEMA_DEFINITION.default({
      type: 'object',
      properties: {}
    }),
    // Response handling.
    response: z
      .object({
        contentType: z
          .enum([
            constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_AUTO,
            constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_JSON,
            constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_TEXT
          ])
          .default(constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_AUTO),
        // Clamp to the hard cap rather than reject an over-large request.
        maxBytes: z
          .number()
          .int()
          .positive()
          .default(constants.HTTP_ENDPOINT_DEFAULT_MAX_BYTES)
          .transform(n =>
            Math.min(n, constants.HTTP_ENDPOINT_DEFAULT_MAX_BYTES)
          ),
        jsonPath: z.string().max(256).optional(),
        successStatus: z
          .array(z.number().int().min(100).max(599))
          .max(20)
          .optional()
      })
      .default({
        contentType: constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_AUTO,
        maxBytes: constants.HTTP_ENDPOINT_DEFAULT_MAX_BYTES
      }),
    // Auth — credentials referenced by id, never inlined.
    auth: HTTP_ENDPOINT_AUTH.default({
      kind: constants.HTTP_ENDPOINT_AUTH_KIND_NONE
    }),
    // Safety.
    timeoutMs: z
      .number()
      .int()
      .positive()
      .default(constants.HTTP_ENDPOINT_DEFAULT_TIMEOUT_MS)
      .transform(n => Math.min(n, constants.HTTP_ENDPOINT_MAX_TIMEOUT_MS)),
    allowedHosts: z
      .array(z.string().min(1).max(253).toLowerCase())
      .max(50)
      .optional()
  })
  .transform(cfg => ({
    ...cfg,
    title: cfg.title || cfg.name,
    description:
      cfg.description ||
      `Call the configured ${cfg.method} ${cfg.url} endpoint.`
  }));

// The same config, plus the rule that its `name` must not be one the platform
// owns — `name` becomes the MCP tool key, in the same flat namespace the native
// tools register into. Split from the schema above rather than folded into it
// because that one is also how apps/mcp READS a stored row at boot: an install
// that predates this rule, or predates a group being added to it, has to keep
// registering. It loses the name to the native tool (apps/mcp registers those
// first) instead of vanishing.
//
// Every path that accepts a config from a user validates with this one.
const HTTP_ENDPOINT_CONFIG_WRITE = HTTP_ENDPOINT_CONFIG.superRefine(
  (cfg, ctx) => {
    if (!isReservedToolName(cfg.name)) return;
    ctx.addIssue({
      code: 'custom',
      path: ['name'],
      message: constants.RESERVED_TOOL_NAME_MESSAGE
    });
  }
);

// Validates one artifact_tool.config of definition `mcp-proxy`. Each row of this
// kind connects a remote MCP server (a vendor's official server) and registers
// one local MCP tool per discovered remote tool at boot. `url`/`transport` are
// resolved server-side from the curated mcp_server_catalog row referenced by
// `curatedServerId` (the client never picks an arbitrary URL for now), then
// re-validated here. Secrets are never inlined — auth references an
// artifact_credential by id, same as http-endpoint.
const MCP_PROXY_AUTH = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(constants.MCP_PROXY_AUTH_KIND_NONE) }),
  z.object({
    kind: z.literal(constants.MCP_PROXY_AUTH_KIND_BEARER),
    credentialId: z.uuid()
  }),
  z.object({
    kind: z.literal(constants.MCP_PROXY_AUTH_KIND_HEADER),
    name: z.string().min(1).max(256),
    credentialId: z.uuid()
  }),
  z.object({
    kind: z.literal(constants.MCP_PROXY_AUTH_KIND_OAUTH),
    credentialId: z.uuid()
  })
]);

const MCP_PROXY_CONFIG = z.object({
  // Which curated server this row connects. url/transport are filled from the
  // catalog server-side; included here so the stored config is self-contained
  // for the boot loop (which never re-reads the catalog).
  curatedServerId: z.uuid(),
  url: z.string().min(1).max(2048).default(''),
  transport: z
    .enum(constants.MCP_PROXY_TRANSPORTS)
    .default(constants.MCP_PROXY_TRANSPORT_STREAMABLE_HTTP),
  // Tools register as `<prefix>__<remoteKey>`. Optional — the API defaults it to
  // the catalog slug when unset.
  prefix: z
    .string()
    .regex(
      /^[a-zA-Z0-9_-]{1,40}$/,
      'Prefix must be 1-40 chars: letters, digits, underscore or hyphen'
    )
    .optional(),
  // Per-item enable lists; the full available set lives on metadata.discovery so
  // the UI can render toggles without re-hitting the remote. The empty/absent
  // semantics differ by kind, matching the UI defaults:
  //   - allowedTools: absent/empty = ALL tools enabled (UI defaults them on).
  //   - allowedResources / allowedPrompts: opt-in — ONLY the listed items
  //     register; absent/empty = none (UI defaults them off).
  // All three are filtered at boot.
  allowedTools: z.array(z.string().min(1).max(256)).max(500).optional(),
  allowedResources: z.array(z.string().min(1).max(2048)).max(500).optional(),
  allowedPrompts: z.array(z.string().min(1).max(256)).max(500).optional(),
  auth: MCP_PROXY_AUTH.default({ kind: constants.MCP_PROXY_AUTH_KIND_NONE }),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(constants.MCP_PROXY_DEFAULT_TIMEOUT_MS)
    .transform(n => Math.min(n, constants.MCP_PROXY_MAX_TIMEOUT_MS))
});

// Validates one artifact_tool.config of definition `custom-code`. Unlike the two
// definitions above, this config describes almost nothing about the tools — the
// names and schemas live on the ACTIVE VERSION (artifact_tool_version.tools),
// written at publish time. Everything here is the row-level envelope: which
// version is live, and the limits that apply to whatever code that version runs.
//
// `activeVersionId` is nullable on purpose: a freshly installed row has an
// uploaded draft but nothing published, and the MCP boot loop must treat that as
// "this artifact contributes zero tools" rather than as an error.
const CUSTOM_CODE_CONFIG = z.object({
  activeVersionId: z.uuid().nullable().default(null),
  // Egress allow-list, enforced by the outbound worker (Phase 2) — never in the
  // SDK, which is user-editable and therefore not a control.
  allowedHosts: z
    .array(z.string().min(1).max(253).toLowerCase())
    .max(50)
    .optional(),
  // Providers the script may request via ctx.connection(), and — for the three
  // that have one — send files as. The broker refuses anything not listed here,
  // so widening it is an explicit, auditable edit.
  //
  // Left as a free string on this READ shape: the connectable set grows and
  // shrinks as providers are added and retired, and a stored row naming a
  // provider we no longer offer has to keep parsing or the whole install stops
  // registering. CUSTOM_CODE_CONFIG_WRITE below is where a name is checked.
  connections: z.array(z.string().min(1).max(100)).max(50).optional(),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(constants.CUSTOM_CODE_DEFAULT_TIMEOUT_MS)
    .transform(n => Math.min(n, constants.CUSTOM_CODE_MAX_TIMEOUT_MS)),
  // How far ctx.resources.create and .delete reach. `own` is the default and
  // the safe floor; `all` lets the script replace and remove resources it did
  // not write, which is what a tool that prunes a stale crawl needs. Declared
  // here so the owner grants it at publish time and the script cannot.
  resourceAccess: z
    .enum(constants.CUSTOM_CODE_RESOURCE_ACCESS_VALUES)
    .default(constants.CUSTOM_CODE_RESOURCE_ACCESS_OWN)
});

// The same config, plus the rule that every declared connection names a provider
// we actually run a managed OAuth app for.
//
// Without this a typo is invisible until a customer's tool call fails: the
// broker answers 403 "not one of this tool's declared connections" for
// `google_gmail`, which is true and useless, because the entry IS in the list —
// it just doesn't name anything. Same split as HTTP_ENDPOINT_CONFIG_WRITE, and
// for the same reason: only the write path may tighten.
const CUSTOM_CODE_CONFIG_WRITE = CUSTOM_CODE_CONFIG.superRefine((cfg, ctx) => {
  cfg.connections?.forEach((provider, index) => {
    if ((constants.OAUTH_PROVIDERS as readonly string[]).includes(provider)) {
      return;
    }
    ctx.addIssue({
      code: 'custom',
      path: ['connections', index],
      message: constants.CUSTOM_CODE_UNKNOWN_CONNECTION_MESSAGE
    });
  });
});

// One tool entry in an uploaded manifest. This is the CONTRACT half of a
// version: what apps/mcp registers at boot without ever calling the dispatcher.
// `outputSchema` is optional — MCP allows a tool to declare structured output,
// and a version that omits it just returns text.
//
// This is the shape used to READ a stored version back, so it carries no
// reserved-name rule: a rule tightened after a version was published would stop
// that version registering, and the owner would see tools quietly disappear with
// only a log line to explain it. Reservation belongs to the manifest below,
// which is the write path.
const CUSTOM_CODE_TOOL = z.object({
  name: z
    .string()
    .min(1)
    .max(constants.CUSTOM_CODE_TOOL_NAME_MAX)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Tool name may only contain letters, digits, underscore or hyphen'
    ),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  inputSchema: SCHEMA_DEFINITION.default({ type: 'object', properties: {} }),
  outputSchema: SCHEMA_DEFINITION.optional()
});

// The manifest a `ganju deploy` (or the dashboard) uploads alongside a bundle.
// Names must be unique within one script: apps/mcp registers them into a single
// flat namespace, and a duplicate would silently register once and drop the rest.
// For the same reason a name may not be one the platform owns — see
// isReservedToolName.
//
// The offending entry is identified by `path` (`tools.3.name`) rather than by
// quoting the name into the message: a manifest can declare 50 tools, so "one
// of them is reserved" would not be actionable, but an interpolated message can
// never be localized — localizeZodIssue keys on the exact English string.
const CUSTOM_CODE_MANIFEST = z.object({
  tools: z
    .array(CUSTOM_CODE_TOOL)
    .min(1, 'A version must declare at least one tool')
    .max(
      constants.CUSTOM_CODE_MAX_TOOLS,
      `A script may declare at most ${constants.CUSTOM_CODE_MAX_TOOLS} tools`
    )
    .refine(tools => new Set(tools.map(t => t.name)).size === tools.length, {
      message: 'Tool names must be unique within a version'
    })
    .superRefine((tools, ctx) => {
      tools.forEach((tool, index) => {
        if (!isReservedToolName(tool.name)) return;
        ctx.addIssue({
          code: 'custom',
          path: [index, 'name'],
          message: constants.RESERVED_TOOL_NAME_MESSAGE
        });
      });
    })
});

// Creates a draft version. Carries the manifest — the tool names and schemas the
// MCP server will register from once this version is published — and optionally
// the row-level config, since limits on how the code may run belong to the same
// review as the code itself. The compiled bundle arrives separately.
const ARTIFACT_CUSTOM_CODE_CREATE_VERSION = z.object({
  manifest: CUSTOM_CODE_MANIFEST,
  config: CUSTOM_CODE_CONFIG_WRITE.optional(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

// Attaches the compiled script to a draft. Separate from the create above for
// the same reason resource upload is separate from resource create: the bundle
// is a raw binary body while the manifest is JSON, and one request carries one
// body. Only the identifiers are validated here — the bytes are the body.
const ARTIFACT_CUSTOM_CODE_UPLOAD_BUNDLE = z.object({
  versionId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

// Makes a draft the artifact's active version.
const ARTIFACT_CUSTOM_CODE_PUBLISH = z.object({
  versionId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

// Makes a previously published (now archived) version active again. The same
// state transition as publish with a different intent, kept apart so the two are
// distinguishable in logs and in the UI.
const ARTIFACT_CUSTOM_CODE_ROLLBACK = z.object({
  versionId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

// Reads the artifact's version history and which one is currently active.
const ARTIFACT_CUSTOM_CODE_LIST_VERSIONS = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

// What apps/mcp POSTs to a dispatched user script. Parsed inside the script by
// @ganju/sdk, which routes on `tool` — one script exports many tools, so the
// name is in the body rather than in the path.
const CUSTOM_CODE_INVOKE_REQUEST = z.object({
  tool: z.string().min(1).max(constants.CUSTOM_CODE_TOOL_NAME_MAX),
  input: z.record(z.string(), z.unknown()).default({}),
  // Correlates the dispatcher's mcp_request row with whatever the script logs.
  // Opaque to user code.
  requestId: z.string().max(100).optional()
});

// What the script returns. `output` is validated against the version's declared
// outputSchema by the dispatcher, not here — this schema only establishes the
// envelope, so a script that returns garbage produces a legible tool error
// instead of an unhandled parse failure in the MCP worker.
//
// `error` is how a script reports a handled failure. It travels as a 200 with an
// error field rather than an HTTP status, because a non-2xx from the dispatch
// namespace is ambiguous — it could equally be the platform refusing to run the
// script at all.
const CUSTOM_CODE_INVOKE_RESPONSE = z.object({
  output: z.unknown().optional(),
  logs: z
    .array(
      z.object({
        level: z.enum(['log', 'warn', 'error']).default('log'),
        message: z.string().max(constants.CUSTOM_CODE_MAX_LOG_LENGTH)
      })
    )
    .max(constants.CUSTOM_CODE_MAX_LOGS)
    .default([]),
  error: z.string().max(2000).optional()
});

// Broker request bodies. Every one of these is authenticated by the bearer token
// alone — no body field names the artifact, because a script could lie about it.
const CUSTOM_CODE_BROKER_CONNECTION = z.object({
  provider: z.string().min(1).max(100)
});

const CUSTOM_CODE_BROKER_SECRET = z.object({
  // The credential's label, which is the lookup key for custom-code secrets
  // (they carry no id inside the script). See CREDENTIAL_PROVIDER_CUSTOM_CODE.
  name: z.string().min(1).max(200)
});

const CUSTOM_CODE_BROKER_RESOURCE_SEARCH = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().positive().max(20).default(5)
});

const CUSTOM_CODE_BROKER_RESOURCE_READ = z.object({
  uri: z.string().min(1).max(2000)
});

// One ctx.resources.delete call. Same shape as a read — a uri is the only thing
// a script holds — but its own schema so the two can diverge without one
// quietly accepting what the other meant.
const CUSTOM_CODE_BROKER_RESOURCE_DELETE = z.object({
  uri: z.string().min(1).max(2000),
  // Opt-in rather than implied. The FK cascades regardless, so a delete that
  // took children silently would be the difference between removing one page
  // and removing a 400-page crawl — a distinction the caller has to make on
  // purpose.
  children: z.boolean().default(false)
});

// One ctx.resources.create call.
//
// `content` and `bytes` are the two payload shapes and exactly one is required:
// text goes inline on the row, bytes (base64) go to storage. Requiring one and
// refusing both is what keeps the row's meaning unambiguous — a resource with
// inline text AND a stored object has two answers to "what is in it", and every
// reader would have to pick.
//
// `mimeType` is constrained to the same list an uploaded file is, so a script
// cannot introduce a type no other surface knows how to render or attach.
const CUSTOM_CODE_BROKER_RESOURCE_CREATE = z
  .object({
    title: z.string().min(1).max(200),
    // Optional: derived from the title when omitted. A script that re-runs and
    // wants to replace its previous output passes the same one.
    uri: z.string().min(1).max(2000).optional(),
    description: z.string().max(1000).optional(),
    mimeType: z
      .enum(constants.MIMETYPES, { message: 'Unsupported mime type' })
      .optional(),
    content: z.string().optional(),
    bytes: z.string().optional(),
    // Only meaningful for the bytes path; drives the stored object's name and
    // the filename an attachment arrives under.
    fileName: z.string().min(1).max(255).optional(),
    // Put this resource in the artifact's search corpus. Off by default: script
    // output that lands in the corpus is content the assistant will answer other
    // people's questions from, and that should be a decision rather than a
    // side effect of writing a file.
    index: z.boolean().default(false)
  })
  .superRefine((value, ctx) => {
    const hasContent = value.content !== undefined;
    const hasBytes = value.bytes !== undefined;

    if (hasContent === hasBytes) {
      ctx.addIssue({
        code: 'custom',
        path: [hasContent ? 'bytes' : 'content'],
        message: constants.CUSTOM_CODE_RESOURCE_PAYLOAD_MESSAGE
      });
      return;
    }

    // Measured in bytes rather than characters: the cap exists to bound what is
    // stored, and a string of emoji is four times its length on the way to
    // Postgres.
    if (hasContent) {
      const size = new TextEncoder().encode(value.content).byteLength;
      if (size > constants.CUSTOM_CODE_MAX_RESOURCE_TEXT_BYTES) {
        ctx.addIssue({
          code: 'custom',
          path: ['content'],
          message: constants.CUSTOM_CODE_RESOURCE_TEXT_TOO_LARGE_MESSAGE
        });
      }
      return;
    }

    // The base64 length bounds the decoded length, so this rejects an oversized
    // payload without decoding it first — the decode is what would actually cost
    // the memory being defended.
    const decodedSize = Math.floor((value.bytes!.length * 3) / 4);
    if (decodedSize > constants.CUSTOM_CODE_MAX_RESOURCE_FILE_BYTES) {
      ctx.addIssue({
        code: 'custom',
        path: ['bytes'],
        message: constants.CUSTOM_CODE_RESOURCE_FILE_TOO_LARGE_MESSAGE
      });
    }
  });

// The resources to deliver. Named by URI rather than by id because a URI is what
// every other resource surface a script can see hands back — ctx.resources.list
// and .search both return one, and neither returns a row id.
const CUSTOM_CODE_SEND_FILE_URIS = z
  .array(z.string().min(1).max(2000))
  .min(1, 'At least one resource uri is required')
  .max(
    constants.CUSTOM_CODE_SEND_FILE_MAX_URIS,
    `At most ${constants.CUSTOM_CODE_SEND_FILE_MAX_URIS} resources can be sent in one call`
  );

const CUSTOM_CODE_SEND_FILE_BODY = z.string().max(100_000);
const CUSTOM_CODE_SEND_FILE_RECIPIENTS = z.string().min(1).max(2000);

// What ctx.sendFile posts to the broker.
//
// Discriminated on `to` because the three destinations genuinely disagree about
// what a send is: two are mail with recipients and a subject, one is a channel
// upload with a comment. A single flat shape with everything optional would
// accept `{ to: 'slack', subject: '…' }` and drop the subject silently.
//
// Each variant deliberately covers ONE operation — a new mail, a new upload.
// The container routes behind them can also reply, forward, and update drafts,
// but sendFile exists to move bytes a script cannot hold, not to be a mail
// client: anything else a script wants from these APIs it can do itself with
// ctx.connection() and a fetch, where its own allow-list applies.
const CUSTOM_CODE_SEND_FILE = z.discriminatedUnion('to', [
  z.object({
    to: z.literal(constants.CUSTOM_CODE_SEND_FILE_TARGET_GMAIL),
    uris: CUSTOM_CODE_SEND_FILE_URIS,
    message: z.object({
      // Gmail's own field name for the recipient; the destination lives on `to`
      // one level up.
      to: CUSTOM_CODE_SEND_FILE_RECIPIENTS,
      subject: z.string().max(2000).optional(),
      body: CUSTOM_CODE_SEND_FILE_BODY.default(''),
      cc: z.string().max(2000).optional(),
      bcc: z.string().max(2000).optional(),
      contentType: z.enum(['text/html', 'text/plain']).optional(),
      // Threads an attachment onto an existing conversation, which a script
      // typically got from a gmail- tool call earlier in the same turn.
      threadId: z.string().max(200).optional()
    })
  }),
  z.object({
    to: z.literal(constants.CUSTOM_CODE_SEND_FILE_TARGET_OUTLOOK),
    uris: CUSTOM_CODE_SEND_FILE_URIS,
    message: z.object({
      to: CUSTOM_CODE_SEND_FILE_RECIPIENTS,
      subject: z.string().max(2000).optional(),
      body: CUSTOM_CODE_SEND_FILE_BODY.default(''),
      cc: z.string().max(2000).optional(),
      bcc: z.string().max(2000).optional(),
      // Graph's vocabulary, not a MIME type — the container passes it straight
      // through to the message payload.
      contentType: z.enum(['html', 'text']).optional()
    })
  }),
  z.object({
    to: z.literal(constants.CUSTOM_CODE_SEND_FILE_TARGET_SLACK),
    // Exactly one, unlike the two mail destinations. Slack's external-upload
    // flow moves a single file per call — three round trips per file — and the
    // container route behind it reads one `attachment` field. Accepting a list
    // here would take ten and deliver the first, silently. A script sending
    // several files calls sendFile several times.
    uris: CUSTOM_CODE_SEND_FILE_URIS.length(
      1,
      'Slack delivers one file per call'
    ),
    message: z.object({
      channel: z.string().min(1).max(200),
      title: z.string().max(200).optional(),
      initialComment: z.string().max(4000).optional(),
      threadTs: z.string().max(100).optional()
    })
  })
]);

const ARTIFACT_UPDATE_RESOURCE_SHOW_SOURCE = z.object({
  resourceId: z.uuid(),
  showSource: z.enum(constants.CHANNEL_STATUS),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_GET = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const ARTIFACT_UPDATE_SLUG = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidSlugFormat, {
      message:
        'Slug must be 3–63 chars, lowercase letters, digits, or hyphens, and start/end with a letter or digit'
    })
    .refine(s => !isReservedSlug(s), { message: 'Slug is reserved' }),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const CHANNEL_GET = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const CHANNEL_REMOVE = z.object({
  channelId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const CHANNEL_LIST_CONVERSATIONS = z.object({
  channelId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const CHANNEL_LIST_MESSAGES = z.object({
  channelId: z.uuid(),
  conversationId: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const CHANNEL_CREATE_VIEW = CHANNEL_CREATE.omit({
  projectId: true,
  userId: true,
  organizationId: true
});

const CHANNEL_UPDATE_VIEW = CHANNEL_UPDATE.omit({
  channelId: true,
  projectId: true,
  userId: true,
  organizationId: true
});

const ARTIFACT_CREATE_PROMPT_VIEW = ARTIFACT_CREATE_PROMPT.omit({
  projectId: true,
  userId: true,
  organizationId: true
});

const ARTIFACT_UPDATE_PROMPT_VIEW = ARTIFACT_UPDATE_PROMPT.omit({
  promptId: true,
  projectId: true,
  userId: true,
  organizationId: true
});

const ARTIFACT_CREATE_RESOURCE_VIEW = ARTIFACT_CREATE_RESOURCE.omit({
  projectId: true,
  userId: true,
  organizationId: true
});

const ARTIFACT_UPDATE_RESOURCE_VIEW = ARTIFACT_UPDATE_RESOURCE.omit({
  resourceId: true,
  projectId: true,
  userId: true,
  organizationId: true
});

const ARTIFACT_UPDATE_SLUG_VIEW = ARTIFACT_UPDATE_SLUG.omit({
  projectId: true,
  userId: true,
  organizationId: true
});

export const Schema = {
  CONTACT_MESSAGE,
  ORGANIZATION_CREATE,
  ORGANIZATION_CREATE_VIEW,
  ORGANIZATION_UPDATE,
  ORGANIZATION_GET,
  AUTH_USER_GET,
  PROJECT_CREATE,
  PROJECT_CREATE_VIEW,
  PROJECT_UPDATE,
  PROJECT_GET,
  ORGANIZATION_INVITATION_CREATE,
  ORGANIZATION_INVITATION_CREATE_VIEW,
  ORGANIZATION_INVITATION_LIST,
  ORGANIZATION_INVITATION_REMOVE,
  PROJECT_INVITATION_CREATE,
  PROJECT_INVITATION_CREATE_VIEW,
  PROJECT_INVITATION_LIST,
  PROJECT_INVITATION_REMOVE,
  INVITATION_RESPOND,
  INVITATION_GET_BY_TOKEN,
  ORGANIZATION_MEMBER_LIST,
  ORGANIZATION_MEMBER_REMOVE,
  PROJECT_MEMBER_LIST,
  PROJECT_MEMBER_REMOVE,
  ARTIFACT_CREATE_PROMPT,
  ARTIFACT_CREATE_PROMPT_VIEW,
  ARTIFACT_UPDATE_PROMPT,
  ARTIFACT_UPDATE_PROMPT_VIEW,
  ARTIFACT_GET_PROMPT,
  ARTIFACT_REMOVE_PROMPT,
  ARTIFACT_CREATE_RESOURCE,
  ARTIFACT_CREATE_RESOURCE_VIEW,
  ARTIFACT_CREATE_WEBSITE,
  ARTIFACT_CREATE_WEBSITE_VIEW,
  ARTIFACT_UPDATE_WEBSITE,
  ARTIFACT_UPDATE_WEBSITE_VIEW,
  ARTIFACT_CREATE_GOOGLE_DRIVE,
  ARTIFACT_CREATE_GOOGLE_DRIVE_VIEW,
  ARTIFACT_SYNC_GOOGLE_DRIVE,
  ARTIFACT_CREATE_ONE_DRIVE,
  ARTIFACT_CREATE_ONE_DRIVE_VIEW,
  ARTIFACT_SYNC_ONE_DRIVE,
  ARTIFACT_UPDATE_RESOURCE,
  ARTIFACT_UPDATE_RESOURCE_VIEW,
  ARTIFACT_GET_RESOURCE,
  ARTIFACT_GET_RESOURCE_BY_ID,
  ARTIFACT_REMOVE_RESOURCE,
  ARTIFACT_UPLOAD_RESOURCE_FILE,
  ARTIFACT_DOWNLOAD_RESOURCE_FILE,
  ARTIFACT_CREATE_TOOL,
  ARTIFACT_UPDATE_TOOL,
  ARTIFACT_GET_TOOL,
  ARTIFACT_REMOVE_TOOL,
  ARTIFACT_GET_CREDENTIAL,
  ARTIFACT_LIST_CONNECTIONS,
  ARTIFACT_REMOVE_CREDENTIAL,
  ARTIFACT_CREATE_CREDENTIAL,
  ARTIFACT_GET,
  ARTIFACT_UPDATE_SLUG,
  ARTIFACT_UPDATE_SLUG_VIEW,
  ORGANIZATION_LIST_LLM,
  ORGANIZATION_CREATE_LLM,
  ORGANIZATION_CREATE_LLM_VIEW,
  ORGANIZATION_UPDATE_LLM,
  ORGANIZATION_UPDATE_LLM_VIEW,
  ORGANIZATION_REMOVE_LLM,
  CHANNEL_CONFIG,
  CHANNEL_CREATE,
  CHANNEL_CREATE_VIEW,
  CHANNEL_UPDATE,
  CHANNEL_UPDATE_VIEW,
  CHANNEL_GET,
  CHANNEL_REMOVE,
  CHANNEL_LIST_CONVERSATIONS,
  CHANNEL_LIST_MESSAGES,
  ARTIFACT_UPDATE_RESOURCE_SHOW_SOURCE,
  HTTP_ENDPOINT_CONFIG,
  HTTP_ENDPOINT_CONFIG_WRITE,
  MCP_PROXY_CONFIG,
  CUSTOM_CODE_CONFIG,
  CUSTOM_CODE_CONFIG_WRITE,
  CUSTOM_CODE_TOOL,
  CUSTOM_CODE_MANIFEST,
  ARTIFACT_CUSTOM_CODE_CREATE_VERSION,
  ARTIFACT_CUSTOM_CODE_UPLOAD_BUNDLE,
  ARTIFACT_CUSTOM_CODE_PUBLISH,
  ARTIFACT_CUSTOM_CODE_ROLLBACK,
  ARTIFACT_CUSTOM_CODE_LIST_VERSIONS,
  CUSTOM_CODE_INVOKE_REQUEST,
  CUSTOM_CODE_INVOKE_RESPONSE,
  CUSTOM_CODE_BROKER_CONNECTION,
  CUSTOM_CODE_BROKER_SECRET,
  CUSTOM_CODE_BROKER_RESOURCE_SEARCH,
  CUSTOM_CODE_BROKER_RESOURCE_READ,
  CUSTOM_CODE_BROKER_RESOURCE_CREATE,
  CUSTOM_CODE_BROKER_RESOURCE_DELETE,
  CUSTOM_CODE_SEND_FILE
};

// Fully-resolved http-endpoint config (post-parse, defaults applied).
export type HttpEndpointToolConfig = z.infer<typeof HTTP_ENDPOINT_CONFIG>;

// Fully-resolved mcp-proxy config (post-parse, defaults applied).
export type McpProxyToolConfig = z.infer<typeof MCP_PROXY_CONFIG>;

// Fully-resolved custom-code config (post-parse, defaults applied). Holds the
// pointer to the active version plus the row-level limits — never the tools.
export type CustomCodeToolConfig = z.infer<typeof CUSTOM_CODE_CONFIG>;

// One tool a custom-code version declares. Persisted verbatim on
// artifact_tool_version.tools, which is what the MCP boot loop reads — the same
// configure-time-discovery trick mcp-proxy uses, except the source of truth is
// the user's manifest rather than a remote server.
export type CustomCodeToolManifest = z.infer<typeof CUSTOM_CODE_TOOL>;

// The full manifest uploaded with a bundle.
export type CustomCodeManifest = z.infer<typeof CUSTOM_CODE_MANIFEST>;

// One ctx.sendFile call, after parsing. The SDK's SendFileOptions is the same
// union written by hand — it can't import this one, because @ganju/sdk is
// bundled into every uploaded script and reaching the barrel would ship zod
// with it.
export type CustomCodeSendFile = z.infer<typeof CUSTOM_CODE_SEND_FILE>;

// One ctx.resources.create call, after parsing. Same split as above: the SDK
// declares the input shape by hand so it never has to import zod.
export type CustomCodeCreateResource = z.infer<
  typeof CUSTOM_CODE_BROKER_RESOURCE_CREATE
>;

// One remote tool discovered from a proxied MCP server. Stored on
// artifact_tool.metadata.discovery at configure-time so the stateless MCP boot
// loop can register the tool without a remote round-trip.
export interface McpProxyDiscoveredTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: unknown;
}

// One remote resource discovered from a proxied MCP server. Identified by uri;
// registration is deferred, so this is currently only surfaced to the UI for
// enable/disable selection.
export interface McpProxyDiscoveredResource {
  uri: string;
  name?: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

// One remote prompt discovered from a proxied MCP server. Identified by name.
// `arguments` (from the remote's prompts/list) drives the local prompt's
// argument schema at boot — MCP prompt arguments are always strings.
export interface McpProxyDiscoveredPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
}

// The discovery payload persisted on artifact_tool.metadata.discovery — the
// FULL set of items the remote exposes (the enabled subset lives in config's
// allowed* lists). Tools, resources, and prompts are all registered at boot
// (resources/prompts only for the opt-in subset named in the allow-lists).
export interface McpProxyDiscovery {
  discoveredAt: string;
  serverInfo?: { name?: string; version?: string };
  tools: McpProxyDiscoveredTool[];
  resources?: McpProxyDiscoveredResource[];
  prompts?: McpProxyDiscoveredPrompt[];
}

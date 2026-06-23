import { z } from 'zod';

import { constants } from './constants';
import { isReservedSlug, isValidSlugFormat } from './slug';
import { slugifyTitle } from './slugifyTitle';

// A prompt title becomes a slash command; it must not collide with a command
// the channel runner handles itself (e.g. `/link`).
const PROMPT_TITLE = z
  .string()
  .min(3)
  .max(200)
  .refine(
    title =>
      !constants.RESERVED_BOT_COMMANDS.includes(slugifyTitle(title)),
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

const CHANNEL_CREATE = z.object({
  platform: z.enum(constants.CHANNEL_PLATFORMS),
  config: z.record(z.string(), z.any()).optional(),
  credentials: z.record(z.string(), z.string()),
  llmId: z.uuid().nullable().optional(),
  projectId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.uuid()
});

const CHANNEL_UPDATE = z.object({
  channelId: z.uuid(),
  status: z.enum(constants.CHANNEL_STATUS).optional(),
  config: z.record(z.string(), z.any()).optional(),
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
  MCP_PROXY_CONFIG
};

// Fully-resolved http-endpoint config (post-parse, defaults applied).
export type HttpEndpointToolConfig = z.infer<typeof HTTP_ENDPOINT_CONFIG>;

// Fully-resolved mcp-proxy config (post-parse, defaults applied).
export type McpProxyToolConfig = z.infer<typeof MCP_PROXY_CONFIG>;

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

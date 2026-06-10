const USER_ROLE_ADMIN = 'ADMIN';
const USER_ROLES = [USER_ROLE_ADMIN];

const STATUS_COMPLETED = 'COMPLETED';
const STATUS_PENDING = 'PENDING';
const STATUS_FAILED = 'FAILED';
const STATUS_ACTIVE = 'ACTIVE';
const STATUS_DISABLED = 'DISABLED';
const STATUS_BLOCKED = 'BLOCKED';
const STATUS = [
  STATUS_COMPLETED,
  STATUS_PENDING,
  STATUS_FAILED,
  STATUS_ACTIVE,
  STATUS_DISABLED,
  STATUS_BLOCKED
];
const USER_STATUS = [STATUS_ACTIVE, STATUS_BLOCKED];
const CHANNEL_STATUS = [STATUS_ACTIVE, STATUS_DISABLED];
const RESOURCE_STATUS = [STATUS_PENDING, STATUS_COMPLETED, STATUS_FAILED];
const INVITATION_STATUS = [STATUS_PENDING, STATUS_COMPLETED, STATUS_DISABLED];

const INVITATION_SCOPE_ORGANIZATION = 'ORGANIZATION' as 'ORGANIZATION';
const INVITATION_SCOPE_PROJECT = 'PROJECT' as 'PROJECT';
const INVITATION_SCOPES = [
  INVITATION_SCOPE_ORGANIZATION,
  INVITATION_SCOPE_PROJECT
];

const INVITATION_RESPONSE_ACCEPT = 'accept' as 'accept';
const INVITATION_RESPONSE_DECLINE = 'decline' as 'decline';
const INVITATION_RESPONSES = [
  INVITATION_RESPONSE_ACCEPT,
  INVITATION_RESPONSE_DECLINE
];

const INVITATION_EXPIRY_DAYS = 7;
const INVITATION_TOKEN_BYTES = 24;

const SLUG_BYTES = 16;
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

const SERVICE_NAME_API = 'api';
const SERVICE_NAME_MCP = 'mcp';
const SERVICE_NAME_RESOURCE_HANDLER = 'resource_handler';
const SERVICE_NAMES = [
  SERVICE_NAME_API,
  SERVICE_NAME_MCP,
  SERVICE_NAME_RESOURCE_HANDLER
];

const SOCIAL_PROVIDER_GOOGLE = 'google' as 'google';
const SOCIAL_PROVIDER_GITHUB = 'github' as 'github';
const SOCIAL_PROVIDERS = [SOCIAL_PROVIDER_GOOGLE, SOCIAL_PROVIDER_GITHUB];

const OAUTH_PROVIDER_GOOGLE_GMAIL = 'google-gmail' as 'google-gmail';
const OAUTH_PROVIDER_GOOGLE_DRIVE = 'google-drive' as 'google-drive';
const OAUTH_PROVIDER_GOOGLE_CALENDAR = 'google-calendar' as 'google-calendar';
const OAUTH_PROVIDER_MICROSOFT_OUTLOOK =
  'microsoft-outlook' as 'microsoft-outlook';
const OAUTH_PROVIDER_ONE_DRIVE = 'microsoft-onedrive' as 'microsoft-onedrive';
const OAUTH_PROVIDER_SLACK = 'slack' as 'slack';
const OAUTH_PROVIDER_SLACK_USER = 'slack-user' as 'slack-user';
const OAUTH_PROVIDERS = [
  OAUTH_PROVIDER_GOOGLE_GMAIL,
  OAUTH_PROVIDER_GOOGLE_DRIVE,
  OAUTH_PROVIDER_GOOGLE_CALENDAR,
  OAUTH_PROVIDER_MICROSOFT_OUTLOOK,
  OAUTH_PROVIDER_ONE_DRIVE,
  OAUTH_PROVIDER_SLACK,
  OAUTH_PROVIDER_SLACK_USER
];

const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const MICROSOFT_OAUTH_AUTH_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const SLACK_OAUTH_AUTH_URL = 'https://slack.com/oauth/v2/authorize';
const OAUTH_AUTH_URLS: Record<string, string> = {
  [OAUTH_PROVIDER_GOOGLE_GMAIL]: GOOGLE_OAUTH_AUTH_URL,
  [OAUTH_PROVIDER_GOOGLE_DRIVE]: GOOGLE_OAUTH_AUTH_URL,
  [OAUTH_PROVIDER_GOOGLE_CALENDAR]: GOOGLE_OAUTH_AUTH_URL,
  [OAUTH_PROVIDER_MICROSOFT_OUTLOOK]: MICROSOFT_OAUTH_AUTH_URL,
  [OAUTH_PROVIDER_ONE_DRIVE]: MICROSOFT_OAUTH_AUTH_URL,
  [OAUTH_PROVIDER_SLACK]: SLACK_OAUTH_AUTH_URL,
  [OAUTH_PROVIDER_SLACK_USER]: SLACK_OAUTH_AUTH_URL
};

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MICROSOFT_OAUTH_TOKEN_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const SLACK_OAUTH_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const OAUTH_TOKEN_URLS: Record<string, string> = {
  [OAUTH_PROVIDER_GOOGLE_GMAIL]: GOOGLE_OAUTH_TOKEN_URL,
  [OAUTH_PROVIDER_GOOGLE_DRIVE]: GOOGLE_OAUTH_TOKEN_URL,
  [OAUTH_PROVIDER_GOOGLE_CALENDAR]: GOOGLE_OAUTH_TOKEN_URL,
  [OAUTH_PROVIDER_MICROSOFT_OUTLOOK]: MICROSOFT_OAUTH_TOKEN_URL,
  [OAUTH_PROVIDER_ONE_DRIVE]: MICROSOFT_OAUTH_TOKEN_URL,
  [OAUTH_PROVIDER_SLACK]: SLACK_OAUTH_TOKEN_URL,
  [OAUTH_PROVIDER_SLACK_USER]: SLACK_OAUTH_TOKEN_URL
};

// Refresh an OAuth token when less than this remains, so a long call doesn't
// expire mid-flight. Shared by every credential-refresh path (native OAuth and
// MCP-proxy OAuth, in both apps/api and apps/mcp).
const CREDENTIAL_REFRESH_BUFFER_MS = 60 * 1000;

const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DRIVE_DEFAULT_PAGE_SIZE = 200;
const GOOGLE_DRIVE_MAX_FOLDER_PAGES = 50;
const GOOGLE_DRIVE_TOKEN_REFRESH_LEEWAY_MS = 60_000;
const GOOGLE_DRIVE_URI_PREFIX = 'gdrive://files/';
const GOOGLE_DRIVE_FILE_FIELDS =
  'id,name,mimeType,modifiedTime,createdTime,size,md5Checksum,version,parents,owners(emailAddress,displayName),webViewLink,iconLink,description,trashed,capabilities/canDownload';
const GOOGLE_DRIVE_LIST_FIELDS = `nextPageToken,files(${GOOGLE_DRIVE_FILE_FIELDS})`;

const GOOGLE_DRIVE_TAB_MY_DRIVE = 'my-drive' as 'my-drive';
const GOOGLE_DRIVE_TAB_SHARED_WITH_ME = 'shared-with-me' as 'shared-with-me';
const GOOGLE_DRIVE_TAB_SHARED_DRIVES = 'shared-drives' as 'shared-drives';
const GOOGLE_DRIVE_TAB_STARRED = 'starred' as 'starred';
const GOOGLE_DRIVE_TABS = [
  GOOGLE_DRIVE_TAB_MY_DRIVE,
  GOOGLE_DRIVE_TAB_SHARED_WITH_ME,
  GOOGLE_DRIVE_TAB_SHARED_DRIVES,
  GOOGLE_DRIVE_TAB_STARRED
];
const GOOGLE_DRIVE_TAB_LABEL_MY_DRIVE = 'My Drive';
const GOOGLE_DRIVE_TAB_LABEL_SHARED_WITH_ME = 'Shared with me';
const GOOGLE_DRIVE_TAB_LABEL_SHARED_DRIVES = 'Shared drives';
const GOOGLE_DRIVE_TAB_LABEL_STARRED = 'Starred';
const GOOGLE_DRIVE_TAB_LABELS: ReadonlyArray<{
  value:
    | typeof GOOGLE_DRIVE_TAB_MY_DRIVE
    | typeof GOOGLE_DRIVE_TAB_SHARED_WITH_ME
    | typeof GOOGLE_DRIVE_TAB_SHARED_DRIVES
    | typeof GOOGLE_DRIVE_TAB_STARRED;
  label: string;
}> = [
  { value: GOOGLE_DRIVE_TAB_MY_DRIVE, label: GOOGLE_DRIVE_TAB_LABEL_MY_DRIVE },
  {
    value: GOOGLE_DRIVE_TAB_SHARED_WITH_ME,
    label: GOOGLE_DRIVE_TAB_LABEL_SHARED_WITH_ME
  },
  {
    value: GOOGLE_DRIVE_TAB_SHARED_DRIVES,
    label: GOOGLE_DRIVE_TAB_LABEL_SHARED_DRIVES
  },
  { value: GOOGLE_DRIVE_TAB_STARRED, label: GOOGLE_DRIVE_TAB_LABEL_STARRED }
];

const MICROSOFT_GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
const ONE_DRIVE_DEFAULT_PAGE_SIZE = 200;
const ONE_DRIVE_MAX_FOLDER_PAGES = 50;
const ONE_DRIVE_TOKEN_REFRESH_LEEWAY_MS = 60_000;
const ONE_DRIVE_URI_PREFIX = 'onedrive://files/';
const ONE_DRIVE_ITEM_SELECT =
  'id,name,size,webUrl,createdDateTime,lastModifiedDateTime,eTag,cTag,file,folder,parentReference,deleted,@microsoft.graph.downloadUrl';

const ONE_DRIVE_TAB_MY_FILES = 'my-files' as 'my-files';
const ONE_DRIVE_TAB_SHARED_WITH_ME = 'shared-with-me' as 'shared-with-me';
const ONE_DRIVE_TAB_RECENT = 'recent' as 'recent';
const ONE_DRIVE_TAB_DRIVES = 'drives' as 'drives';
const ONE_DRIVE_TABS = [
  ONE_DRIVE_TAB_MY_FILES,
  ONE_DRIVE_TAB_SHARED_WITH_ME,
  ONE_DRIVE_TAB_RECENT,
  ONE_DRIVE_TAB_DRIVES
];
const ONE_DRIVE_TAB_LABEL_MY_FILES = 'My files';
const ONE_DRIVE_TAB_LABEL_SHARED_WITH_ME = 'Shared with me';
const ONE_DRIVE_TAB_LABEL_RECENT = 'Recent';
const ONE_DRIVE_TAB_LABEL_DRIVES = 'Drives';
const ONE_DRIVE_TAB_LABELS: ReadonlyArray<{
  value:
    | typeof ONE_DRIVE_TAB_MY_FILES
    | typeof ONE_DRIVE_TAB_SHARED_WITH_ME
    | typeof ONE_DRIVE_TAB_RECENT
    | typeof ONE_DRIVE_TAB_DRIVES;
  label: string;
}> = [
  { value: ONE_DRIVE_TAB_MY_FILES, label: ONE_DRIVE_TAB_LABEL_MY_FILES },
  {
    value: ONE_DRIVE_TAB_SHARED_WITH_ME,
    label: ONE_DRIVE_TAB_LABEL_SHARED_WITH_ME
  },
  { value: ONE_DRIVE_TAB_RECENT, label: ONE_DRIVE_TAB_LABEL_RECENT },
  { value: ONE_DRIVE_TAB_DRIVES, label: ONE_DRIVE_TAB_LABEL_DRIVES }
];

const REAUTH_ERROR_CODES = ['invalid_grant', 'invalid_token'];

const RESOURCE_TYPE_TOOLTIP_MIN_WIDTH = 300;

const SEARCH_DEBOUNCE_MS = 300;

const SCHEMA_DEFINITION_TYPES = [
  'string',
  'number',
  'boolean',
  'object',
  'array'
];

const ROLE_MESSAGE_USER = 'user' as 'user';
const ROLE_MESSAGE_ASSISTANT = 'assistant' as 'assistant';
const ROLE_MESSAGE_SYSTEM = 'system' as 'system';
const ROLE_MESSAGE_TOOL = 'tool' as 'tool';
const ROLE_MESSAGES = [ROLE_MESSAGE_USER, ROLE_MESSAGE_ASSISTANT];
const CHANNEL_ROLE_MESSAGES = [
  ROLE_MESSAGE_USER,
  ROLE_MESSAGE_ASSISTANT,
  ROLE_MESSAGE_SYSTEM,
  ROLE_MESSAGE_TOOL
];

const RESOURCE_TYPE_STATIC = 'static' as 'static';
const RESOURCE_TYPE_TEMPLATE = 'template' as 'template';
const RESOURCE_TYPES = [RESOURCE_TYPE_STATIC, RESOURCE_TYPE_TEMPLATE];

const RESOURCE_SOURCE_TYPE_FILE = 'FILE' as 'FILE';
const RESOURCE_SOURCE_TYPE_WEBSITE = 'WEBSITE' as 'WEBSITE';
const RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER =
  'GOOGLE_DRIVE_FOLDER' as 'GOOGLE_DRIVE_FOLDER';
const RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER =
  'ONE_DRIVE_FOLDER' as 'ONE_DRIVE_FOLDER';
const RESOURCE_SOURCE_TYPES = [
  RESOURCE_SOURCE_TYPE_FILE,
  RESOURCE_SOURCE_TYPE_WEBSITE,
  RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER,
  RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER
];

const CRAWL_RENDERER_CHEERIO = 'cheerio' as 'cheerio';
const CRAWL_RENDERER_PLAYWRIGHT = 'playwright' as 'playwright';
const CRAWL_RENDERERS = [CRAWL_RENDERER_CHEERIO, CRAWL_RENDERER_PLAYWRIGHT];

const CRAWL_DEFAULT_MAX_PAGES = 100;
const CRAWL_MAX_PAGES_LIMIT = 1000;
const CRAWL_DEFAULT_MAX_DEPTH = 3;
const CRAWL_MAX_DEPTH_LIMIT = 10;
const CRAWL_PAGE_FETCH_TIMEOUT_MS = 30000;
const CRAWL_USER_AGENT =
  'Mozilla/5.0 (compatible; AnjuCrawler/1.0; +https://anju.ai)';

const RESOURCE_ICON_THEME_DARK = 'dark';
const RESOURCE_ICON_THEME_LIGHT = 'light';
const RESOURCE_ICON_THEMES = [
  RESOURCE_ICON_THEME_DARK,
  RESOURCE_ICON_THEME_LIGHT
];

const ENCODING_UTF8 = 'utf-8' as 'utf-8';
const ENCODINGS = [
  ENCODING_UTF8,
  'ascii',
  'base64',
  'latin1',
  'utf-16le',
  'binary'
];

const LANGUAGE_EN = 'en';
const LANGUAGE_ES = 'es';
const LANGUAGES = [LANGUAGE_EN, LANGUAGE_ES];

const MIMETYPE_TEXT = 'text/plain' as 'text/plain';
const MIMETYPE_TEXT_CSV = 'text/csv' as 'text/csv';
const MIMETYPE_TEXT_HTML = 'text/html' as 'text/html';
const MIMETYPE_TEXT_MARKDOWN = 'text/markdown' as 'text/markdown';
const MIMETYPE_IMAGE_PNG = 'image/png' as 'image/png';
const MIMETYPE_IMAGE_GIF = 'image/gif' as 'image/gif';
const MIMETYPE_IMAGE_JPEG = 'image/jpeg' as 'image/jpeg';
const MIMETYPE_IMAGE_WEBP = 'image/webp' as 'image/webp';
const MIMETYPE_IMAGE_SVG_XML = 'image/svg+xml' as 'image/svg+xml';
const MIMETYPE_APPLICATION_PDF = 'application/pdf' as 'application/pdf';
const MIMETYPE_APPLICATION_JSON = 'application/json' as 'application/json';
const MIMETYPE_APPLICATION_MSWORD =
  'application/msword' as 'application/msword';
const MIMETYPE_APPLICATION_VND_MS_EXCEL =
  'application/vnd.ms-excel' as 'application/vnd.ms-excel';
const MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_SPREADSHEETML_SHEET =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_WORDPROCESSINGML_DOCUMENT =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_PRESENTATIONML_PRESENTATION =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation' as 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const MIMETYPE_APPLICATION_VND_GOOGLE_APPS_DOCUMENT =
  'application/vnd.google-apps.document' as 'application/vnd.google-apps.document';
const MIMETYPE_APPLICATION_VND_GOOGLE_APPS_SPREADSHEET =
  'application/vnd.google-apps.spreadsheet' as 'application/vnd.google-apps.spreadsheet';
const MIMETYPE_APPLICATION_VND_GOOGLE_APPS_PRESENTATION =
  'application/vnd.google-apps.presentation' as 'application/vnd.google-apps.presentation';
const MIMETYPE_APPLICATION_VND_GOOGLE_APPS_FOLDER =
  'application/vnd.google-apps.folder' as 'application/vnd.google-apps.folder';
const MIMETYPE_APPLICATION_XML = 'application/xml' as 'application/xml';
const MIMETYPE_APPLICATION_JAVASCRIPT =
  'application/javascript' as 'application/javascript';
const MIMETYPE_APPLICATION_TYPESCRIPT =
  'application/typescript' as 'application/typescript';
const MIMETYPE_APPLICATION_YAML = 'application/yaml' as 'application/yaml';
const MIMETYPE_APPLICATION_X_YAML =
  'application/x-yaml' as 'application/x-yaml';
const MIMETYPE_APPLICATION_TOML = 'application/toml' as 'application/toml';
const MIMETYPE_APPLICATION_X_SH = 'application/x-sh' as 'application/x-sh';
const MIMETYPE_APPLICATION_SQL = 'application/sql' as 'application/sql';
const MIMETYPE_APPLICATION_GRAPHQL =
  'application/graphql' as 'application/graphql';
const MIMETYPE_APPLICATION_LD_JSON =
  'application/ld+json' as 'application/ld+json';
const MIMETYPE_APPLICATION_XHTML_XML =
  'application/xhtml+xml' as 'application/xhtml+xml';
const MIMETYPE_APPLICATION_X_HTTPD_PHP =
  'application/x-httpd-php' as 'application/x-httpd-php';
const MIMETYPE_APPLICATION_X_PYTHON_CODE =
  'application/x-python-code' as 'application/x-python-code';
const MIMETYPE_APPLICATION_X_WWW_FORM_URLENCODED =
  'application/x-www-form-urlencoded' as 'application/x-www-form-urlencoded';
const MIMETYPE_APPLICATION_CSV = 'application/csv' as 'application/csv';
const MIMETYPE_APPLICATION_X_RUBY =
  'application/x-ruby' as 'application/x-ruby';
const MIMETYPE_APPLICATION_X_PERL =
  'application/x-perl' as 'application/x-perl';
const MIMETYPE_APPLICATION_OCTET_STREAM =
  'application/octet-stream' as 'application/octet-stream';
const MIMETYPES = [
  MIMETYPE_TEXT,
  MIMETYPE_TEXT_CSV,
  MIMETYPE_TEXT_HTML,
  MIMETYPE_TEXT_MARKDOWN,
  MIMETYPE_IMAGE_PNG,
  MIMETYPE_IMAGE_GIF,
  MIMETYPE_IMAGE_JPEG,
  MIMETYPE_IMAGE_WEBP,
  MIMETYPE_IMAGE_SVG_XML,
  MIMETYPE_APPLICATION_PDF,
  MIMETYPE_APPLICATION_JSON,
  MIMETYPE_APPLICATION_MSWORD,
  MIMETYPE_APPLICATION_VND_MS_EXCEL,
  MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_SPREADSHEETML_SHEET,
  MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_WORDPROCESSINGML_DOCUMENT,
  MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_PRESENTATIONML_PRESENTATION,
  MIMETYPE_APPLICATION_VND_GOOGLE_APPS_DOCUMENT,
  MIMETYPE_APPLICATION_VND_GOOGLE_APPS_SPREADSHEET,
  MIMETYPE_APPLICATION_VND_GOOGLE_APPS_PRESENTATION,
  MIMETYPE_APPLICATION_VND_GOOGLE_APPS_FOLDER,
  MIMETYPE_APPLICATION_XML,
  MIMETYPE_APPLICATION_JAVASCRIPT,
  MIMETYPE_APPLICATION_TYPESCRIPT,
  MIMETYPE_APPLICATION_YAML,
  MIMETYPE_APPLICATION_X_YAML,
  MIMETYPE_APPLICATION_TOML,
  MIMETYPE_APPLICATION_X_SH,
  MIMETYPE_APPLICATION_SQL,
  MIMETYPE_APPLICATION_GRAPHQL,
  MIMETYPE_APPLICATION_LD_JSON,
  MIMETYPE_APPLICATION_XHTML_XML,
  MIMETYPE_APPLICATION_X_HTTPD_PHP,
  MIMETYPE_APPLICATION_X_PYTHON_CODE,
  MIMETYPE_APPLICATION_X_WWW_FORM_URLENCODED,
  MIMETYPE_APPLICATION_CSV,
  MIMETYPE_APPLICATION_X_RUBY,
  MIMETYPE_APPLICATION_X_PERL,
  MIMETYPE_APPLICATION_OCTET_STREAM
];
// Sensible file extension for a mime type, used to name a downloaded/forwarded
// file (e.g. a proxied MCP resource sent into a channel) when the source has no
// usable filename. Not exhaustive — callers fall back to .bin / .txt.
const EXTENSION_BY_MIME: Record<string, string> = {
  [MIMETYPE_TEXT]: 'txt',
  [MIMETYPE_TEXT_CSV]: 'csv',
  [MIMETYPE_TEXT_HTML]: 'html',
  [MIMETYPE_TEXT_MARKDOWN]: 'md',
  [MIMETYPE_APPLICATION_JSON]: 'json',
  [MIMETYPE_APPLICATION_PDF]: 'pdf',
  [MIMETYPE_APPLICATION_XML]: 'xml',
  [MIMETYPE_IMAGE_PNG]: 'png',
  [MIMETYPE_IMAGE_JPEG]: 'jpg',
  [MIMETYPE_IMAGE_GIF]: 'gif',
  [MIMETYPE_IMAGE_WEBP]: 'webp',
  [MIMETYPE_IMAGE_SVG_XML]: 'svg'
};
const TEXT_MIME_TYPES = [
  MIMETYPE_TEXT,
  MIMETYPE_TEXT_CSV,
  MIMETYPE_TEXT_HTML,
  MIMETYPE_APPLICATION_JSON,
  MIMETYPE_APPLICATION_XML,
  MIMETYPE_APPLICATION_JAVASCRIPT,
  MIMETYPE_APPLICATION_TYPESCRIPT,
  MIMETYPE_APPLICATION_YAML,
  MIMETYPE_APPLICATION_X_YAML,
  MIMETYPE_APPLICATION_TOML,
  MIMETYPE_APPLICATION_X_SH,
  MIMETYPE_APPLICATION_SQL,
  MIMETYPE_APPLICATION_GRAPHQL,
  MIMETYPE_APPLICATION_LD_JSON,
  MIMETYPE_APPLICATION_XHTML_XML,
  MIMETYPE_APPLICATION_X_HTTPD_PHP,
  MIMETYPE_APPLICATION_X_PYTHON_CODE,
  MIMETYPE_APPLICATION_X_WWW_FORM_URLENCODED,
  MIMETYPE_APPLICATION_CSV,
  MIMETYPE_APPLICATION_X_RUBY,
  MIMETYPE_APPLICATION_X_PERL
];
const EMBEDDABLE_MIME_TYPES = [
  ...TEXT_MIME_TYPES,
  MIMETYPE_APPLICATION_PDF,
  MIMETYPE_APPLICATION_MSWORD,
  MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_WORDPROCESSINGML_DOCUMENT,
  MIMETYPE_APPLICATION_VND_MS_EXCEL,
  MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_SPREADSHEETML_SHEET,
  MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_PRESENTATIONML_PRESENTATION,
  MIMETYPE_APPLICATION_VND_GOOGLE_APPS_DOCUMENT,
  MIMETYPE_APPLICATION_VND_GOOGLE_APPS_SPREADSHEET,
  MIMETYPE_APPLICATION_VND_GOOGLE_APPS_PRESENTATION
];

const GOOGLE_DRIVE_EXPORT_MIME_TYPES: Record<string, string> = {
  [MIMETYPE_APPLICATION_VND_GOOGLE_APPS_DOCUMENT]:
    MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_WORDPROCESSINGML_DOCUMENT,
  [MIMETYPE_APPLICATION_VND_GOOGLE_APPS_SPREADSHEET]:
    MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_SPREADSHEETML_SHEET,
  [MIMETYPE_APPLICATION_VND_GOOGLE_APPS_PRESENTATION]:
    MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_PRESENTATIONML_PRESENTATION
};

const GOOGLE_DRIVE_EXPORT_EXTENSIONS: Record<string, string> = {
  [MIMETYPE_APPLICATION_VND_GOOGLE_APPS_DOCUMENT]: 'docx',
  [MIMETYPE_APPLICATION_VND_GOOGLE_APPS_SPREADSHEET]: 'xlsx',
  [MIMETYPE_APPLICATION_VND_GOOGLE_APPS_PRESENTATION]: 'pptx'
};
const USER_AVATAR_MIME_TYPES = [
  MIMETYPE_IMAGE_PNG,
  MIMETYPE_IMAGE_JPEG,
  MIMETYPE_IMAGE_WEBP,
  MIMETYPE_IMAGE_GIF
];

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

// Gmail caps a sent message at 25MB encoded. Combined raw attachment size
// must stay under ~18MB so the base64 multipart envelope fits.
const GMAIL_MAX_RAW_ATTACHMENT_BYTES = 18 * 1024 * 1024;

// Microsoft Graph: attachments ≤3MB go inline in the message JSON; larger
// ones need createUploadSession + chunked PUT. We enforce a per-attachment
// cap so a single huge file fails fast instead of after a partial upload.
const OUTLOOK_ATTACHMENT_INLINE_THRESHOLD = 3 * 1024 * 1024;
const OUTLOOK_MAX_ATTACHMENT_BYTES = 150 * 1024 * 1024;
const OUTLOOK_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

// Slack Web API base. Per-file cap for files.uploadV2 — Slack's hard limit
// is 1GB but anything that large should be a shared link, not an upload,
// and 100MB keeps memory pressure on the resource-handler container sane.
const SLACK_API_BASE = 'https://slack.com/api';
const SLACK_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// Telegram Bot API per-method file caps (sendPhoto vs sendDocument differ).
const TELEGRAM_MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const TELEGRAM_MAX_FILE_BYTES = 50 * 1024 * 1024;

const RATE_LIMIT_BACKOFF_SECONDS = 60;

const CHANNEL_PLATFORM_TELEGRAM = 'telegram' as 'telegram';
const CHANNEL_PLATFORM_SLACK = 'slack' as 'slack';
const CHANNEL_PLATFORM_WHATSAPP = 'whatsapp' as 'whatsapp';
const CHANNEL_PLATFORM_DISCORD = 'discord' as 'discord';
const CHANNEL_PLATFORMS = [
  CHANNEL_PLATFORM_TELEGRAM,
  CHANNEL_PLATFORM_SLACK,
  CHANNEL_PLATFORM_WHATSAPP,
  CHANNEL_PLATFORM_DISCORD
];

const CHANNEL_CONVERSATION_SCOPE_PRIVATE = 'private' as 'private';
const CHANNEL_CONVERSATION_SCOPE_GROUP = 'group' as 'group';
const CHANNEL_CONVERSATION_SCOPE_CHANNEL = 'channel' as 'channel';
const CHANNEL_CONVERSATION_SCOPES = [
  CHANNEL_CONVERSATION_SCOPE_PRIVATE,
  CHANNEL_CONVERSATION_SCOPE_GROUP,
  CHANNEL_CONVERSATION_SCOPE_CHANNEL
];

const CHANNEL_USAGE_KIND_PROMPT = 'prompt' as 'prompt';
const CHANNEL_USAGE_KIND_RESOURCE = 'resource' as 'resource';
const CHANNEL_USAGE_KIND_TOOL = 'tool' as 'tool';
const CHANNEL_USAGE_KINDS = [
  CHANNEL_USAGE_KIND_PROMPT,
  CHANNEL_USAGE_KIND_RESOURCE,
  CHANNEL_USAGE_KIND_TOOL
];

const LLM_PROVIDER_ANTHROPIC = 'anthropic' as 'anthropic';
const LLM_PROVIDER_OPENAI = 'openai' as 'openai';
const LLM_PROVIDER_OPENAI_COMPATIBLE =
  'openai-compatible' as 'openai-compatible';
const LLM_PROVIDER_GOOGLE = 'google' as 'google';
const LLM_PROVIDERS = [
  LLM_PROVIDER_ANTHROPIC,
  LLM_PROVIDER_OPENAI,
  LLM_PROVIDER_OPENAI_COMPATIBLE,
  LLM_PROVIDER_GOOGLE
];

const DEFAULT_LLM_PROVIDER = LLM_PROVIDER_GOOGLE;
const DEFAULT_LLM_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_LLM_SYSTEM_PROMPT =
  'You are a helpful assistant. Answer the user using the tools and resources provided to you whenever they are relevant, and prefer that information over your prior knowledge. Cite the resources you used when applicable. Be concise and accurate. If you cannot find a clear answer in the available context, say so honestly instead of guessing.';

const LLM_CATALOG: ReadonlyArray<{
  provider:
    | typeof LLM_PROVIDER_GOOGLE
    | typeof LLM_PROVIDER_OPENAI
    | typeof LLM_PROVIDER_ANTHROPIC;
  model: string;
  label: string;
}> = [
  {
    provider: LLM_PROVIDER_GOOGLE,
    model: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash'
  },
  {
    provider: LLM_PROVIDER_GOOGLE,
    model: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro'
  },
  {
    provider: LLM_PROVIDER_OPENAI,
    model: 'gpt-4o-mini',
    label: 'GPT-4o mini'
  },
  {
    provider: LLM_PROVIDER_OPENAI,
    model: 'gpt-4o',
    label: 'GPT-4o'
  },
  {
    provider: LLM_PROVIDER_ANTHROPIC,
    model: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5'
  },
  {
    provider: LLM_PROVIDER_ANTHROPIC,
    model: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6'
  },
  {
    provider: LLM_PROVIDER_ANTHROPIC,
    model: 'claude-opus-4.7',
    label: 'Claude Sonnet 4.7'
  }
];

const LLM_SYSTEM_DEFAULT = 'SYSTEM_DEFAULT';

const MAX_TOOL_LOOPS = 8;

const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const TELEGRAM_API_BASE = 'https://api.telegram.org';
const TELEGRAM_MESSAGE_LIMIT = 3500;

// Slack channel (inbound bot webhook). Slack signs every request to the
// Events API / slash-command Request URL with the app signing secret; we verify
// `v0:{timestamp}:{rawBody}` against the x-slack-signature header and reject
// stale timestamps (replay protection). A `section` block's mrkdwn text caps at
// 3000 chars — we chunk a bit under that. Source links become Block Kit URL
// buttons (≤5 per actions block on Slack's side).
const SLACK_SIGNATURE_HEADER = 'x-slack-signature';
const SLACK_TIMESTAMP_HEADER = 'x-slack-request-timestamp';
const SLACK_RETRY_NUM_HEADER = 'x-slack-retry-num';
const SLACK_SIGNATURE_VERSION = 'v0';
const SLACK_SIGNATURE_MAX_SKEW_SECONDS = 300;
const SLACK_MESSAGE_LIMIT = 2900;
const SLACK_MAX_SOURCE_BUTTONS = 10;

// The Slack app configuration Anju needs, surfaced in the UI when connecting a
// Slack channel. Required scopes back the runner's calls (mentions, DMs,
// posting, file upload); recommended scopes only enrich names/titles and
// degrade gracefully; bot events are what the webhook subscribes to.
const SLACK_REQUIRED_SCOPES = [
  'app_mentions:read',
  'im:history',
  'chat:write',
  'files:write'
];
const SLACK_RECOMMENDED_SCOPES = ['users:read', 'channels:read', 'groups:read'];
const SLACK_BOT_EVENTS = ['app_mention', 'message.im'];

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 3072;
const CHUNK_TARGET_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;
const EMBED_BATCH_SIZE = 96;

const RESOURCE_HANDLER_SLEEP_AFTER = '10m';

const DOCS_URL = 'https://docs.anju.ai';

const BASE64_DATA_URI_RE =
  /data:image\/[a-zA-Z0-9+\-.]+;base64,[A-Za-z0-9+/=\s]+/g;
const RAW_BASE64_BLOB_RE = /[A-Za-z0-9+/]{512,}={0,2}/g;

const CHUNK_SEPARATORS: Array<{ split: string | RegExp; join: string }> = [
  { split: /\n(?=#{1,6}\s)/, join: '\n' },
  { split: '\n\n', join: '\n\n' },
  { split: '\n', join: '\n' },
  { split: '. ', join: '. ' },
  { split: ' ', join: ' ' }
];

const DEFAULT_MAX_TOKENS = 4096;

const RESOURCE_TOOL_KEY_LIST_RESOURCES = 'list-resources';
const RESOURCE_TOOL_KEY_SEARCH_RESOURCES = 'search-resources';
const RESOURCE_TOOL_KEY_READ_RESOURCE = 'read-resource';
const RESOURCE_TOOL_KEY_SEND_RESOURCE = 'send-resource';
const RESOURCE_TOOL_KEYS = [
  RESOURCE_TOOL_KEY_LIST_RESOURCES,
  RESOURCE_TOOL_KEY_SEARCH_RESOURCES,
  RESOURCE_TOOL_KEY_READ_RESOURCE,
  RESOURCE_TOOL_KEY_SEND_RESOURCE
];
const URI_BEARING_RESOURCE_TOOL_KEYS = [
  RESOURCE_TOOL_KEY_READ_RESOURCE,
  RESOURCE_TOOL_KEY_SEND_RESOURCE
];

const CALENDAR_TOOL_KEY_PREFIX = 'calendar-';

// Google Calendar `sendUpdates` query values — who gets emailed on event changes.
const CALENDAR_SEND_UPDATES_ALL = 'all' as 'all';
const CALENDAR_SEND_UPDATES_EXTERNAL_ONLY = 'externalOnly' as 'externalOnly';
const CALENDAR_SEND_UPDATES_NONE = 'none' as 'none';
const CALENDAR_SEND_UPDATES_VALUES = [
  CALENDAR_SEND_UPDATES_ALL,
  CALENDAR_SEND_UPDATES_EXTERNAL_ONLY,
  CALENDAR_SEND_UPDATES_NONE
];

// Google Calendar event `visibility`. DEFAULT means "inherit the calendar's
// default" and is omitted from the request body.
const CALENDAR_VISIBILITY_DEFAULT = 'default' as 'default';
const CALENDAR_VISIBILITY_PUBLIC = 'public' as 'public';
const CALENDAR_VISIBILITY_PRIVATE = 'private' as 'private';
const CALENDAR_VISIBILITY_VALUES = [
  CALENDAR_VISIBILITY_DEFAULT,
  CALENDAR_VISIBILITY_PUBLIC,
  CALENDAR_VISIBILITY_PRIVATE
];

const CALENDAR_DEFAULT_CALENDAR_ID = 'primary';
const CALENDAR_DEFAULT_EVENT_DURATION_MINUTES = 60;
const CALENDAR_CONFERENCE_TYPE_GOOGLE_MEET = 'hangoutsMeet';

// Declarative per-tool config schema for the calendar tools, rendered as a form
// in the Tools UI. Keyed by tool key; values are the artifact_tool.config keys
// each tool reads. Group-level keys (defaultCalendarId / defaultTimeZone /
// sendUpdates) are edited from the group header, so they are not listed here.
export type CalendarConfigField =
  | {
      key: string;
      label: string;
      type: 'number';
      min?: number;
      max?: number;
      help?: string;
    }
  | { key: string; label: string; type: 'text'; help?: string }
  | { key: string; label: string; type: 'boolean'; help?: string }
  | {
      key: string;
      label: string;
      type: 'select';
      options: { value: string; label: string }[];
      help?: string;
    }
  | { key: string; label: string; type: 'weekdays'; help?: string };

const CALENDAR_TOOL_FIELDS: Record<string, CalendarConfigField[]> = {
  'calendar-list-calendars': [
    {
      key: 'defaultMaxResults',
      label: 'Default max results',
      type: 'number',
      min: 1,
      max: 50,
      help: 'Used when a call omits maxResults (1–50).'
    },
    {
      key: 'defaultWindowDays',
      label: 'Default look-ahead (days)',
      type: 'number',
      min: 1,
      help: 'When no end time is given, list events this many days ahead.'
    }
  ],
  'calendar-create-event': [
    {
      key: 'defaultDurationMinutes',
      label: 'Default duration (minutes)',
      type: 'number',
      min: 1,
      help: 'Used when an event is created without an end time.'
    },
    {
      key: 'addGoogleMeet',
      label: 'Add a Google Meet link',
      type: 'boolean',
      help: 'Attach a Meet conference to every new event.'
    },
    { key: 'defaultLocation', label: 'Default location', type: 'text' },
    {
      key: 'defaultVisibility',
      label: 'Visibility',
      type: 'select',
      options: [
        { value: CALENDAR_VISIBILITY_DEFAULT, label: 'Calendar default' },
        { value: CALENDAR_VISIBILITY_PUBLIC, label: 'Public' },
        { value: CALENDAR_VISIBILITY_PRIVATE, label: 'Private' }
      ]
    }
  ],
  'calendar-find-free-slots': [
    {
      key: 'workingHoursStart',
      label: 'Working hours start (0–23)',
      type: 'number',
      min: 0,
      max: 23,
      help: 'Local hour. Requires a default time zone to take effect.'
    },
    {
      key: 'workingHoursEnd',
      label: 'Working hours end (1–24)',
      type: 'number',
      min: 1,
      max: 24
    },
    { key: 'workingDays', label: 'Working days', type: 'weekdays' },
    {
      key: 'defaultDurationMinutes',
      label: 'Default slot length (minutes)',
      type: 'number',
      min: 1
    },
    {
      key: 'bufferMinutes',
      label: 'Buffer between meetings (minutes)',
      type: 'number',
      min: 0
    },
    {
      key: 'minNoticeHours',
      label: 'Minimum notice (hours)',
      type: 'number',
      min: 0
    },
    {
      key: 'maxAdvanceDays',
      label: 'Max advance (days)',
      type: 'number',
      min: 1
    }
  ]
};

// Cal.com uses a personal API key (no OAuth). The key is stored like any other
// credential (artifact_credential, provider 'calcom', encrypted accessToken).
const API_KEY_PROVIDER_CALCOM = 'calcom' as 'calcom';
// Tavily web search uses a personal API key (no OAuth), same storage pattern.
const API_KEY_PROVIDER_TAVILY = 'tavily' as 'tavily';
// API-key providers surfaced in the Tools UI's "Add API key" affordance (one
// key per provider, validated against the vendor before storage).
const API_KEY_PROVIDERS = [API_KEY_PROVIDER_CALCOM, API_KEY_PROVIDER_TAVILY];

// http-endpoint secrets are stored as artifact_credential rows too, but unlike
// the API-key providers above a single artifact can hold MANY of them (one per
// endpoint), each referenced by id from a tool's auth config and carrying a
// human label in metadata. There's no vendor to validate against. This is kept
// out of API_KEY_PROVIDERS so the catalog UI doesn't treat it as a one-key
// "Add API key" integration.
const CREDENTIAL_PROVIDER_HTTP_ENDPOINT = 'http-endpoint' as 'http-endpoint';
// mcp-proxy secrets behave exactly like http-endpoint ones: many per artifact
// (one per proxied server), referenced by id from a tool's auth config and
// labelled in metadata, with no vendor to validate against. Same multi-row,
// per-tool storage — kept out of API_KEY_PROVIDERS for the same reason.
const CREDENTIAL_PROVIDER_MCP_PROXY = 'mcp-proxy' as 'mcp-proxy';
// Providers whose secrets are per-tool (many rows per artifact, deleted with the
// tool that owns them) rather than one-per-provider. See createCredential /
// removeTool in apps/api ArtifactController.
const PER_TOOL_CREDENTIAL_PROVIDERS = [
  CREDENTIAL_PROVIDER_HTTP_ENDPOINT,
  CREDENTIAL_PROVIDER_MCP_PROXY
];
// Every provider the generic credential create endpoint accepts.
const CREDENTIAL_PROVIDERS = [
  API_KEY_PROVIDER_CALCOM,
  API_KEY_PROVIDER_TAVILY,
  CREDENTIAL_PROVIDER_HTTP_ENDPOINT,
  CREDENTIAL_PROVIDER_MCP_PROXY
];

const CALCOM_API_BASE = 'https://api.cal.com/v2';
// Cal.com pins behavior per endpoint with the `cal-api-version` header.
const CALCOM_API_VERSION_EVENT_TYPES = '2024-06-14';
const CALCOM_API_VERSION_SLOTS = '2024-09-04';
const CALCOM_API_VERSION_BOOKINGS = '2026-02-25';

const CALCOM_TOOL_KEY_PREFIX = 'calcom-';

// Tavily web search. The key is validated against the live API before it is
// persisted (a minimal 1-result search), then stored as an artifact_credential
// (provider 'tavily', encrypted accessToken, no refresh token) like Cal.com.
const TAVILY_API_BASE = 'https://api.tavily.com';
const TAVILY_SEARCH_DEPTH_BASIC = 'basic' as 'basic';
const TAVILY_SEARCH_DEPTH_ADVANCED = 'advanced' as 'advanced';
const TAVILY_SEARCH_DEPTHS = [
  TAVILY_SEARCH_DEPTH_BASIC,
  TAVILY_SEARCH_DEPTH_ADVANCED
];
const TAVILY_TOPIC_GENERAL = 'general' as 'general';
const TAVILY_TOPIC_NEWS = 'news' as 'news';
const TAVILY_TOPICS = [TAVILY_TOPIC_GENERAL, TAVILY_TOPIC_NEWS];
const TAVILY_DEFAULT_MAX_RESULTS = 5;
const TAVILY_MAX_RESULTS_LIMIT = 20;

const WEB_TOOL_KEY_PREFIX = 'web-';
const WEB_TOOL_KEY_SEARCH = 'web-search';
const WEB_TOOL_KEY_EXTRACT = 'web-extract';
const WEB_TOOL_KEYS = [WEB_TOOL_KEY_SEARCH, WEB_TOOL_KEY_EXTRACT];

// `http-endpoint` is a proxied tool definition: a single tool_definition row
// (key below) whose installed artifact_tool rows each describe one HTTP call.
// At MCP server boot, every such row registers one named MCP tool derived from
// its config (name/title/description/inputSchema). It lets users expose their
// own backends to the agent without a TypeScript handler.
const TOOL_DEFINITION_KEY_HTTP_ENDPOINT = 'http-endpoint';

const HTTP_ENDPOINT_METHOD_GET = 'GET' as 'GET';
const HTTP_ENDPOINT_METHOD_POST = 'POST' as 'POST';
const HTTP_ENDPOINT_METHOD_PUT = 'PUT' as 'PUT';
const HTTP_ENDPOINT_METHOD_PATCH = 'PATCH' as 'PATCH';
const HTTP_ENDPOINT_METHOD_DELETE = 'DELETE' as 'DELETE';
const HTTP_ENDPOINT_METHODS = [
  HTTP_ENDPOINT_METHOD_GET,
  HTTP_ENDPOINT_METHOD_POST,
  HTTP_ENDPOINT_METHOD_PUT,
  HTTP_ENDPOINT_METHOD_PATCH,
  HTTP_ENDPOINT_METHOD_DELETE
];

const HTTP_ENDPOINT_BODY_KIND_NONE = 'none' as 'none';
const HTTP_ENDPOINT_BODY_KIND_JSON = 'json' as 'json';
const HTTP_ENDPOINT_BODY_KIND_FORM = 'form' as 'form';
const HTTP_ENDPOINT_BODY_KIND_TEXT = 'text' as 'text';
const HTTP_ENDPOINT_BODY_KINDS = [
  HTTP_ENDPOINT_BODY_KIND_NONE,
  HTTP_ENDPOINT_BODY_KIND_JSON,
  HTTP_ENDPOINT_BODY_KIND_FORM,
  HTTP_ENDPOINT_BODY_KIND_TEXT
];

const HTTP_ENDPOINT_AUTH_KIND_NONE = 'none' as 'none';
const HTTP_ENDPOINT_AUTH_KIND_BEARER = 'bearer' as 'bearer';
const HTTP_ENDPOINT_AUTH_KIND_BASIC = 'basic' as 'basic';
const HTTP_ENDPOINT_AUTH_KIND_API_KEY = 'api-key' as 'api-key';
const HTTP_ENDPOINT_AUTH_KIND_OAUTH = 'oauth' as 'oauth';
const HTTP_ENDPOINT_AUTH_KINDS = [
  HTTP_ENDPOINT_AUTH_KIND_NONE,
  HTTP_ENDPOINT_AUTH_KIND_BEARER,
  HTTP_ENDPOINT_AUTH_KIND_BASIC,
  HTTP_ENDPOINT_AUTH_KIND_API_KEY,
  HTTP_ENDPOINT_AUTH_KIND_OAUTH
];

const HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_AUTO = 'auto' as 'auto';
const HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_JSON = 'json' as 'json';
const HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_TEXT = 'text' as 'text';

const HTTP_ENDPOINT_DEFAULT_TIMEOUT_MS = 10_000;
const HTTP_ENDPOINT_MAX_TIMEOUT_MS = 30_000;
// Response body cap returned to the model; truncated past this with a marker.
const HTTP_ENDPOINT_DEFAULT_MAX_BYTES = 256 * 1024;
// Hard ceiling on the outgoing request body, regardless of config.
const HTTP_ENDPOINT_MAX_REQUEST_BYTES = 1024 * 1024;

// `mcp-proxy` is the second proxied tool definition: a single tool_definition
// row (key below) whose installed artifact_tool rows each describe one remote
// MCP server (a vendor's official server — GitHub, Notion, …). Unlike
// http-endpoint (one row → one tool), one mcp-proxy row produces MANY MCP tools,
// one per remote tool discovered from that server. Discovery happens once at
// configure-time (apps/api) and the tool list is stored in
// artifact_tool.metadata.discovery so the stateless MCP boot loop can register
// the tools without a remote round-trip; only tools/call connects to the remote.
const TOOL_DEFINITION_KEY_MCP_PROXY = 'mcp-proxy';

const MCP_PROXY_TRANSPORT_STREAMABLE_HTTP =
  'streamable-http' as 'streamable-http';
const MCP_PROXY_TRANSPORT_SSE = 'sse' as 'sse';
const MCP_PROXY_TRANSPORTS = [
  MCP_PROXY_TRANSPORT_STREAMABLE_HTTP,
  MCP_PROXY_TRANSPORT_SSE
];

const MCP_PROXY_AUTH_KIND_NONE = 'none' as 'none';
const MCP_PROXY_AUTH_KIND_BEARER = 'bearer' as 'bearer';
const MCP_PROXY_AUTH_KIND_HEADER = 'header' as 'header';
const MCP_PROXY_AUTH_KIND_OAUTH = 'oauth' as 'oauth';
const MCP_PROXY_AUTH_KINDS = [
  MCP_PROXY_AUTH_KIND_NONE,
  MCP_PROXY_AUTH_KIND_BEARER,
  MCP_PROXY_AUTH_KIND_HEADER,
  MCP_PROXY_AUTH_KIND_OAUTH
];

const MCP_PROXY_DEFAULT_TIMEOUT_MS = 10_000;
const MCP_PROXY_MAX_TIMEOUT_MS = 30_000;
// Cap on how many remote tools a single proxied server may register, so a
// chatty vendor can't flood the artifact's tool list.
const MCP_PROXY_MAX_TOOLS = 100;
// Response cap returned to the model from a proxied tools/call; truncated past
// this with a marker (same ceiling as http-endpoint).
const MCP_PROXY_MAX_RESPONSE_BYTES = 256 * 1024;
// Proxied tools register as `<prefix><sep><remoteKey>` so the vendor prefix is
// visually distinct from native `<group>-<verb>-<object>` names.
const MCP_PROXY_TOOL_NAME_SEP = '__';
// Max length of the composed local tool name. Remote names are untrusted; the
// cap matches the tool-name limit MCP clients (incl. the Anthropic API) enforce.
const MCP_PROXY_TOOL_NAME_MAX = 64;

const MCP_REQUEST_METHOD_INITIALIZE = 'initialize' as 'initialize';
const MCP_REQUEST_METHOD_PING = 'ping' as 'ping';
const MCP_REQUEST_METHOD_TOOLS_LIST = 'tools/list' as 'tools/list';
const MCP_REQUEST_METHOD_TOOLS_CALL = 'tools/call' as 'tools/call';
const MCP_REQUEST_METHOD_RESOURCES_LIST = 'resources/list' as 'resources/list';
const MCP_REQUEST_METHOD_RESOURCES_TEMPLATES_LIST =
  'resources/templates/list' as 'resources/templates/list';
const MCP_REQUEST_METHOD_RESOURCES_READ = 'resources/read' as 'resources/read';
const MCP_REQUEST_METHOD_PROMPTS_LIST = 'prompts/list' as 'prompts/list';
const MCP_REQUEST_METHOD_PROMPTS_GET = 'prompts/get' as 'prompts/get';
const MCP_REQUEST_METHODS = [
  MCP_REQUEST_METHOD_INITIALIZE,
  MCP_REQUEST_METHOD_PING,
  MCP_REQUEST_METHOD_TOOLS_LIST,
  MCP_REQUEST_METHOD_TOOLS_CALL,
  MCP_REQUEST_METHOD_RESOURCES_LIST,
  MCP_REQUEST_METHOD_RESOURCES_TEMPLATES_LIST,
  MCP_REQUEST_METHOD_RESOURCES_READ,
  MCP_REQUEST_METHOD_PROMPTS_LIST,
  MCP_REQUEST_METHOD_PROMPTS_GET
];

const MCP_AUTH_KIND_JWT = 'jwt' as 'jwt';
const MCP_AUTH_KIND_INTERNAL = 'internal' as 'internal';
const MCP_AUTH_KINDS = [MCP_AUTH_KIND_JWT, MCP_AUTH_KIND_INTERNAL];

const MCP_SESSION_HEADER = 'mcp-session-id';

const MCP_INTERNAL_HEADER = 'x-anju-internal-secret';
const MCP_CHANNEL_ID_HEADER = 'x-anju-channel-id';
const MCP_CHANNEL_PLATFORM_HEADER = 'x-anju-channel-platform';
const MCP_CHANNEL_CLIENT_USER_AGENT = 'anju-channel/0.0.1';
const JWKS_KV_KEY = 'jwks:v1';
const JWKS_TTL_SECONDS = 600;

// Standard OIDC scopes the better-auth oidcProvider honors for user OAuth
// flows. Advertised in the OAuth discovery documents (RFC 8414
// authorization-server metadata and RFC 9728 protected-resource metadata).
const OAUTH_SCOPES_SUPPORTED = ['openid', 'profile', 'email', 'offline_access'];

// Anju-specific OAuth scopes for MCP access. `mcp:read` is the default scope
// minted by the bot-on-behalf-of grant (a custom grant that bypasses the OIDC
// authorize endpoint). `artifact:<slug>` — built from this prefix — gates a
// subjectless machine token to a single MCP server in the MCP auth middleware.
// Neither is in better-auth's OIDC scope allowlist, so they are NOT advertised
// in the discovery documents: a standard OIDC client requesting an advertised
// scope that isn't allowlisted would be rejected with `invalid_scope`.
// TODO: Net: mcp:read is a cosmetic claim on bot tokens; artifact: is a code path that can't fire. Neither affects security today. They become real only if you build the per-server confinement feature (which would make artifact:<slug> issued + enforced). This is more for OIDC.
const MCP_SCOPE_READ = 'mcp:read';
const ARTIFACT_SCOPE_PREFIX = 'artifact:';

const BOT_GRANT_TYPE = 'urn:anju:bot-on-behalf-of';
const EXTERNAL_LINK_VERIFICATION_PREFIX = 'external_link:';
const EXTERNAL_LINK_TTL_SECONDS = 600;
const BOT_ACCESS_TOKEN_TTL_SECONDS = 3600;

const LINK_CODE_LENGTH = 12;
const LINK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const BOT_COMMAND_LINK = 'link';
const RESERVED_BOT_COMMANDS = [BOT_COMMAND_LINK];

const RESERVED_SLUGS = [
  'www',
  'api',
  'app',
  'admin',
  'auth',
  'mcp',
  'dev',
  'prod',
  'staging',
  'development',
  'production',
  'docs',
  'blog',
  'help',
  'support',
  'status',
  'mail',
  'ftp',
  'ns',
  'ns1',
  'ns2',
  'cdn',
  'static',
  'assets',
  'auth',
  'oauth',
  'authentication',
  'authorization',
  'login',
  'logout',
  'signin',
  'signup',
  'register',
  'me',
  'user',
  'users',
  'account',
  'accounts',
  'billing',
  'settings',
  'health',
  'metrics',
  'internal'
];

export const constants = {
  USER_ROLE_ADMIN,
  USER_ROLES,
  INVITATION_STATUS,
  INVITATION_SCOPE_ORGANIZATION,
  INVITATION_SCOPE_PROJECT,
  INVITATION_SCOPES,
  INVITATION_RESPONSE_ACCEPT,
  INVITATION_RESPONSE_DECLINE,
  INVITATION_RESPONSES,
  INVITATION_EXPIRY_DAYS,
  INVITATION_TOKEN_BYTES,
  SLUG_BYTES,
  SLUG_PATTERN,
  STATUS_COMPLETED,
  STATUS_PENDING,
  STATUS_FAILED,
  STATUS_ACTIVE,
  STATUS_DISABLED,
  STATUS_BLOCKED,
  STATUS,
  USER_STATUS,
  CHANNEL_STATUS,
  RESOURCE_STATUS,
  SERVICE_NAME_API,
  SERVICE_NAME_MCP,
  SERVICE_NAME_RESOURCE_HANDLER,
  SOCIAL_PROVIDER_GOOGLE,
  SOCIAL_PROVIDER_GITHUB,
  SOCIAL_PROVIDERS,
  OAUTH_PROVIDER_GOOGLE_GMAIL,
  OAUTH_PROVIDER_GOOGLE_DRIVE,
  OAUTH_PROVIDER_GOOGLE_CALENDAR,
  OAUTH_PROVIDER_MICROSOFT_OUTLOOK,
  OAUTH_PROVIDER_ONE_DRIVE,
  OAUTH_PROVIDER_SLACK,
  OAUTH_PROVIDER_SLACK_USER,
  OAUTH_PROVIDERS,
  GOOGLE_OAUTH_AUTH_URL,
  MICROSOFT_OAUTH_AUTH_URL,
  SLACK_OAUTH_AUTH_URL,
  OAUTH_AUTH_URLS,
  GOOGLE_OAUTH_TOKEN_URL,
  MICROSOFT_OAUTH_TOKEN_URL,
  SLACK_OAUTH_TOKEN_URL,
  OAUTH_TOKEN_URLS,
  CREDENTIAL_REFRESH_BUFFER_MS,
  GOOGLE_CALENDAR_API_BASE,
  GOOGLE_DRIVE_API_BASE,
  GOOGLE_DRIVE_DEFAULT_PAGE_SIZE,
  GOOGLE_DRIVE_MAX_FOLDER_PAGES,
  GOOGLE_DRIVE_TOKEN_REFRESH_LEEWAY_MS,
  GOOGLE_DRIVE_URI_PREFIX,
  GOOGLE_DRIVE_FILE_FIELDS,
  GOOGLE_DRIVE_LIST_FIELDS,
  GOOGLE_DRIVE_TAB_MY_DRIVE,
  GOOGLE_DRIVE_TAB_SHARED_WITH_ME,
  GOOGLE_DRIVE_TAB_SHARED_DRIVES,
  GOOGLE_DRIVE_TAB_STARRED,
  GOOGLE_DRIVE_TABS,
  GOOGLE_DRIVE_TAB_LABEL_MY_DRIVE,
  GOOGLE_DRIVE_TAB_LABEL_SHARED_WITH_ME,
  GOOGLE_DRIVE_TAB_LABEL_SHARED_DRIVES,
  GOOGLE_DRIVE_TAB_LABEL_STARRED,
  GOOGLE_DRIVE_TAB_LABELS,
  MICROSOFT_GRAPH_API_BASE,
  ONE_DRIVE_DEFAULT_PAGE_SIZE,
  ONE_DRIVE_MAX_FOLDER_PAGES,
  ONE_DRIVE_TOKEN_REFRESH_LEEWAY_MS,
  ONE_DRIVE_URI_PREFIX,
  ONE_DRIVE_ITEM_SELECT,
  ONE_DRIVE_TAB_MY_FILES,
  ONE_DRIVE_TAB_SHARED_WITH_ME,
  ONE_DRIVE_TAB_RECENT,
  ONE_DRIVE_TAB_DRIVES,
  ONE_DRIVE_TABS,
  ONE_DRIVE_TAB_LABEL_MY_FILES,
  ONE_DRIVE_TAB_LABEL_SHARED_WITH_ME,
  ONE_DRIVE_TAB_LABEL_RECENT,
  ONE_DRIVE_TAB_LABEL_DRIVES,
  ONE_DRIVE_TAB_LABELS,
  REAUTH_ERROR_CODES,
  RESOURCE_TYPE_TOOLTIP_MIN_WIDTH,
  SEARCH_DEBOUNCE_MS,
  GOOGLE_DRIVE_EXPORT_MIME_TYPES,
  GOOGLE_DRIVE_EXPORT_EXTENSIONS,
  SERVICE_NAMES,
  SCHEMA_DEFINITION_TYPES,
  ROLE_MESSAGE_USER,
  ROLE_MESSAGE_ASSISTANT,
  ROLE_MESSAGE_SYSTEM,
  ROLE_MESSAGE_TOOL,
  ROLE_MESSAGES,
  CHANNEL_ROLE_MESSAGES,
  LANGUAGE_EN,
  LANGUAGE_ES,
  LANGUAGES,
  MIMETYPE_TEXT,
  MIMETYPE_TEXT_CSV,
  MIMETYPE_TEXT_HTML,
  MIMETYPE_TEXT_MARKDOWN,
  MIMETYPE_IMAGE_PNG,
  MIMETYPE_IMAGE_GIF,
  MIMETYPE_IMAGE_JPEG,
  MIMETYPE_IMAGE_WEBP,
  MIMETYPE_IMAGE_SVG_XML,
  MIMETYPE_APPLICATION_PDF,
  MIMETYPE_APPLICATION_JSON,
  MIMETYPE_APPLICATION_MSWORD,
  MIMETYPE_APPLICATION_VND_MS_EXCEL,
  MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_SPREADSHEETML_SHEET,
  MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_WORDPROCESSINGML_DOCUMENT,
  MIMETYPE_APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_PRESENTATIONML_PRESENTATION,
  MIMETYPE_APPLICATION_VND_GOOGLE_APPS_DOCUMENT,
  MIMETYPE_APPLICATION_VND_GOOGLE_APPS_SPREADSHEET,
  MIMETYPE_APPLICATION_VND_GOOGLE_APPS_PRESENTATION,
  MIMETYPE_APPLICATION_VND_GOOGLE_APPS_FOLDER,
  MIMETYPE_APPLICATION_XML,
  MIMETYPE_APPLICATION_JAVASCRIPT,
  MIMETYPE_APPLICATION_TYPESCRIPT,
  MIMETYPE_APPLICATION_YAML,
  MIMETYPE_APPLICATION_X_YAML,
  MIMETYPE_APPLICATION_TOML,
  MIMETYPE_APPLICATION_X_SH,
  MIMETYPE_APPLICATION_SQL,
  MIMETYPE_APPLICATION_GRAPHQL,
  MIMETYPE_APPLICATION_LD_JSON,
  MIMETYPE_APPLICATION_XHTML_XML,
  MIMETYPE_APPLICATION_X_HTTPD_PHP,
  MIMETYPE_APPLICATION_X_PYTHON_CODE,
  MIMETYPE_APPLICATION_X_WWW_FORM_URLENCODED,
  MIMETYPE_APPLICATION_CSV,
  MIMETYPE_APPLICATION_X_RUBY,
  MIMETYPE_APPLICATION_X_PERL,
  MIMETYPE_APPLICATION_OCTET_STREAM,
  MIMETYPES,
  EXTENSION_BY_MIME,
  TEXT_MIME_TYPES,
  EMBEDDABLE_MIME_TYPES,
  USER_AVATAR_MIME_TYPES,
  RESOURCE_TYPE_STATIC,
  RESOURCE_TYPE_TEMPLATE,
  RESOURCE_TYPES,
  RESOURCE_SOURCE_TYPE_FILE,
  RESOURCE_SOURCE_TYPE_WEBSITE,
  RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER,
  RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER,
  RESOURCE_SOURCE_TYPES,
  CRAWL_RENDERER_CHEERIO,
  CRAWL_RENDERER_PLAYWRIGHT,
  CRAWL_RENDERERS,
  CRAWL_DEFAULT_MAX_PAGES,
  CRAWL_MAX_PAGES_LIMIT,
  CRAWL_DEFAULT_MAX_DEPTH,
  CRAWL_MAX_DEPTH_LIMIT,
  CRAWL_PAGE_FETCH_TIMEOUT_MS,
  CRAWL_USER_AGENT,
  RESOURCE_ICON_THEME_DARK,
  RESOURCE_ICON_THEME_LIGHT,
  RESOURCE_ICON_THEMES,
  MAX_FILE_SIZE,
  MAX_AVATAR_SIZE,
  GMAIL_MAX_RAW_ATTACHMENT_BYTES,
  OUTLOOK_ATTACHMENT_INLINE_THRESHOLD,
  OUTLOOK_MAX_ATTACHMENT_BYTES,
  OUTLOOK_UPLOAD_CHUNK_BYTES,
  SLACK_API_BASE,
  SLACK_MAX_UPLOAD_BYTES,
  TELEGRAM_MAX_PHOTO_BYTES,
  TELEGRAM_MAX_FILE_BYTES,
  RATE_LIMIT_BACKOFF_SECONDS,
  ENCODINGS,
  ENCODING_UTF8,
  CHANNEL_PLATFORM_TELEGRAM,
  CHANNEL_PLATFORM_SLACK,
  CHANNEL_PLATFORM_WHATSAPP,
  CHANNEL_PLATFORM_DISCORD,
  CHANNEL_PLATFORMS,
  CHANNEL_CONVERSATION_SCOPE_PRIVATE,
  CHANNEL_CONVERSATION_SCOPE_GROUP,
  CHANNEL_CONVERSATION_SCOPE_CHANNEL,
  CHANNEL_CONVERSATION_SCOPES,
  CHANNEL_USAGE_KIND_PROMPT,
  CHANNEL_USAGE_KIND_RESOURCE,
  CHANNEL_USAGE_KIND_TOOL,
  CHANNEL_USAGE_KINDS,
  LLM_PROVIDER_ANTHROPIC,
  LLM_PROVIDER_OPENAI,
  LLM_PROVIDER_OPENAI_COMPATIBLE,
  LLM_PROVIDER_GOOGLE,
  LLM_PROVIDERS,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_SYSTEM_PROMPT,
  LLM_CATALOG,
  LLM_SYSTEM_DEFAULT,
  MAX_TOOL_LOOPS,
  TELEGRAM_SECRET_HEADER,
  TELEGRAM_API_BASE,
  TELEGRAM_MESSAGE_LIMIT,
  SLACK_SIGNATURE_HEADER,
  SLACK_TIMESTAMP_HEADER,
  SLACK_RETRY_NUM_HEADER,
  SLACK_SIGNATURE_VERSION,
  SLACK_SIGNATURE_MAX_SKEW_SECONDS,
  SLACK_MESSAGE_LIMIT,
  SLACK_MAX_SOURCE_BUTTONS,
  SLACK_REQUIRED_SCOPES,
  SLACK_RECOMMENDED_SCOPES,
  SLACK_BOT_EVENTS,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  CHUNK_TARGET_CHARS,
  CHUNK_OVERLAP_CHARS,
  EMBED_BATCH_SIZE,
  RESOURCE_HANDLER_SLEEP_AFTER,
  DOCS_URL,
  BASE64_DATA_URI_RE,
  RAW_BASE64_BLOB_RE,
  CHUNK_SEPARATORS,
  DEFAULT_MAX_TOKENS,
  RESOURCE_TOOL_KEY_LIST_RESOURCES,
  RESOURCE_TOOL_KEY_SEARCH_RESOURCES,
  RESOURCE_TOOL_KEY_READ_RESOURCE,
  RESOURCE_TOOL_KEY_SEND_RESOURCE,
  RESOURCE_TOOL_KEYS,
  URI_BEARING_RESOURCE_TOOL_KEYS,
  CALENDAR_TOOL_KEY_PREFIX,
  CALENDAR_SEND_UPDATES_ALL,
  CALENDAR_SEND_UPDATES_EXTERNAL_ONLY,
  CALENDAR_SEND_UPDATES_NONE,
  CALENDAR_SEND_UPDATES_VALUES,
  CALENDAR_VISIBILITY_DEFAULT,
  CALENDAR_VISIBILITY_PUBLIC,
  CALENDAR_VISIBILITY_PRIVATE,
  CALENDAR_VISIBILITY_VALUES,
  CALENDAR_DEFAULT_CALENDAR_ID,
  CALENDAR_DEFAULT_EVENT_DURATION_MINUTES,
  CALENDAR_CONFERENCE_TYPE_GOOGLE_MEET,
  CALENDAR_TOOL_FIELDS,
  API_KEY_PROVIDER_CALCOM,
  API_KEY_PROVIDER_TAVILY,
  API_KEY_PROVIDERS,
  CREDENTIAL_PROVIDER_HTTP_ENDPOINT,
  CREDENTIAL_PROVIDER_MCP_PROXY,
  PER_TOOL_CREDENTIAL_PROVIDERS,
  CREDENTIAL_PROVIDERS,
  CALCOM_API_BASE,
  CALCOM_API_VERSION_EVENT_TYPES,
  CALCOM_API_VERSION_SLOTS,
  CALCOM_API_VERSION_BOOKINGS,
  CALCOM_TOOL_KEY_PREFIX,
  TAVILY_API_BASE,
  TAVILY_SEARCH_DEPTH_BASIC,
  TAVILY_SEARCH_DEPTH_ADVANCED,
  TAVILY_SEARCH_DEPTHS,
  TAVILY_TOPIC_GENERAL,
  TAVILY_TOPIC_NEWS,
  TAVILY_TOPICS,
  TAVILY_DEFAULT_MAX_RESULTS,
  TAVILY_MAX_RESULTS_LIMIT,
  WEB_TOOL_KEY_PREFIX,
  WEB_TOOL_KEY_SEARCH,
  WEB_TOOL_KEY_EXTRACT,
  WEB_TOOL_KEYS,
  TOOL_DEFINITION_KEY_HTTP_ENDPOINT,
  HTTP_ENDPOINT_METHOD_GET,
  HTTP_ENDPOINT_METHOD_POST,
  HTTP_ENDPOINT_METHOD_PUT,
  HTTP_ENDPOINT_METHOD_PATCH,
  HTTP_ENDPOINT_METHOD_DELETE,
  HTTP_ENDPOINT_METHODS,
  HTTP_ENDPOINT_BODY_KIND_NONE,
  HTTP_ENDPOINT_BODY_KIND_JSON,
  HTTP_ENDPOINT_BODY_KIND_FORM,
  HTTP_ENDPOINT_BODY_KIND_TEXT,
  HTTP_ENDPOINT_BODY_KINDS,
  HTTP_ENDPOINT_AUTH_KIND_NONE,
  HTTP_ENDPOINT_AUTH_KIND_BEARER,
  HTTP_ENDPOINT_AUTH_KIND_BASIC,
  HTTP_ENDPOINT_AUTH_KIND_API_KEY,
  HTTP_ENDPOINT_AUTH_KIND_OAUTH,
  HTTP_ENDPOINT_AUTH_KINDS,
  HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_AUTO,
  HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_JSON,
  HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_TEXT,
  HTTP_ENDPOINT_DEFAULT_TIMEOUT_MS,
  HTTP_ENDPOINT_MAX_TIMEOUT_MS,
  HTTP_ENDPOINT_DEFAULT_MAX_BYTES,
  HTTP_ENDPOINT_MAX_REQUEST_BYTES,
  TOOL_DEFINITION_KEY_MCP_PROXY,
  MCP_PROXY_TRANSPORT_STREAMABLE_HTTP,
  MCP_PROXY_TRANSPORT_SSE,
  MCP_PROXY_TRANSPORTS,
  MCP_PROXY_AUTH_KIND_NONE,
  MCP_PROXY_AUTH_KIND_BEARER,
  MCP_PROXY_AUTH_KIND_HEADER,
  MCP_PROXY_AUTH_KIND_OAUTH,
  MCP_PROXY_AUTH_KINDS,
  MCP_PROXY_DEFAULT_TIMEOUT_MS,
  MCP_PROXY_MAX_TIMEOUT_MS,
  MCP_PROXY_MAX_TOOLS,
  MCP_PROXY_MAX_RESPONSE_BYTES,
  MCP_PROXY_TOOL_NAME_SEP,
  MCP_PROXY_TOOL_NAME_MAX,
  RESERVED_SLUGS,
  MCP_INTERNAL_HEADER,
  MCP_CHANNEL_ID_HEADER,
  MCP_CHANNEL_PLATFORM_HEADER,
  MCP_CHANNEL_CLIENT_USER_AGENT,
  MCP_SESSION_HEADER,
  MCP_REQUEST_METHOD_INITIALIZE,
  MCP_REQUEST_METHOD_PING,
  MCP_REQUEST_METHOD_TOOLS_LIST,
  MCP_REQUEST_METHOD_TOOLS_CALL,
  MCP_REQUEST_METHOD_RESOURCES_LIST,
  MCP_REQUEST_METHOD_RESOURCES_TEMPLATES_LIST,
  MCP_REQUEST_METHOD_RESOURCES_READ,
  MCP_REQUEST_METHOD_PROMPTS_LIST,
  MCP_REQUEST_METHOD_PROMPTS_GET,
  MCP_REQUEST_METHODS,
  MCP_AUTH_KIND_JWT,
  MCP_AUTH_KIND_INTERNAL,
  MCP_AUTH_KINDS,
  JWKS_KV_KEY,
  JWKS_TTL_SECONDS,
  OAUTH_SCOPES_SUPPORTED,
  MCP_SCOPE_READ,
  ARTIFACT_SCOPE_PREFIX,
  BOT_GRANT_TYPE,
  EXTERNAL_LINK_VERIFICATION_PREFIX,
  EXTERNAL_LINK_TTL_SECONDS,
  BOT_ACCESS_TOKEN_TTL_SECONDS,
  LINK_CODE_LENGTH,
  LINK_CODE_ALPHABET,
  BOT_COMMAND_LINK,
  RESERVED_BOT_COMMANDS
};

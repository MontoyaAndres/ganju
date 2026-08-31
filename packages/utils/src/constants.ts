import {
  CLI_OAUTH_CLIENT_NAME,
  CLI_OAUTH_REDIRECT_PATH,
  CLI_OAUTH_REDIRECT_PORTS,
  CLI_OAUTH_SCOPES,
  CONTROL_PLANE_SCOPE,
  CLI_TOKEN_REFRESH_SKEW_SECONDS,
  CUSTOM_CODE_SDK_SPECIFIER,
  CUSTOM_CODE_MAX_BUNDLE_BYTES,
  CREDENTIAL_PROVIDER_CUSTOM_CODE
} from './cliConstants';
import {
  CUSTOM_CODE_BINDING_TOKEN,
  CUSTOM_CODE_BINDING_BROKER,
  CUSTOM_CODE_BINDING_VERSION,
  CUSTOM_CODE_BROKER_ORIGIN,
  CUSTOM_CODE_BROKER_PATH_CONNECTION,
  CUSTOM_CODE_BROKER_PATH_SECRET,
  CUSTOM_CODE_BROKER_PATH_RESOURCES_SEARCH,
  CUSTOM_CODE_BROKER_PATH_RESOURCES_READ,
  CUSTOM_CODE_BROKER_PATH_RESOURCES_LIST,
  CUSTOM_CODE_BROKER_PATH_RESOURCES_CREATE,
  CUSTOM_CODE_BROKER_PATH_RESOURCES_DELETE,
  CUSTOM_CODE_BROKER_PATH_SEND_FILE,
  CUSTOM_CODE_HEALTH_TOOL,
  CUSTOM_CODE_MAX_LOGS,
  CUSTOM_CODE_MAX_LOG_LENGTH
} from './sdkConstants';

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

// Contact form (marketing site → /contact API endpoint) field limits.
const CONTACT_MAX_NAME_LENGTH = 200;
const CONTACT_MAX_EMAIL_LENGTH = 254;
const CONTACT_MIN_MESSAGE_LENGTH = 5;
const CONTACT_MAX_MESSAGE_LENGTH = 5000;

const SLUG_BYTES = 16;
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

const SERVICE_NAME_API = 'api';
const SERVICE_NAME_MCP = 'mcp';
const SERVICE_NAME_RESOURCE_HANDLER = 'resource_handler';
// The custom-code broker. Its own label rather than reusing 'mcp': a failure
// here is a connection or secret that user code could not obtain, which is a
// different thing to debug from an MCP request that went wrong.
const SERVICE_NAME_TOOL_BROKER = 'tool_broker';
const SERVICE_NAMES = [
  SERVICE_NAME_API,
  SERVICE_NAME_MCP,
  SERVICE_NAME_RESOURCE_HANDLER,
  SERVICE_NAME_TOOL_BROKER
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
// Written by a user script through the broker, and by nothing else. This is a
// provenance marker before it is a category: a script may replace a resource
// carrying it and may not touch any other row, which is what stops a tool from
// overwriting a document its owner uploaded. Nothing in the dashboard or the
// upload paths ever sets it.
const RESOURCE_SOURCE_TYPE_CUSTOM_CODE = 'CUSTOM_CODE' as 'CUSTOM_CODE';
const RESOURCE_SOURCE_TYPES = [
  RESOURCE_SOURCE_TYPE_FILE,
  RESOURCE_SOURCE_TYPE_WEBSITE,
  RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER,
  RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER,
  RESOURCE_SOURCE_TYPE_CUSTOM_CODE
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
  'Mozilla/5.0 (compatible; GanjuCrawler/1.0; +https://ganju.ai)';
const CRAWL_PAGE_QUEUE_BATCH_SIZE = 100;

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

/**
 * Countries where Spanish is the (or an) official language.
 *
 * Location, not `Accept-Language`, is what picks a language for a first-time
 * visitor: the Spanish pages carry Colombian legal content (Ley 1480, Ley
 * 1581), so where someone is matters more than how their browser happens to be
 * configured. Both surfaces read this list — the website's `/` Pages Function
 * and the dashboard's middleware — so a visitor who lands on ganju.ai and then
 * signs in at app.ganju.ai gets the same language on both.
 */
const SPANISH_COUNTRIES = [
  'AR',
  'BO',
  'CL',
  'CO',
  'CR',
  'CU',
  'DO',
  'EC',
  'ES',
  'GQ',
  'GT',
  'HN',
  'MX',
  'NI',
  'PA',
  'PE',
  'PR',
  'PY',
  'SV',
  'UY',
  'VE'
];

/**
 * Where an explicit language choice is remembered. The website and the
 * dashboard sit on different hosts under one registrable domain, and the cookie
 * is scoped to that domain (see `languageCookieDomain`) so a choice made on
 * ganju.ai is still honoured after signing in at app.ganju.ai.
 */
const LANGUAGE_COOKIE = 'ganju_lang';
const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** Query parameter that carries an explicit switch, e.g. `?lang=es`. */
const LANGUAGE_QUERY_PARAM = 'lang';

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

// Short backoff for transient Cloudflare platform errors (e.g. a Durable Object
// / Container reset) so the retried job lands after the object has recovered.
const TRANSIENT_BACKOFF_SECONDS = 5;

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

// Kinds of artifact usage — what was exercised on a request. Shared by channel
// message usage and the artifact_execution audit trail (who ran what, when).
const USAGE_KIND_PROMPT = 'prompt' as 'prompt';
const USAGE_KIND_RESOURCE = 'resource' as 'resource';
const USAGE_KIND_TOOL = 'tool' as 'tool';
const USAGE_KINDS = [USAGE_KIND_PROMPT, USAGE_KIND_RESOURCE, USAGE_KIND_TOOL];

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
// ⚠️ This is the SHARED platform model — every Free turn and every paid turn on
// an org with no LLM of its own runs here, and WE pay that inference. The whole
// plan economics rest on Flash-Lite's rate ($0.25/M in · $1.50/M out): the
// planning figure of ~$0.004 per channel turn, Free's ~$0.41/month worst case,
// and the shared-key overage rate all derive from it. Moving to Gemini 3 Flash
// doubles every one of those; a Sonnet-class model is ~15×. Treat a change here
// as a pricing change, not a config tweak — the plan rates have to be redone
// alongside it.
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

// How many recent messages a channel turn replays as context.
const CHANNEL_HISTORY_LIMIT = 20;

// Tighter turn envelope when a channel runs on the shared platform model key
// (Free, no org LLM configured) — we pay that inference, so we bound the two
// dominant cost drivers: input tokens (smaller history) and number of model
// calls (fewer tool loops). Orgs that bring their own key get the full envelope
// above. Lower numbers also cut latency on the same path.
const SHARED_KEY_HISTORY_LIMIT = 10;
const SHARED_KEY_MAX_TOOL_LOOPS = 6;

// Hard ceiling on how many tools a single channel turn exposes to the model.
//
// Tool count is the dominant input-token driver, and it is super-linear: our own
// channel_message rows show a 5-tool artifact averaging 1,103 input tokens/turn
// against 13,109 for a 12-tool one — 2.4× the tools, 12× the tokens, because
// every schema is re-sent on every model call and a turn makes ~3. Uncapped, an
// 80-tool artifact costs ~$21 per 1,000 turns, which is above the shared-key
// overage rate; capped at 40 it tops out near $11 and stays profitable.
//
// This is also a quality control, not only a cost one — tool selection degrades
// badly past a few dozen options. Applies to CHANNEL turns only: MCP-client
// traffic pays its own token cost on the client's model, so it isn't capped
// here.
const CHANNEL_MAX_TOOLS = 40;

// Message debounce — people type the way they talk, in bursts ("hey" / "quick
// question" / "about the invoice"). Answering each fragment separately produces
// three half-informed replies and bills three assistant turns. Instead a burst
// from ONE participant in ONE conversation is buffered and answered once.
//
// The window restarts on every new message (so it tracks the typist), bounded by
// CHANNEL_DEBOUNCE_MAX_WAIT_MS from the first buffered message so a chatty user
// still gets an answer, and by CHANNEL_DEBOUNCE_MAX_MESSAGES so one batch can't
// grow without limit. `debounceMs: 0` on channel.config disables buffering and
// restores the answer-every-message behavior.
const CHANNEL_DEBOUNCE_DEFAULT_MS = 5000;
const CHANNEL_DEBOUNCE_MIN_MS = 500;
const CHANNEL_DEBOUNCE_MAX_MS = 30_000;
const CHANNEL_DEBOUNCE_MAX_WAIT_MS = 60_000;
const CHANNEL_DEBOUNCE_MAX_MESSAGES = 20;
// Disables buffering for a channel when set as `config.debounceMs`.
const CHANNEL_DEBOUNCE_DISABLED = 0;
// How buffered texts are joined into the single user turn the model sees. A
// newline keeps each fragment on its own line rather than running them together.
const CHANNEL_DEBOUNCE_JOIN = '\n';
// Backoff between retries when the DO can't hand a flushed batch to the worker,
// and how many times it tries before dropping the batch rather than looping.
const CHANNEL_DEBOUNCE_RETRY_MS = 5000;
const CHANNEL_DEBOUNCE_MAX_ATTEMPTS = 3;

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

// The Slack app configuration Ganju needs, surfaced in the UI when connecting a
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

// Discord. Free-form messages / @mentions / DMs arrive over a persistent Gateway
// WebSocket (held in a Durable Object); native slash commands arrive over a
// separate Ed25519-signed Interactions HTTP endpoint. The bot identity token,
// the application id (for command registration + interaction follow-ups), and
// the application public key (for verifying interactions) are all stored as the
// channel's credentials.
const DISCORD_API_BASE = 'https://discord.com/api/v10';
// Gateway connection query (JSON encoding, API v10). The actual socket URL is
// discovered from GET /gateway/bot (or the resume_gateway_url after READY).
const DISCORD_GATEWAY_QUERY = '?v=10&encoding=json';
const DISCORD_MESSAGE_LIMIT = 2000;
// Default bot upload ceiling for a server without boosts. Larger files should be
// shared as links, not uploaded; this also keeps the container's memory sane.
const DISCORD_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// Discord renders at most 5 buttons per action row — source links become a
// single row of link buttons (mirroring Telegram's inline keyboard).
const DISCORD_MAX_SOURCE_BUTTONS = 5;
// Gateway intents the bot identifies with: GUILDS (1<<0) + GUILD_MESSAGES
// (1<<9) + DIRECT_MESSAGES (1<<12) + MESSAGE_CONTENT (1<<15, privileged — must
// be enabled in the Developer Portal to read free-form text in servers).
const DISCORD_INTENTS = (1 << 0) | (1 << 9) | (1 << 12) | (1 << 15);
// Interactions are signed with Ed25519 over `{timestamp}{rawBody}`; verify
// against the application public key.
const DISCORD_SIGNATURE_HEADER = 'x-signature-ed25519';
const DISCORD_TIMESTAMP_HEADER = 'x-signature-timestamp';
// Interaction request types and response types (Discord API).
const DISCORD_INTERACTION_TYPE_PING = 1;
const DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND = 2;
const DISCORD_INTERACTION_RESPONSE_PONG = 1;
const DISCORD_INTERACTION_RESPONSE_DEFERRED = 5;
// Channel types we map to conversation scopes: DM (1) / group DM (3) = private;
// everything else (guild text channels, threads) = channel.
const DISCORD_CHANNEL_TYPE_DM = 1;
const DISCORD_CHANNEL_TYPE_GROUP_DM = 3;
// Discord Gateway opcodes (the persistent WebSocket protocol the bot speaks to
// receive messages). See https://discord.com/developers/docs/topics/gateway.
const DISCORD_GATEWAY_OP_DISPATCH = 0;
const DISCORD_GATEWAY_OP_HEARTBEAT = 1;
const DISCORD_GATEWAY_OP_IDENTIFY = 2;
const DISCORD_GATEWAY_OP_RESUME = 6;
const DISCORD_GATEWAY_OP_RECONNECT = 7;
const DISCORD_GATEWAY_OP_INVALID_SESSION = 9;
const DISCORD_GATEWAY_OP_HELLO = 10;
const DISCORD_GATEWAY_OP_HEARTBEAT_ACK = 11;
// Default heartbeat cadence (ms) until HELLO supplies the real interval.
const DISCORD_GATEWAY_DEFAULT_HEARTBEAT_MS = 41250;

// WhatsApp (Meta Cloud API). Inbound messages and the GET verification handshake
// hit the same per-channel Request URL the tenant configures in their Meta app
// dashboard. Meta signs every POST with the app secret over the RAW body —
// `sha256=<hmac>` in the x-hub-signature-256 header (mirrors Slack's scheme).
// The GET handshake echoes hub.challenge when hub.verify_token matches the
// channel's stored token. Like Slack, there's no group concept for the Cloud
// API bot — every conversation is a 1:1 (private) chat keyed by the user's wa_id.
const WHATSAPP_API_BASE = 'https://graph.facebook.com';
const WHATSAPP_API_VERSION = 'v25.0';
// A WhatsApp text message body caps at 4096 chars; we chunk a bit under that.
const WHATSAPP_MESSAGE_LIMIT = 4000;
const WHATSAPP_SIGNATURE_HEADER = 'x-hub-signature-256';
const WHATSAPP_SIGNATURE_PREFIX = 'sha256=';
// GET-handshake query params + the expected hub.mode value.
const WHATSAPP_HUB_MODE_PARAM = 'hub.mode';
const WHATSAPP_HUB_VERIFY_TOKEN_PARAM = 'hub.verify_token';
const WHATSAPP_HUB_CHALLENGE_PARAM = 'hub.challenge';
const WHATSAPP_HUB_MODE_SUBSCRIBE = 'subscribe';
// Cloud API media ceilings by category (Meta-enforced). Documents are the
// largest; images the smallest. Used to reject an oversize send before upload.
const WHATSAPP_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const WHATSAPP_MAX_VIDEO_BYTES = 16 * 1024 * 1024;
const WHATSAPP_MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const WHATSAPP_MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;

const EMBEDDING_MODEL = 'gemini-embedding-001';
// 1536, not the model's native 3072. Matryoshka training means the first half of
// the vector carries almost all the signal: measured on our own corpus, 1536
// agrees with exact 3072 search on 93% of top-10 results — while the HNSW index
// we already run agrees only 73% of the time, so this costs less fidelity than
// the index itself does. In exchange the vector and its index entry both halve,
// taking embedded storage from ~12.9x expansion to ~6.9x.
//
// Two things depend on this staying in step: the halfvec(1536) column in
// packages/db, and the l2Normalize call in both embed paths — the API does NOT
// normalise output below 3072 dimensions.
const EMBEDDING_DIMENSIONS = 1536;
const CHUNK_TARGET_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;
const EMBED_BATCH_SIZE = 96;

const RESOURCE_HANDLER_SLEEP_AFTER = '10m';

const DOCS_URL = 'https://docs.ganju.ai';

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
const PROMPT_TOOL_KEY_LIST_PROMPTS = 'list-prompts';
const RESOURCE_TOOL_KEYS = [
  RESOURCE_TOOL_KEY_LIST_RESOURCES,
  RESOURCE_TOOL_KEY_SEARCH_RESOURCES,
  RESOURCE_TOOL_KEY_READ_RESOURCE,
  RESOURCE_TOOL_KEY_SEND_RESOURCE,
  PROMPT_TOOL_KEY_LIST_PROMPTS
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
// custom-code secrets are the `ctx.secret(name)` values a user script reads at
// runtime. Same multi-row shape as the two above — many per artifact, labelled
// in metadata, no vendor to validate — but the label is also the LOOKUP KEY the
// script passes to ctx.secret(), not just a display string. The broker resolves
// them; the secret value itself never reaches user code as a binding. Defined in
// cliConstants because `ganju secret` writes under it.
// Providers whose secrets are per-tool (many rows per artifact, deleted with the
// tool that owns them) rather than one-per-provider. See createCredential /
// removeTool in apps/api ArtifactController.
const PER_TOOL_CREDENTIAL_PROVIDERS = [
  CREDENTIAL_PROVIDER_HTTP_ENDPOINT,
  CREDENTIAL_PROVIDER_MCP_PROXY,
  CREDENTIAL_PROVIDER_CUSTOM_CODE
];
// Every provider the generic credential create endpoint accepts.
const CREDENTIAL_PROVIDERS = [
  API_KEY_PROVIDER_CALCOM,
  API_KEY_PROVIDER_TAVILY,
  CREDENTIAL_PROVIDER_HTTP_ENDPOINT,
  CREDENTIAL_PROVIDER_MCP_PROXY,
  CREDENTIAL_PROVIDER_CUSTOM_CODE
];

const CALCOM_API_BASE = 'https://api.cal.com/v2';
// Cal.com pins behavior per endpoint with the `cal-api-version` header.
const CALCOM_API_VERSION_EVENT_TYPES = '2024-06-14';
const CALCOM_API_VERSION_SLOTS = '2024-09-04';
const CALCOM_API_VERSION_BOOKINGS = '2026-02-25';
const CALCOM_API_VERSION_ME = '2024-06-14';

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

// `custom-code` is the third proxied tool definition, and the only one whose
// behaviour is USER CODE rather than user configuration: one artifact_tool row
// per artifact, pointing at a Cloudflare Worker deployed to our Workers for
// Platforms dispatch namespace. Like mcp-proxy, one row produces MANY MCP tools
// — but the tool list comes from the manifest the user uploads rather than from
// a remote round-trip, and it is versioned (artifact_tool_version) so code and
// contract move together and a rollback restores both.
//
// The row's config holds only `activeVersionId` plus the egress/limit settings;
// names and schemas live on the version. That's what keeps MCP boot off the
// dispatcher — a slow or broken script must never break tools/list. See
// docs/CUSTOM_TOOLS.md ("Boot contract").
const TOOL_DEFINITION_KEY_CUSTOM_CODE = 'custom-code';

// A version is uploaded as `draft`, becomes `published` when it is made active,
// and is `archived` when a later version replaces it. Exactly one version per
// tool is ever `published` — the one config.activeVersionId points at.
const CUSTOM_CODE_VERSION_STATUS_DRAFT = 'draft' as 'draft';
const CUSTOM_CODE_VERSION_STATUS_PUBLISHED = 'published' as 'published';
const CUSTOM_CODE_VERSION_STATUS_ARCHIVED = 'archived' as 'archived';
const CUSTOM_CODE_VERSION_STATUSES = [
  CUSTOM_CODE_VERSION_STATUS_DRAFT,
  CUSTOM_CODE_VERSION_STATUS_PUBLISHED,
  CUSTOM_CODE_VERSION_STATUS_ARCHIVED
];

// Where a version's stored source came from, which decides whether it can be
// opened in the dashboard editor.
//
// 'editor' — the bytes at sourceKey are exactly what a person typed. They are
// the deployed module too: dashboard code imports the SDK from a sibling module
// the upload always attaches, so there is no build step between the text box and
// the running Worker, and no second copy that can drift from it.
//
// 'bundle' — the CLI compiled and uploaded it. Deployable, but minified and
// machine-shaped; the editor shows it read-only rather than inviting someone to
// overwrite a real build with the contents of a text box. It is the default
// because every version that predates the editor arrived this way.
const CUSTOM_CODE_SOURCE_KIND_EDITOR = 'editor' as 'editor';
const CUSTOM_CODE_SOURCE_KIND_BUNDLE = 'bundle' as 'bundle';
const CUSTOM_CODE_SOURCE_KINDS = [
  CUSTOM_CODE_SOURCE_KIND_EDITOR,
  CUSTOM_CODE_SOURCE_KIND_BUNDLE
];

// The SDK, shipped as a second ES module beside every uploaded script rather
// than bundled into it. Attached on every deploy, including CLI ones: a bundle
// that inlined the SDK simply never imports it, and one extra module costs less
// than a branch in the deploy path that has to know which kind it is holding.
const CUSTOM_CODE_SDK_MODULE = 'ganju-sdk.js';

// The module the dispatcher calls. Every other file in a project is reached only
// by being imported from it, directly or otherwise.
const CUSTOM_CODE_MAIN_MODULE = 'index.js';

// How many files one script may hold, and how long a path may be. Neither is a
// runtime limit — a Worker takes far more — they bound what one editor session
// can produce, and keep the stored envelope small enough to stay a single R2
// object read on every deploy.
const CUSTOM_CODE_MAX_FILES = 25;
const CUSTOM_CODE_MAX_FILE_PATH = 100;

// WfP script name: `artifact_<artifactId>_<upload>`. The id, never the slug —
// slugs are user-editable and a rename would orphan the deployed script.
//
// The trailing segment is minted per upload rather than derived from anything,
// which is the whole point: uploading over a name that already exists is not
// read-your-writes, so a deploy that replaces a script can serve the previous
// edition for up to half a minute. A name nothing has ever used cannot, and
// costs nothing to mint. Everything a publish used to do to survive that race —
// waiting on an edition marker, refusing with a 503, putting the previous bundle
// back when validation failed — went with the reuse that caused it.
const CUSTOM_CODE_SCRIPT_NAME_PREFIX = 'artifact_';

// Worker names cap at 63 characters, and `artifact_<uuid>` already spends 45.
// That leaves 17 for a separator and a suffix, so a second uuid does not fit and
// neither does a hex-32 digest. Twelve hex characters is 48 bits against a
// namespace holding at most a few hundred names for any one artifact — not a
// collision worth checking for, and an upload to a name in use would fail loudly
// rather than quietly serve the wrong code.
const CUSTOM_CODE_SCRIPT_NAME_MAX = 63;
const CUSTOM_CODE_UPLOAD_SUFFIX_CHARS = 12;

// How long a superseded script stays in the namespace before the hourly sweep
// may collect it.
//
// Deleting at publish time would race the thing it deletes: a tool call that
// resolved the old pointer a moment earlier is still in flight, and the pointer
// moving does not recall it. An hour is far longer than any call can take, and
// the wait costs $0.02 per script per month against an allowance of 1,000.
const CUSTOM_CODE_SWEEP_GRACE_MS = 60 * 60 * 1_000;

// Deletes per sweep. A backlog drains over several hourly runs rather than
// making one run unbounded — the same shape the retention purge uses.
const CUSTOM_CODE_SWEEP_MAX_DELETES = 200;

// A second script per artifact, `artifact_<id>_preview`, that the Test panel
// deploys a draft into and calls.
//
// Separate from the live script and not a mode of it: testing must never disturb
// what MCP clients are being served, and the only way to be sure of that is for
// the test to run somewhere else entirely. It is overwritten by the next test
// and deleted after each run.
const CUSTOM_CODE_PREVIEW_SCRIPT_SUFFIX = '_preview';

// How long a preview token stays valid.
//
// The live token needs no expiry — the broker refuses any token whose version is
// not the active one, so publishing rotates it. A preview token has no such
// anchor: its whole purpose is to work for a version that is NOT active, so
// something else has to end it. Ten minutes is longer than any test run and far
// shorter than the life of a script that failed to delete.
const CUSTOM_CODE_PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1_000;

// How long a single test run may take before the API gives up on it. Shorter
// than the script's own CPU ceiling is not the point — this bounds the wait of
// someone watching a spinner.
const CUSTOM_CODE_TEST_TIMEOUT_MS = 30_000;

// R2 prefix for uploaded bundles. Keyed by artifact + version so a rollback can
// always find the exact source that produced the running script.
const CUSTOM_CODE_SOURCE_KEY_PREFIX = 'custom-code';

// How many MCP tools one script may declare. Deliberately tighter than
// MCP_PROXY_MAX_TOOLS (100): a proxied vendor server is a fixed remote surface,
// whereas a manifest is user-authored and tool count is the dominant input-token
// driver on channel turns (see CHANNEL_MAX_TOOLS). A channel only ever sees 40
// of them; this cap bounds the manifest itself, which every MCP client pays for.
const CUSTOM_CODE_MAX_TOOLS = 50;
// Max length of a declared tool name — the limit MCP clients (incl. the
// Anthropic API) enforce, same ceiling as the composed mcp-proxy names.
const CUSTOM_CODE_TOOL_NAME_MAX = 64;

// Per-invocation dispatch timeout, clamped rather than rejected (same shape as
// http-endpoint / mcp-proxy). This bounds how long apps/mcp waits on the
// dispatcher; the per-script CPU ceiling on the namespace is a separate control
// and is a Phase 2 item.
const CUSTOM_CODE_DEFAULT_TIMEOUT_MS = 10_000;
const CUSTOM_CODE_MAX_TIMEOUT_MS = 30_000;

// Response body cap returned to the model; truncated past this with a marker
// (same ceiling as the other two proxied definitions).
const CUSTOM_CODE_MAX_RESPONSE_BYTES = 256 * 1024;

// Hard ceiling on an uploaded bundle, checked before the body is streamed to R2.
// Set well below Cloudflare's own script-size ceiling so a rejection happens
// here — with a legible error — rather than at deploy time in Phase 2.

// Three hops have to agree on a wire shape, and none of them share a module
// graph at runtime — apps/mcp dispatches, the user's script runs inside the
// namespace, and apps/tool-broker serves its host capabilities. Keeping every
// path, header and binding name below is what stops the three from drifting.

// The dispatcher POSTs to the user script at this origin. The hostname is never
// resolved: a dispatch-namespace `fetch` is routed by script name, so the URL
// only has to be a well-formed absolute URL the user script can parse.
const CUSTOM_CODE_INVOKE_ORIGIN = 'https://tool.ganju.internal';
const CUSTOM_CODE_INVOKE_PATH = '/invoke';

// A reserved tool name the SDK answers itself, without running user code. The
// publish pipeline calls it once against the freshly uploaded script and expects
// back the list of tool names the bundle actually exports. Declared in
// ./sdkConstants — it is one of the few values that ships inside every deployed
// script — and re-exported below with the rest.

// Reserved MCP tool names
//
// `http-endpoint` and `custom-code` let the user choose the MCP tool name, and
// apps/mcp registers every tool on an artifact into ONE flat namespace. A
// user-chosen name equal to a native tool's definition key is therefore a
// collision, and both possible resolutions are bad: whichever registers second
// is silently dropped, and the channel runner attributes the call to the other
// one. Rejecting the name at the write path is the only place the user can be
// told about it.
//
// Reserved by NAMESPACE, not by an enumerated list of the ~60 shipped keys.
// A blocklist would answer "is this name taken today" — which is the wrong
// question, because a name that is free at publish time is taken the moment
// someone installs a native tool that uses it. Owning the prefix means a tool
// added to any of these groups later can never collide with a name already
// published, so this list only changes when a whole new group is added.
//
// mcp-proxy needs no entry: its names are always `<prefix>__<remote>`, and no
// native key contains the separator.
const RESERVED_TOOL_NAME_PREFIXES = [
  'gmail-',
  'outlook-',
  'slack-',
  CALENDAR_TOOL_KEY_PREFIX,
  CALCOM_TOOL_KEY_PREFIX,
  WEB_TOOL_KEY_PREFIX
];

// The keys that don't belong to a prefixed group: the RAG core the channel
// runner intercepts by name, the smoke-test tool, the three proxied definition
// keys (each registers under its own key when installed natively), and the
// health tool the SDK answers before it routes to user code.
const RESERVED_TOOL_NAMES = [
  ...RESOURCE_TOOL_KEYS,
  'greeting',
  TOOL_DEFINITION_KEY_HTTP_ENDPOINT,
  TOOL_DEFINITION_KEY_MCP_PROXY,
  TOOL_DEFINITION_KEY_CUSTOM_CODE,
  CUSTOM_CODE_HEALTH_TOOL
];

// Shared by both write paths so there is one string to translate. It has to
// carry a word `matchStatus` recognises (errorHandler.ts), because the
// http-endpoint path re-throws the issue message as a plain Error and anything
// unrecognised becomes an opaque 500 instead of a 400.
const RESERVED_TOOL_NAME_MESSAGE =
  'Invalid tool name — reserved by the platform';

// A declared connection that names no managed provider. Fixed string for the
// same two reasons as the message above: localizeZodIssue keys on the exact
// English text, and the value has to carry a word matchStatus recognises or the
// custom-code config path — which rethrows the issue message as a plain Error —
// answers 500 where it means 400. The offending entry is pinpointed by the issue
// path (`connections.2`), not by the message.
const CUSTOM_CODE_UNKNOWN_CONNECTION_MESSAGE =
  'Invalid connection — no managed provider by that name';

// An output schema has to describe an object, because that is what MCP's
// `structuredContent` is. A schema of any other type compiles to an empty shape
// and can never be satisfied, so the tool would declare structured output and
// then report every call as a failure to produce it.
//
// A fixed string rather than one that names the offending type: localizeZodIssue
// keys its translations on the exact English text. The issue `path` says which
// entry, which is what a 50-tool manifest needs anyway.
const OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE =
  'Invalid output schema — it must describe an object';

// The script bindings and the broker routes they call live in ./sdkConstants:
// they are the SDK's runtime contract, so they are bundled into every deployed
// script and must not drag this module in with them.

// Outbound-worker parameters the dispatcher attaches to every `.get()`. The
// outbound worker reads them from its own env to screen the script's `fetch`
// calls — which is why egress control can't be bypassed by editing the script.
const CUSTOM_CODE_OUTBOUND_PARAM_ARTIFACT_ID = 'artifactId' as 'artifactId';
const CUSTOM_CODE_OUTBOUND_PARAM_ALLOWED_HOSTS =
  'allowedHosts' as 'allowedHosts';

// Hosts the outbound worker allows regardless of a tool's `allowedHosts`.
//
// The dispatch namespace routes every subrequest that originates inside it
// through the outbound worker — including the ones the BROKER makes on the
// script's behalf, which is not obvious until you watch it happen. Without this
// list, `ctx.resources.search` breaks the moment a tool sets an allow-list
// (the embedding call is a fetch to Gemini), and so does refreshing a
// connection (a fetch to the provider's token endpoint).
//
// `allowedHosts` exists to bound where a tool's OWN code may reach, so the
// platform's capabilities have no business being caught by it. Reaching these
// hosts is not itself a capability: without our API key or client secret,
// neither answers usefully.
//
// The SSRF screen still applies to these — this widens the allow-list, never
// the private-address block.
const CUSTOM_CODE_PLATFORM_HOSTS = [
  // Embeddings for ctx.resources.search.
  'generativelanguage.googleapis.com',
  // Token endpoints the broker refreshes managed connections against. Kept in
  // step with oauthProviders by hostname rather than by URL.
  'oauth2.googleapis.com',
  'login.microsoftonline.com',
  'slack.com'
];

// `GANJU_TOOL_TOKEN` is `<base64url(payload)>.<base64url(hmac)>`, signed with
// CUSTOM_CODE_TOKEN_SECRET. It carries the artifact and the version it was
// minted for; the broker checks the signature AND that the version is still the
// artifact's active one, so a superseded script's token stops working the moment
// a newer version is published. Never accept an artifact id from a request body.
const CUSTOM_CODE_TOKEN_SECRET_ENV = 'CUSTOM_CODE_TOKEN_SECRET';
const CUSTOM_CODE_TOKEN_VERSION = 'v1';

// Cloudflare credentials the publish pipeline needs to upload a script into the
// dispatch namespace.
//
// The token deliberately does NOT use Cloudflare's own `CLOUDFLARE_API_TOKEN`
// name. Wrangler reads that variable from the .env in its working directory and
// authenticates with it instead of the developer's OAuth login — so putting our
// token there silently reroutes every `wrangler deploy` through a token scoped
// only to Workers Scripts, breaking any deploy that touches zone routes and
// making `wrangler login` refuse to run. Ours is namespaced so the two can
// coexist. `CLOUDFLARE_ACCOUNT_ID` keeps its standard name: wrangler reads it
// too, but selecting the right account is the behaviour we want.
const CUSTOM_CODE_ACCOUNT_ID_ENV = 'CLOUDFLARE_ACCOUNT_ID';
const CUSTOM_CODE_API_TOKEN_ENV = 'CUSTOM_CODE_CF_API_TOKEN';
const CUSTOM_CODE_NAMESPACE_ENV = 'CUSTOM_CODE_DISPATCH_NAMESPACE';
// The broker worker each uploaded script is service-bound to. An env var rather
// than a constant because the name is environment-suffixed
// (ganju-tool-broker-development / -production).
const CUSTOM_CODE_BROKER_SERVICE_ENV = 'CUSTOM_CODE_BROKER_SERVICE';

// Compatibility date pinned for every uploaded user script. Deliberately a
// constant rather than "today": a script uploaded now and re-uploaded on
// rollback months later must run identically both times.
const CUSTOM_CODE_COMPATIBILITY_DATE = '2025-11-17';

// Per-invocation CPU ceiling applied to each user script at upload time. Far
// tighter than our own workers' 30s — this is the technical cap that bounds
// what one adversarial call can cost us, so an infinite loop in a customer's
// tool is billed as five seconds rather than as whatever it wanted.
// How long a deploy waits for a freshly minted script name to become
// dispatchable, and how often it asks.
//
// Every upload goes to a name that has never been used, which is
// read-your-writes: ~2s end to end against the deployed namespace, against the
// 20-41s a replacement could take. So this bounds how long a brand-new name
// takes to register, never how long an old edition takes to stop answering —
// there is no old edition. It is short for that reason, and a script that
// answers with the wrong edition now fails outright instead of being waited on.
const CUSTOM_CODE_REGISTER_TIMEOUT_MS = 8_000;
const CUSTOM_CODE_REGISTER_INTERVAL_MS = 500;

const CUSTOM_CODE_SCRIPT_CPU_MS = 5_000;

// The ctx.log() caps also live in ./sdkConstants — the buffer that enforces them
// runs inside the isolate.

// ctx.sendFile destinations.
//
// The one capability a user script genuinely cannot reproduce: a script is
// capped at 128MiB, holds no R2 binding, and has no path to the resource-handler
// container. So the bytes never enter the isolate — the script names a resource
// and a destination, and the broker does the read and the multipart assembly on
// its behalf.
//
// Each destination maps onto a container route the native handlers already
// drive, which is why the list is these three and not every provider we hold a
// connection for: a destination here means a send path that has already solved
// chunked uploads and MIME assembly for that vendor.
const CUSTOM_CODE_SEND_FILE_TARGET_GMAIL = 'gmail' as 'gmail';
const CUSTOM_CODE_SEND_FILE_TARGET_OUTLOOK = 'outlook' as 'outlook';
const CUSTOM_CODE_SEND_FILE_TARGET_SLACK = 'slack' as 'slack';
const CUSTOM_CODE_SEND_FILE_TARGETS = [
  CUSTOM_CODE_SEND_FILE_TARGET_GMAIL,
  CUSTOM_CODE_SEND_FILE_TARGET_OUTLOOK,
  CUSTOM_CODE_SEND_FILE_TARGET_SLACK
];

// Which managed connection each destination sends as. sendFile spends the
// artifact's credential, so it passes through the SAME `connections` allow-list
// ctx.connection() does — a script that may not read the Gmail token must not be
// able to send mail as that account by naming a different capability.
const CUSTOM_CODE_SEND_FILE_PROVIDERS: Record<string, string> = {
  [CUSTOM_CODE_SEND_FILE_TARGET_GMAIL]: OAUTH_PROVIDER_GOOGLE_GMAIL,
  [CUSTOM_CODE_SEND_FILE_TARGET_OUTLOOK]: OAUTH_PROVIDER_MICROSOFT_OUTLOOK,
  [CUSTOM_CODE_SEND_FILE_TARGET_SLACK]: OAUTH_PROVIDER_SLACK
};

// The resource-handler container route each destination posts to. These are the
// routes the native handlers use, unchanged — the container is where MIME
// assembly and chunked upload already live, and a second implementation in the
// broker is exactly what this indirection avoids.
const CUSTOM_CODE_SEND_FILE_PATHS: Record<string, string> = {
  [CUSTOM_CODE_SEND_FILE_TARGET_GMAIL]: '/gmail/send',
  [CUSTOM_CODE_SEND_FILE_TARGET_OUTLOOK]: '/outlook/send',
  [CUSTOM_CODE_SEND_FILE_TARGET_SLACK]: '/slack/send'
};

// How many resources one sendFile call may carry. Bounded because each one is
// read out of R2 into the broker's 128MiB isolate before it is streamed on; the
// per-destination byte caps below bound total size, this bounds the read fan-out.
const CUSTOM_CODE_SEND_FILE_MAX_URIS = 10;

// Ceilings on what one ctx.resources.create call may write.
//
// Two numbers rather than one, because the two payloads land in different
// places. Inline text becomes a Postgres column on a row every resource listing
// reads, so it stays small; bytes become an R2 object nothing reads until it is
// sent, so it can be larger.
//
// Both are far below the 128MiB isolate ceiling, and deliberately so: unlike
// sendFile, this payload DOES transit user code — the script is holding it —
// and it is then carried again as base64 in the broker request, so the real
// footprint is roughly 2.3x the number here. The file ceiling is also under
// every destination's attachment cap, so anything a script can create it can
// also send.
const CUSTOM_CODE_MAX_RESOURCE_TEXT_BYTES = 1024 * 1024;
const CUSTOM_CODE_MAX_RESOURCE_FILE_BYTES = 10 * 1024 * 1024;

// Default URI scheme for a script-created resource, matching what the dashboard
// generates for an uploaded file — a resource a tool wrote should be addressable
// exactly like one a person uploaded, including by sendFile.
const CUSTOM_CODE_RESOURCE_URI_PREFIX = 'resource://';

// How far a script's resource writes reach, declared per tool rather than
// assumed.
//
// `own` — the default — lets a script replace and delete only what a script
// created. It is the safe floor: a tool cannot touch a document its owner
// uploaded or a page the crawler indexed, so a buggy or model-generated tool has
// nothing of the customer's to destroy.
//
// `all` lifts that, which is what a tool whose job is to prune a stale crawl or
// retire an imported folder actually needs. It is declared in the tool's config
// and enforced by the broker, so it cannot be granted from inside the script —
// the same shape as allowedHosts and connections, and for the same reason: a
// capability the code can widen is not a capability, it is a comment.
const CUSTOM_CODE_RESOURCE_ACCESS_OWN = 'own' as 'own';
const CUSTOM_CODE_RESOURCE_ACCESS_ALL = 'all' as 'all';
const CUSTOM_CODE_RESOURCE_ACCESS_VALUES = [
  CUSTOM_CODE_RESOURCE_ACCESS_OWN,
  CUSTOM_CODE_RESOURCE_ACCESS_ALL
];

// Refusing to touch a row a script does not own. Two messages rather than one
// because the two calls leave the reader in different positions: the fix for a
// create is a different uri, and there is no fix for a delete — the resource
// simply is not the script's to remove. Both are phrased for the model that
// will read them, which needs to do something else rather than retry.
const CUSTOM_CODE_RESOURCE_NOT_OWNED_MESSAGE =
  'A resource with this uri already exists on this artifact and was not created by a tool, so it cannot be replaced. Choose a different uri.';
const CUSTOM_CODE_RESOURCE_NOT_DELETABLE_MESSAGE =
  'This resource was not created by a tool, so it cannot be deleted from one. Set this tool\'s resource access to "all" to allow it, or remove it from the Resources page.';

// Deleting a parent without saying so would take its children with it through
// the FK cascade — silently, and leaving the artifact's counters describing rows
// that no longer exist. Refused instead, naming the flag that means it.
const CUSTOM_CODE_RESOURCE_HAS_CHILDREN_MESSAGE =
  'This resource has children, which would be removed with it. Pass { children: true } to confirm.';

// Indexing a payload nothing can extract text from produces zero chunks and a
// resource that looks indexed and never matches anything. Refused up front.
const CUSTOM_CODE_RESOURCE_NOT_EMBEDDABLE_MESSAGE =
  'This file type cannot be indexed for search. Create it without index, or pass the text as content.';

// Validation messages for ctx.resources.create. Constants rather than inline
// strings because localizeZodIssue keys its translations on the exact English
// text, so the two files have to name the same value.
const CUSTOM_CODE_RESOURCE_PAYLOAD_MESSAGE =
  'Pass exactly one of content (text) or bytes (base64)';
const CUSTOM_CODE_RESOURCE_TEXT_TOO_LARGE_MESSAGE = `Inline content exceeds the ${CUSTOM_CODE_MAX_RESOURCE_TEXT_BYTES / (1024 * 1024)}MB limit`;
const CUSTOM_CODE_RESOURCE_FILE_TOO_LARGE_MESSAGE = `File bytes exceed the ${CUSTOM_CODE_MAX_RESOURCE_FILE_BYTES / (1024 * 1024)}MB limit`;

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

const MCP_INTERNAL_HEADER = 'x-ganju-internal-secret';
const MCP_CHANNEL_ID_HEADER = 'x-ganju-channel-id';
const MCP_CHANNEL_PLATFORM_HEADER = 'x-ganju-channel-platform';
const MCP_CHANNEL_CLIENT_USER_AGENT = 'ganju-channel/0.0.1';
const JWKS_KV_KEY = 'jwks:v1';
const JWKS_TTL_SECONDS = 600;

// Standard OIDC scopes the better-auth oauthProvider honors for user OAuth
// flows. Advertised in the OAuth discovery documents (RFC 8414
// authorization-server metadata and RFC 9728 protected-resource metadata).
const OAUTH_SCOPES_SUPPORTED = ['openid', 'profile', 'email', 'offline_access'];

// Ganju-specific OAuth scopes for MCP access. `mcp:read` is the default scope
// minted by the bot-on-behalf-of grant (a custom grant that bypasses the OIDC
// authorize endpoint). `artifact:<slug>` — built from this prefix — gates a
// subjectless machine token to a single MCP server in the MCP auth middleware.
// Neither is in better-auth's OIDC scope allowlist, so they are NOT advertised
// in the discovery documents: a standard OIDC client requesting an advertised
// scope that isn't allowlisted would be rejected with `invalid_scope`.
// TODO: Net: mcp:read is a cosmetic claim on bot tokens; artifact: is a code path that can't fire. Neither affects security today. They become real only if you build the per-server confinement feature (which would make artifact:<slug> issued + enforced). This is more for OIDC.
const MCP_SCOPE_READ = 'mcp:read';
const ARTIFACT_SCOPE_PREFIX = 'artifact:';

// `CONTROL_PLANE_SCOPE` (defined in ./cliConstants, re-exported below) is what
// a bearer token needs before it may act as the user on the control plane —
// publish code, read and rotate secrets, change billing.
//
// Access tokens are minted for MCP clients too: a customer who connects Claude
// Desktop to one of their MCP servers hands it a token for their own account,
// and `/oauth2/userinfo` will happily confirm that it is theirs. Without a scope
// that separates the two, "this token belongs to the user" would be the same
// sentence as "this token may deploy code as the user", and connecting an MCP
// client would silently be an act of full delegation.
//
// Deliberately outside OAUTH_SCOPES_SUPPORTED: it is allowlisted on the provider
// so the CLI can request it, and left out of discovery, which is what an MCP
// client reads to decide what to ask for.

// The CLI signs in as a public OAuth client through a loopback redirect
// (RFC 8252) — the flow `wrangler`, `gh` and `vercel` all use. It registers
// itself through RFC 7591 dynamic registration on first login rather than
// relying on a client row someone had to provision by hand, and caches the id
// it was given.
//
// A fixed port would fail whenever something else already held it, so the CLI
// binds the first one here that is free. All of them are registered up front
// rather than only the one that gets used: the provider does implement RFC 8252
// loopback matching, where the port is ignored for a 127.0.0.0/8 redirect, but
// that is one library's behaviour and this is a login that has already opened
// someone's browser by the time it would fail.

// A personal access token — the durable credential a machine with no browser
// uses, where an OAuth access token's one hour is not enough. Bound to one
// project, because that is the unit a deploy pipeline works on: one repository,
// one artifact, one credential in its CI settings.
//
// The prefix is part of the value rather than decoration: it is what lets the
// middleware tell one of these from an OAuth token before it decides which
// lookup to make, and it is what secret scanners match on when one leaks into a
// repository. The rest is 32 random bytes, base64url — the token is the only
// place the value ever exists in plaintext, since what is stored is its hash.
const ACCESS_TOKEN_PREFIX = 'ganju_pat_';
const ACCESS_TOKEN_BYTES = 32;

// Enough of the secret to recognise a row by, and not enough to be worth
// stealing. Shown in the dashboard and by `ganju token list` beside the name.
const ACCESS_TOKEN_HINT_CHARS = 6;

const ACCESS_TOKEN_NAME_MAX = 100;

// A ceiling per project, so a compromised session cannot quietly mint an
// unbounded set of credentials that each survive the session being ended.
const ACCESS_TOKEN_MAX_PER_PROJECT = 20;

// An expiry is optional, because a scheduled deploy that dies on a date nobody
// wrote down is its own kind of outage — but a year is the longest we will
// write one for.
const ACCESS_TOKEN_MAX_EXPIRY_DAYS = 365;

// `last_used_at` is a convenience, not an audit log, so it is written at most
// this often per token rather than on every request. The question it answers —
// "is anything still using this, or can I revoke it" — does not get a better
// answer from minute-level precision, and the write would otherwise land on the
// hot path of every CI request.
const ACCESS_TOKEN_LAST_USED_INTERVAL_MS = 5 * 60 * 1000;

// The only path a personal access token may reach without naming the project it
// is scoped to, and only on GET. `/me` reports who the token is, which is how
// the CLI confirms a machine is authenticated at all, and tells it nothing it
// does not already hold.
//
// Everything else is refused, organization routes included — billing, members,
// the model configs and the other projects are not what a deploy credential is
// for. The list is deliberately this short: a route added later is closed by
// omission rather than open by it.
const ACCESS_TOKEN_UNSCOPED_PATHS = ['/me'];

const ACCESS_TOKEN_SCOPE_MESSAGE =
  'This token is scoped to a different project';

// Recent custom-tool invocations, as `ganju logs` reads them.
const CUSTOM_CODE_LOGS_DEFAULT_LIMIT = 20;
const CUSTOM_CODE_LOGS_MAX_LIMIT = 100;

const BOT_GRANT_TYPE = 'urn:ganju:bot-on-behalf-of';
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

const PLAN_FREE = 'FREE' as 'FREE';
const PLAN_PRO = 'PRO' as 'PRO';
const PLAN_ENTERPRISE = 'ENTERPRISE' as 'ENTERPRISE';
const PLANS = [PLAN_FREE, PLAN_PRO, PLAN_ENTERPRISE];

// Mirror Stripe's subscription statuses so the webhook can store them verbatim.
const SUBSCRIPTION_STATUS_ACTIVE = 'active' as 'active';
const SUBSCRIPTION_STATUS_TRIALING = 'trialing' as 'trialing';
const SUBSCRIPTION_STATUS_PAST_DUE = 'past_due' as 'past_due';
const SUBSCRIPTION_STATUS_CANCELED = 'canceled' as 'canceled';
const SUBSCRIPTION_STATUS_INCOMPLETE = 'incomplete' as 'incomplete';
const SUBSCRIPTION_STATUS_INCOMPLETE_EXPIRED =
  'incomplete_expired' as 'incomplete_expired';
const SUBSCRIPTION_STATUS_UNPAID = 'unpaid' as 'unpaid';
const SUBSCRIPTION_STATUS_PAUSED = 'paused' as 'paused';
const SUBSCRIPTION_STATUSES = [
  SUBSCRIPTION_STATUS_ACTIVE,
  SUBSCRIPTION_STATUS_TRIALING,
  SUBSCRIPTION_STATUS_PAST_DUE,
  SUBSCRIPTION_STATUS_CANCELED,
  SUBSCRIPTION_STATUS_INCOMPLETE,
  SUBSCRIPTION_STATUS_INCOMPLETE_EXPIRED,
  SUBSCRIPTION_STATUS_UNPAID,
  SUBSCRIPTION_STATUS_PAUSED
];
// A subscription in one of these states still grants its paid entitlements.
// Anything else falls back to the Free plan's limits.
const SUBSCRIPTION_ENTITLED_STATUSES = [
  SUBSCRIPTION_STATUS_ACTIVE,
  SUBSCRIPTION_STATUS_TRIALING,
  SUBSCRIPTION_STATUS_PAST_DUE
];

const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

// Pricing numbers (kept in sync with apps/website/src/lib/pricing.ts).
//
// $29 rather than $20 is positioning, not margin — $20 is comfortably safe on
// the cost model. Code hosting, a CLI and managed OAuth put this beside Zapier
// Professional (~$30) and Pipedream (~$29); $20 anchors it as a tool, $29 as a
// platform.
const PRICING_PRO_BASE_USD = 29;
// Total assistant turns included per month, of any kind.
const PRICING_INCLUDED_MESSAGES = 3_000;
// How many of those included turns may run on the SHARED platform model. Shared
// turns draw from the total pool like any other, but only up to this sub-cap —
// past it they meter at the shared rate below even if the org is still under its
// 3,000. The sub-cap exists because these are the only turns we pay inference on.
const PRICING_INCLUDED_SHARED_MESSAGES = 1_000;
// Embedded content costs more than it looks. The billed figure is chunk TEXT,
// but each chunk also carries its halfvec plus an HNSW index entry — fixed
// overhead per chunk, regardless of how little text the chunk holds. At the
// current 1536 dimensions that's a ~6.9x expansion, so at Neon's $0.35/GB-month
// a billed GB costs us ~$2.41/GB-month. (It was ~12.9x and ~$4.51 at 3072
// dimensions, which is what motivated both this allowance and EMBEDDING_DIMENSIONS.)
//
// 1 GB rather than 5: at 5 GB the included allowance alone would have cost ~$22
// of a $29 plan on the old basis, and ~$12 on the current one. 1 GB is still
// ~500,000 pages of text — generous for the real use case, and it caps the
// downside of a single heavy account.
const PRICING_INCLUDED_EMBEDDED_GB = 1;
// Two message rates, because the two kinds of turn cost us wildly different
// amounts. A turn on the customer's own key costs us ~nothing — $2/1,000 is a
// platform fee for running the loop and serving RAG. A turn on our model costs
// ~$4/1,000 (up to ~$11 on a tool-rich artifact), so it's sold at $15/1,000: a
// real margin rather than a subsidy. Selling it beats blocking — every Free→Pro
// converter is on our key the day they convert, so forcing BYO breaks the bot
// of every single upgrade.
const PRICING_MESSAGE_PER_1K_USD = 2;
const PRICING_SHARED_MESSAGE_PER_1K_USD = 15;
// Abuse backstop on shared-model turns for paid plans — deliberately absurd as a
// month of legitimate use (~3,300/day, and it would invoice five figures), so it
// only ever catches a runaway loop or a stolen channel token. Raise it for an
// Enterprise contract rather than treating it as a plan feature.
const PRICING_SHARED_KEY_HARD_CAP = 100_000;
// $2, up from $0.50 — which was set believing storage cost us ~$0.50/GB and was
// therefore "at cost". It wasn't: see the expansion note above.
//
// This sat below cost when it was raised (~$4.51/GB at 3072 dimensions). The gap
// was then closed from the COST side rather than by raising the price again:
// halving the embedding to 1536 dimensions brought the real figure to ~$2.41/GB,
// so $2 is now roughly break-even. Raising CHUNK_TARGET_CHARS would tip it
// positive without touching this number.
const PRICING_EMBEDDED_PER_GB_USD = 2;
// Custom-tool invocations included per month, and the rate beyond them.
//
// "Tool call" here means one dispatch into a user's own script on Workers for
// Platforms — NOT a call to a shipped integration or a proxied server. Those
// cost us one screened fetch from a Worker we already pay for, which is why they
// stay bundled; this one runs the customer's code on our infrastructure, and is
// the first cost axis a user can turn against us rather than merely consume.
//
// Cloudflare bills the whole chain (dispatcher → user script → outbound worker)
// as ONE request and counts CPU across all three, so a call costs ~$2.30 per
// million at the per-script CPU ceiling. $5/M is ~2x that, and 1,000,000 is far
// past any real month: the heaviest worked customer in the cost model makes
// 800,000, and a single artifact pinned at its rate limit for a full month
// manages ~2.6 million.
const PRICING_INCLUDED_TOOL_CALLS = 1_000_000;
const PRICING_TOOL_CALL_PER_M_USD = 5;
// Abuse backstop on custom-tool invocations — the compute analogue of
// PRICING_SHARED_KEY_HARD_CAP, and needed for the same reason: past a point,
// usage stops looking like a customer and starts looking like a runaway loop or
// a stolen credential. 20x the included allowance is ~$46 of compute against
// ~$95 billed, and takes eight artifacts held at their rate limit for a month to
// reach. Enterprise is null — the cost model's own enterprise example makes 20
// million calls a month, so a fixed ceiling there would fight a real customer.
const PRICING_TOOL_CALL_HARD_CAP = 20_000_000;
const PRICING_CUSTOM_DOMAIN_USD = 15;

interface PlanLimits {
  // null on any field means "no hard limit" for that plan.
  maxProjects: number | null;
  maxToolsPerArtifact: number | null;
  maxPromptsPerArtifact: number | null;
  maxChannelsPerArtifact: number | null;
  maxRawStorageBytes: number | null;
  maxEmbeddedBytes: number | null;
  // Hard monthly cap on assistant channel messages. Free is capped; paid plans
  // are `null` (metered, not blocked).
  monthlyMessageCap: number | null;
  // Monthly allowance of messages that may run on the SHARED platform model (our
  // key, our inference bill). This is a BILLING threshold, not a block: past it,
  // paid plans keep running and meter at the shared overage rate, which carries a
  // real margin over what the inference costs us. Free has no overage path, so it
  // simply stops — its hard total cap is set to the same number and trips first.
  includedSharedMessages: number;
  // Absolute stop on shared-model turns, regardless of billing. Not a pricing
  // lever — an abuse backstop, set far above any legitimate month so no paying
  // customer meets it. It bounds what a compromised or runaway channel can spend
  // of our inference before someone notices, in the window where the charges are
  // real but the payment hasn't settled. `null` = no backstop.
  sharedKeyHardCap: number | null;
  canInvite: boolean;
  // Whether the org may configure its own LLM (bring-your-own-key). A paid-only
  // feature: Free orgs run on the shared platform model key (capped); connecting
  // a private model — which lets the org run its own inference past the shared
  // allowance — requires upgrading.
  canUseCustomLlm: boolean;
  // Whether the org may write tools as code and deploy them. Paid-only, and for
  // a different reason than the flags above: this one runs the customer's own
  // code on infrastructure we pay for, which is the first cost axis a user can
  // turn against us. Free's escape hatch is `http-endpoint`, which already gives
  // a custom name, description and input schema against their own backend — at
  // no compute cost to us, because we make one screened request.
  canUseCustomCode: boolean;
  // How many `http-endpoint` tools one artifact may hold. Free gets a handful
  // rather than none: it IS the free tier's custom tool, and capping it is what
  // keeps that from becoming an unbounded tool list on the plan that runs on our
  // model key. `null` = no limit.
  maxHttpEndpointsPerArtifact: number | null;
  // Monthly allowance of CUSTOM-TOOL invocations — dispatches into the org's own
  // code. A billing threshold like includedSharedMessages, not a block: past it
  // paid plans keep running and meter at the per-million rate.
  //
  // Only custom code counts. A shipped integration or a proxied server costs one
  // screened fetch, so metering those would bill a customer for something that
  // rounds to zero and make the tool list a thing to ration.
  includedToolCalls: number;
  // Absolute stop on custom-tool invocations, regardless of billing. The
  // compute-side twin of sharedKeyHardCap, and the only limit on this axis that
  // an infinite loop inside someone's tool actually meets — the per-script CPU
  // ceiling bounds one call, the per-artifact rate limiter bounds calls per
  // minute, and this bounds the month. `null` = no backstop.
  toolCallHardCap: number | null;
  // Display-only allowances included in the plan (what overage is measured
  // against). Not used for blocking.
  includedMessages: number;
  includedEmbeddedBytes: number;
}

const PLAN_LIMITS: Record<
  typeof PLAN_FREE | typeof PLAN_PRO | typeof PLAN_ENTERPRISE,
  PlanLimits
> = {
  FREE: {
    maxProjects: 1,
    maxToolsPerArtifact: 7,
    maxPromptsPerArtifact: 3,
    maxChannelsPerArtifact: 1,
    maxRawStorageBytes: 30 * MB,
    maxEmbeddedBytes: 5 * MB,
    // Free runs on the shared platform model key, so we pay inference. The cap
    // is deliberately a trial-sized amount, not a home — anyone who wants more
    // for free can self-host (Apache-2.0). Cost per message is further bounded
    // by the tighter shared-key turn envelope (history + tool loops) below.
    monthlyMessageCap: 100,
    // Free can't bring its own key, so its whole allowance runs on our model:
    // every one of these three numbers is the same 100 turns seen from a
    // different angle. There is no overage path off Free — you upgrade.
    includedSharedMessages: 100,
    sharedKeyHardCap: 100,
    canInvite: false,
    // Free orgs use the shared platform model only; bringing your own model is a
    // paid feature.
    canUseCustomLlm: false,
    canUseCustomCode: false,
    maxHttpEndpointsPerArtifact: 3,
    // Free can't deploy custom code, so the only way to have a running script on
    // this plan is to have DOWNGRADED with one already published — a paid org
    // keeps its versions and their bundles. Those tools go on serving, because
    // killing a customer's live integrations the moment a card fails is a worse
    // failure than serving a bounded number of calls while they fix it. This is
    // that bound: real breathing room, ~$0.02 of compute, and no overage path
    // off Free to turn it into a bill.
    includedToolCalls: 0,
    toolCallHardCap: 10_000,
    includedMessages: 100,
    includedEmbeddedBytes: 5 * MB
  },
  PRO: {
    maxProjects: null,
    maxToolsPerArtifact: null,
    maxPromptsPerArtifact: null,
    maxChannelsPerArtifact: null,
    maxRawStorageBytes: null,
    maxEmbeddedBytes: null,
    monthlyMessageCap: null,
    // Pro has no hard message cap: own-key turns are unlimited and metered, and
    // shared turns keep running past the included allowance at the shared rate.
    // A 1,000-turn shared buffer is ~33/day — a typical small-business bot's
    // entire month — so most Pro customers never see the overage at all.
    includedSharedMessages: PRICING_INCLUDED_SHARED_MESSAGES,
    sharedKeyHardCap: PRICING_SHARED_KEY_HARD_CAP,
    canInvite: true,
    canUseCustomLlm: true,
    canUseCustomCode: true,
    maxHttpEndpointsPerArtifact: null,
    includedToolCalls: PRICING_INCLUDED_TOOL_CALLS,
    toolCallHardCap: PRICING_TOOL_CALL_HARD_CAP,
    includedMessages: PRICING_INCLUDED_MESSAGES,
    includedEmbeddedBytes: PRICING_INCLUDED_EMBEDDED_GB * GB
  },
  ENTERPRISE: {
    maxProjects: null,
    maxToolsPerArtifact: null,
    maxPromptsPerArtifact: null,
    maxChannelsPerArtifact: null,
    maxRawStorageBytes: null,
    maxEmbeddedBytes: null,
    monthlyMessageCap: null,
    includedSharedMessages: PRICING_INCLUDED_SHARED_MESSAGES,
    sharedKeyHardCap: PRICING_SHARED_KEY_HARD_CAP,
    canInvite: true,
    canUseCustomLlm: true,
    canUseCustomCode: true,
    maxHttpEndpointsPerArtifact: null,
    includedToolCalls: PRICING_INCLUDED_TOOL_CALLS,
    // No backstop: an Enterprise contract is negotiated against real volume, and
    // the reference deal in the cost model runs 20 million calls a month — the
    // exact number a Pro-shaped ceiling would refuse. Raise the ceiling by
    // contract; don't make one plan's abuse limit another plan's product limit.
    toolCallHardCap: null,
    includedMessages: PRICING_INCLUDED_MESSAGES,
    includedEmbeddedBytes: PRICING_INCLUDED_EMBEDDED_GB * GB
  }
};

// Quota features — used as the `feature` discriminator on PlanLimitError so the
// dashboard can tailor the upgrade prompt.
const PLAN_FEATURE_ORGANIZATION = 'organization' as 'organization';
const PLAN_FEATURE_PROJECT = 'project' as 'project';
const PLAN_FEATURE_TOOL = 'tool' as 'tool';
const PLAN_FEATURE_PROMPT = 'prompt' as 'prompt';
const PLAN_FEATURE_CHANNEL = 'channel' as 'channel';
const PLAN_FEATURE_INVITE = 'invite' as 'invite';
const PLAN_FEATURE_LLM = 'llm' as 'llm';
const PLAN_FEATURE_CUSTOM_CODE = 'customCode' as 'customCode';
const PLAN_FEATURE_HTTP_ENDPOINT = 'httpEndpoint' as 'httpEndpoint';
const PLAN_FEATURE_RAW_STORAGE = 'rawStorage' as 'rawStorage';
const PLAN_FEATURE_EMBEDDED_STORAGE = 'embeddedStorage' as 'embeddedStorage';
const PLAN_FEATURE_MESSAGE = 'message' as 'message';
const PLAN_FEATURE_TOOL_CALL = 'toolCall' as 'toolCall';

// Stable code returned on a quota block so clients can branch on it (402).
const PLAN_LIMIT_ERROR_CODE = 'PLAN_LIMIT_EXCEEDED';

// Stripe Billing Meter event names. The metering cron reports per-period
// OVERAGE (usage above the plan's included allowance) to these meters; the
// meters' prices on the subscription turn that into charges. Embedded storage
// is reported in whole MB, messages as a raw count.
//
// Messages report to two separate meters because the two kinds of turn bill at
// different rates — a turn on the org's own key is a platform fee, a turn on our
// model is inference we bought. One meter can't price both.
const STRIPE_METER_MESSAGES = 'ganju_channel_messages';
const STRIPE_METER_SHARED_MESSAGES = 'ganju_shared_messages';
const STRIPE_METER_EMBEDDED = 'ganju_embedded_storage';
// Custom-tool invocations, reported as a raw count of the calls above the
// included allowance. Its price is a package of 1,000,000 rather than per-unit:
// $5/1,000,000 renders per-unit as $0.000005, which no invoice line should have
// to say.
const STRIPE_METER_TOOL_CALLS = 'ganju_custom_tool_calls';

// Legal documents a user accepts, and the version they're on. Bump the version
// when the document changes materially — existing users are then re-prompted,
// and the old acceptance stays on record. Keep in sync with the "Last updated"
// date on apps/website/src/md/{terms,privacy}.md.
const CONSENT_DOCUMENT_TERMS = 'terms' as 'terms';
const CONSENT_DOCUMENT_PRIVACY = 'privacy' as 'privacy';
const CONSENT_DOCUMENTS = [CONSENT_DOCUMENT_TERMS, CONSENT_DOCUMENT_PRIVACY];
const CONSENT_CURRENT_VERSION = '2026-08-31';

const CONSENT_SOURCE_SIGNUP = 'signup' as 'signup';
const CONSENT_SOURCE_REACCEPT = 'reaccept' as 'reaccept';
const CONSENT_SOURCES = [CONSENT_SOURCE_SIGNUP, CONSENT_SOURCE_REACCEPT];

/**
 * Retention windows, in days, for the append-only tables that would otherwise
 * grow forever. These are the numbers the privacy policy publishes — change
 * one here and the policy has to change with it.
 *
 * `mcpRequest` is the sharpest of these: it stores the arguments AND results of
 * every tool call, which can include mail bodies, calendar entries, and drive
 * documents pulled from a connected account.
 */
const RETENTION_DAYS = {
  // Tool-call arguments and results.
  mcpRequest: 90,
  // Stack traces, paths, IPs.
  errorLog: 90,
  // Channel conversation history.
  channelMessage: 365,
  // "Who ran what, when" audit rows.
  artifactExecution: 365
} as const;

// Sessions are purged once they've been expired for this long — the row is
// useless after expiry, but a short grace period keeps debugging possible.
const RETENTION_EXPIRED_SESSION_DAYS = 30;

// Error alerting. The sweep emails a digest of new server-side failures so a
// breach or outage is noticed rather than sitting in a table — the DPA commits
// to notifying customers within 72 hours of BECOMING AWARE, which requires a
// way to become aware.
// Cron expressions from apps/api/wrangler.toml. The scheduled handler branches
// on these, so the strings must match the config exactly.
const CRON_HOURLY = '0 * * * *';
const CRON_ERROR_ALERTS = '*/15 * * * *';

const ALERT_STATE_KEY_ERROR_LOG = 'error_log';
// Only alert on genuine server failures. 4xx rows are expected client errors
// (validation, not-found, quota) and would drown the signal.
const ALERT_MIN_STATUS = 500;
// Rows pulled per run. A larger backlog is counted but not itemised.
const ALERT_MAX_ROWS = 500;
// Distinct error signatures listed in the email body.
const ALERT_MAX_GROUPS = 20;
// Message prefix length used to group errors into a signature.
const ALERT_SIGNATURE_LENGTH = 120;
// At or above this many errors in one run, the subject is flagged as a spike.
const ALERT_SPIKE_THRESHOLD = 25;

// Rows deleted per table per purge run. The cron runs hourly, so this drains a
// backlog over a few passes instead of holding one very long transaction.
const RETENTION_PURGE_BATCH = 5_000;

export type { PlanLimits };

export const constants = {
  MB,
  GB,
  PLAN_FREE,
  PLAN_PRO,
  PLAN_ENTERPRISE,
  PLANS,
  SUBSCRIPTION_STATUS_ACTIVE,
  SUBSCRIPTION_STATUS_TRIALING,
  SUBSCRIPTION_STATUS_PAST_DUE,
  SUBSCRIPTION_STATUS_CANCELED,
  SUBSCRIPTION_STATUS_INCOMPLETE,
  SUBSCRIPTION_STATUS_INCOMPLETE_EXPIRED,
  SUBSCRIPTION_STATUS_UNPAID,
  SUBSCRIPTION_STATUS_PAUSED,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_ENTITLED_STATUSES,
  PLAN_LIMITS,
  PRICING_PRO_BASE_USD,
  PRICING_INCLUDED_MESSAGES,
  PRICING_INCLUDED_SHARED_MESSAGES,
  PRICING_SHARED_MESSAGE_PER_1K_USD,
  PRICING_SHARED_KEY_HARD_CAP,
  PRICING_INCLUDED_EMBEDDED_GB,
  PRICING_MESSAGE_PER_1K_USD,
  PRICING_EMBEDDED_PER_GB_USD,
  PRICING_INCLUDED_TOOL_CALLS,
  PRICING_TOOL_CALL_PER_M_USD,
  PRICING_TOOL_CALL_HARD_CAP,
  PRICING_CUSTOM_DOMAIN_USD,
  PLAN_FEATURE_ORGANIZATION,
  PLAN_FEATURE_PROJECT,
  PLAN_FEATURE_TOOL,
  PLAN_FEATURE_PROMPT,
  PLAN_FEATURE_CHANNEL,
  PLAN_FEATURE_INVITE,
  PLAN_FEATURE_LLM,
  PLAN_FEATURE_CUSTOM_CODE,
  PLAN_FEATURE_HTTP_ENDPOINT,
  PLAN_FEATURE_RAW_STORAGE,
  PLAN_FEATURE_EMBEDDED_STORAGE,
  PLAN_FEATURE_MESSAGE,
  PLAN_FEATURE_TOOL_CALL,
  PLAN_LIMIT_ERROR_CODE,
  STRIPE_METER_MESSAGES,
  STRIPE_METER_SHARED_MESSAGES,
  STRIPE_METER_EMBEDDED,
  STRIPE_METER_TOOL_CALLS,
  CONSENT_DOCUMENT_TERMS,
  CONSENT_DOCUMENT_PRIVACY,
  CONSENT_DOCUMENTS,
  CONSENT_CURRENT_VERSION,
  CONSENT_SOURCE_SIGNUP,
  CONSENT_SOURCE_REACCEPT,
  CONSENT_SOURCES,
  RETENTION_DAYS,
  RETENTION_EXPIRED_SESSION_DAYS,
  RETENTION_PURGE_BATCH,
  CRON_HOURLY,
  CRON_ERROR_ALERTS,
  ALERT_STATE_KEY_ERROR_LOG,
  ALERT_MIN_STATUS,
  ALERT_MAX_ROWS,
  ALERT_MAX_GROUPS,
  ALERT_SIGNATURE_LENGTH,
  ALERT_SPIKE_THRESHOLD,
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
  CONTACT_MAX_NAME_LENGTH,
  CONTACT_MAX_EMAIL_LENGTH,
  CONTACT_MIN_MESSAGE_LENGTH,
  CONTACT_MAX_MESSAGE_LENGTH,
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
  SERVICE_NAME_TOOL_BROKER,
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
  SPANISH_COUNTRIES,
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_MAX_AGE,
  LANGUAGE_QUERY_PARAM,
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
  RESOURCE_SOURCE_TYPE_CUSTOM_CODE,
  RESOURCE_SOURCE_TYPES,
  CRAWL_RENDERER_CHEERIO,
  CRAWL_RENDERER_PLAYWRIGHT,
  CRAWL_RENDERERS,
  CRAWL_DEFAULT_MAX_PAGES,
  CRAWL_MAX_PAGES_LIMIT,
  CRAWL_DEFAULT_MAX_DEPTH,
  CRAWL_MAX_DEPTH_LIMIT,
  CRAWL_PAGE_FETCH_TIMEOUT_MS,
  CRAWL_PAGE_QUEUE_BATCH_SIZE,
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
  TRANSIENT_BACKOFF_SECONDS,
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
  USAGE_KIND_PROMPT,
  USAGE_KIND_RESOURCE,
  USAGE_KIND_TOOL,
  USAGE_KINDS,
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
  CHANNEL_HISTORY_LIMIT,
  SHARED_KEY_HISTORY_LIMIT,
  SHARED_KEY_MAX_TOOL_LOOPS,
  CHANNEL_MAX_TOOLS,
  CHANNEL_DEBOUNCE_DEFAULT_MS,
  CHANNEL_DEBOUNCE_MIN_MS,
  CHANNEL_DEBOUNCE_MAX_MS,
  CHANNEL_DEBOUNCE_MAX_WAIT_MS,
  CHANNEL_DEBOUNCE_MAX_MESSAGES,
  CHANNEL_DEBOUNCE_DISABLED,
  CHANNEL_DEBOUNCE_JOIN,
  CHANNEL_DEBOUNCE_RETRY_MS,
  CHANNEL_DEBOUNCE_MAX_ATTEMPTS,
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
  DISCORD_API_BASE,
  DISCORD_GATEWAY_QUERY,
  DISCORD_MESSAGE_LIMIT,
  DISCORD_MAX_UPLOAD_BYTES,
  DISCORD_MAX_SOURCE_BUTTONS,
  DISCORD_INTENTS,
  DISCORD_SIGNATURE_HEADER,
  DISCORD_TIMESTAMP_HEADER,
  DISCORD_INTERACTION_TYPE_PING,
  DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND,
  DISCORD_INTERACTION_RESPONSE_PONG,
  DISCORD_INTERACTION_RESPONSE_DEFERRED,
  DISCORD_CHANNEL_TYPE_DM,
  DISCORD_CHANNEL_TYPE_GROUP_DM,
  DISCORD_GATEWAY_OP_DISPATCH,
  DISCORD_GATEWAY_OP_HEARTBEAT,
  DISCORD_GATEWAY_OP_IDENTIFY,
  DISCORD_GATEWAY_OP_RESUME,
  DISCORD_GATEWAY_OP_RECONNECT,
  DISCORD_GATEWAY_OP_INVALID_SESSION,
  DISCORD_GATEWAY_OP_HELLO,
  DISCORD_GATEWAY_OP_HEARTBEAT_ACK,
  DISCORD_GATEWAY_DEFAULT_HEARTBEAT_MS,
  WHATSAPP_API_BASE,
  WHATSAPP_API_VERSION,
  WHATSAPP_MESSAGE_LIMIT,
  WHATSAPP_SIGNATURE_HEADER,
  WHATSAPP_SIGNATURE_PREFIX,
  WHATSAPP_HUB_MODE_PARAM,
  WHATSAPP_HUB_VERIFY_TOKEN_PARAM,
  WHATSAPP_HUB_CHALLENGE_PARAM,
  WHATSAPP_HUB_MODE_SUBSCRIBE,
  WHATSAPP_MAX_IMAGE_BYTES,
  WHATSAPP_MAX_VIDEO_BYTES,
  WHATSAPP_MAX_AUDIO_BYTES,
  WHATSAPP_MAX_DOCUMENT_BYTES,
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
  PROMPT_TOOL_KEY_LIST_PROMPTS,
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
  CREDENTIAL_PROVIDER_CUSTOM_CODE,
  PER_TOOL_CREDENTIAL_PROVIDERS,
  CREDENTIAL_PROVIDERS,
  CALCOM_API_BASE,
  CALCOM_API_VERSION_EVENT_TYPES,
  CALCOM_API_VERSION_SLOTS,
  CALCOM_API_VERSION_BOOKINGS,
  CALCOM_API_VERSION_ME,
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
  TOOL_DEFINITION_KEY_CUSTOM_CODE,
  CUSTOM_CODE_VERSION_STATUS_DRAFT,
  CUSTOM_CODE_VERSION_STATUS_PUBLISHED,
  CUSTOM_CODE_VERSION_STATUS_ARCHIVED,
  CUSTOM_CODE_SOURCE_KIND_EDITOR,
  CUSTOM_CODE_SOURCE_KIND_BUNDLE,
  CUSTOM_CODE_SOURCE_KINDS,
  CUSTOM_CODE_SDK_MODULE,
  CUSTOM_CODE_SDK_SPECIFIER,
  CUSTOM_CODE_MAIN_MODULE,
  CUSTOM_CODE_MAX_FILES,
  CUSTOM_CODE_MAX_FILE_PATH,
  CUSTOM_CODE_VERSION_STATUSES,
  CUSTOM_CODE_SCRIPT_NAME_PREFIX,
  CUSTOM_CODE_SCRIPT_NAME_MAX,
  CUSTOM_CODE_UPLOAD_SUFFIX_CHARS,
  CUSTOM_CODE_SWEEP_GRACE_MS,
  CUSTOM_CODE_SWEEP_MAX_DELETES,
  CUSTOM_CODE_PREVIEW_SCRIPT_SUFFIX,
  CUSTOM_CODE_PREVIEW_TOKEN_TTL_MS,
  CUSTOM_CODE_TEST_TIMEOUT_MS,
  CUSTOM_CODE_SOURCE_KEY_PREFIX,
  CUSTOM_CODE_MAX_TOOLS,
  CUSTOM_CODE_TOOL_NAME_MAX,
  CUSTOM_CODE_DEFAULT_TIMEOUT_MS,
  CUSTOM_CODE_MAX_TIMEOUT_MS,
  CUSTOM_CODE_MAX_RESPONSE_BYTES,
  CUSTOM_CODE_MAX_BUNDLE_BYTES,
  CUSTOM_CODE_INVOKE_ORIGIN,
  CUSTOM_CODE_INVOKE_PATH,
  CUSTOM_CODE_HEALTH_TOOL,
  RESERVED_TOOL_NAME_PREFIXES,
  RESERVED_TOOL_NAMES,
  RESERVED_TOOL_NAME_MESSAGE,
  CUSTOM_CODE_UNKNOWN_CONNECTION_MESSAGE,
  OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE,
  CUSTOM_CODE_BINDING_TOKEN,
  CUSTOM_CODE_BINDING_BROKER,
  CUSTOM_CODE_BINDING_VERSION,
  CUSTOM_CODE_BROKER_ORIGIN,
  CUSTOM_CODE_BROKER_PATH_CONNECTION,
  CUSTOM_CODE_BROKER_PATH_SECRET,
  CUSTOM_CODE_BROKER_PATH_RESOURCES_SEARCH,
  CUSTOM_CODE_BROKER_PATH_RESOURCES_READ,
  CUSTOM_CODE_BROKER_PATH_RESOURCES_LIST,
  CUSTOM_CODE_BROKER_PATH_RESOURCES_CREATE,
  CUSTOM_CODE_BROKER_PATH_RESOURCES_DELETE,
  CUSTOM_CODE_BROKER_PATH_SEND_FILE,
  CUSTOM_CODE_OUTBOUND_PARAM_ARTIFACT_ID,
  CUSTOM_CODE_OUTBOUND_PARAM_ALLOWED_HOSTS,
  CUSTOM_CODE_PLATFORM_HOSTS,
  CUSTOM_CODE_TOKEN_SECRET_ENV,
  CUSTOM_CODE_TOKEN_VERSION,
  CUSTOM_CODE_ACCOUNT_ID_ENV,
  CUSTOM_CODE_API_TOKEN_ENV,
  CUSTOM_CODE_NAMESPACE_ENV,
  CUSTOM_CODE_BROKER_SERVICE_ENV,
  CUSTOM_CODE_COMPATIBILITY_DATE,
  CUSTOM_CODE_SCRIPT_CPU_MS,
  CUSTOM_CODE_REGISTER_TIMEOUT_MS,
  CUSTOM_CODE_REGISTER_INTERVAL_MS,
  CUSTOM_CODE_MAX_LOGS,
  CUSTOM_CODE_MAX_LOG_LENGTH,
  CUSTOM_CODE_SEND_FILE_TARGET_GMAIL,
  CUSTOM_CODE_SEND_FILE_TARGET_OUTLOOK,
  CUSTOM_CODE_SEND_FILE_TARGET_SLACK,
  CUSTOM_CODE_SEND_FILE_TARGETS,
  CUSTOM_CODE_SEND_FILE_PROVIDERS,
  CUSTOM_CODE_SEND_FILE_PATHS,
  CUSTOM_CODE_SEND_FILE_MAX_URIS,
  CUSTOM_CODE_MAX_RESOURCE_TEXT_BYTES,
  CUSTOM_CODE_MAX_RESOURCE_FILE_BYTES,
  CUSTOM_CODE_RESOURCE_URI_PREFIX,
  CUSTOM_CODE_RESOURCE_NOT_OWNED_MESSAGE,
  CUSTOM_CODE_RESOURCE_NOT_DELETABLE_MESSAGE,
  CUSTOM_CODE_RESOURCE_HAS_CHILDREN_MESSAGE,
  CUSTOM_CODE_RESOURCE_NOT_EMBEDDABLE_MESSAGE,
  CUSTOM_CODE_RESOURCE_ACCESS_OWN,
  CUSTOM_CODE_RESOURCE_ACCESS_ALL,
  CUSTOM_CODE_RESOURCE_ACCESS_VALUES,
  CUSTOM_CODE_RESOURCE_PAYLOAD_MESSAGE,
  CUSTOM_CODE_RESOURCE_TEXT_TOO_LARGE_MESSAGE,
  CUSTOM_CODE_RESOURCE_FILE_TOO_LARGE_MESSAGE,
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
  CONTROL_PLANE_SCOPE,
  CLI_OAUTH_CLIENT_NAME,
  CLI_OAUTH_REDIRECT_PATH,
  CLI_OAUTH_REDIRECT_PORTS,
  CLI_OAUTH_SCOPES,
  CLI_TOKEN_REFRESH_SKEW_SECONDS,
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_BYTES,
  ACCESS_TOKEN_HINT_CHARS,
  ACCESS_TOKEN_NAME_MAX,
  ACCESS_TOKEN_MAX_PER_PROJECT,
  ACCESS_TOKEN_MAX_EXPIRY_DAYS,
  ACCESS_TOKEN_LAST_USED_INTERVAL_MS,
  ACCESS_TOKEN_UNSCOPED_PATHS,
  ACCESS_TOKEN_SCOPE_MESSAGE,
  CUSTOM_CODE_LOGS_DEFAULT_LIMIT,
  CUSTOM_CODE_LOGS_MAX_LIMIT,
  BOT_GRANT_TYPE,
  EXTERNAL_LINK_VERIFICATION_PREFIX,
  EXTERNAL_LINK_TTL_SECONDS,
  BOT_ACCESS_TOKEN_TTL_SECONDS,
  LINK_CODE_LENGTH,
  LINK_CODE_ALPHABET,
  BOT_COMMAND_LINK,
  RESERVED_BOT_COMMANDS
};

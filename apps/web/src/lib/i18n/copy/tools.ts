import type { Catalog } from '../core';

/**
 * The tools view — the three things a user can put on their MCP server, and
 * everything around them: the function editor, the HTTP endpoint form, the
 * remote-MCP dialog, and the catalog of integrations we ship.
 *
 * What is NOT here, deliberately:
 *
 * - **The shipped catalog's own names and descriptions.** Those arrive in the
 *   `/catalog/tools` payload and are translated by [toolCatalog.ts](./toolCatalog.ts),
 *   which overrides the English it is given rather than restating it.
 * - **Anything the API says.** `handleError` localizes on the way out, so a
 *   `data.error` is already in the reader's language by the time it reaches a
 *   snackbar. Re-translating it here would be a second copy that drifts.
 * - **Protocol nouns**: `JSON`, `URL`, `GET`, `Bearer`, `ctx`, `index.js`,
 *   `ganju-sdk.js`. They appear verbatim in code and payloads and stay as they
 *   are, in both languages.
 *
 * English is declared first and its shape types every other language, so a key
 * added here fails the build until it is translated.
 */
const en = {
  // Page chrome.
  title: 'Tools',
  subtitle:
    'Connect integrations and choose which tools this MCP server exposes.',
  bannerConnected:
    'Connected {provider}. Toggle the tools you want to enable below.',
  tabFunctions: 'Functions',
  tabHttp: 'HTTP Endpoints',
  tabCatalog: 'Catalog',

  // The Pro wall on the Functions tab. The code sample below it is code and is
  // not translated — it is what the reader would type.
  lockedBadge: 'Pro',
  lockedTitle: 'Write your own tools',
  lockedText:
    'Define a tool in TypeScript, deploy it to this MCP server, and call it from any client. Your code gets the integrations you have already connected — without ever touching a token.',
  lockedUpgrade: 'Upgrade to Pro',

  // HTTP endpoints tab.
  httpTitle: 'HTTP Endpoints',
  httpSubtitle: 'Expose your own HTTP APIs to the agent as named tools.',
  httpUsage: '{used} of {cap} used.',
  httpNew: 'New endpoint',
  httpEmptyTitle: 'No endpoints yet',
  httpEmptyText:
    'Point the agent at an API you already run. Each endpoint becomes a tool it can call by name.',
  httpUntitled: 'Untitled endpoint',

  /**
   * The two states every row has. "Off" and "never installed" look identical on
   * a switch, and one of them is holding a configuration somebody chose — which
   * is the whole reason this chip exists.
   */
  chipOff: 'Off',
  chipOffKept: 'Off · settings kept',
  chipConnected: 'Connected',
  chipExpired: 'Expired',

  tooltipTurnOn: 'Turn on',
  tooltipTurnOffEndpoint: 'Turn off — keeps this endpoint and its settings',
  tooltipTurnOffTool: 'Turn off — keeps its settings',
  tooltipEdit: 'Edit',
  tooltipConfigure: 'Configure',
  tooltipRemoveEndpoint: 'Remove — deletes this endpoint and its settings',
  tooltipRemoveTool: 'Remove — deletes this tool and its settings',

  /**
   * The tool budget. The count renders in its own `<strong>`, so the string
   * starts after it — which both languages happen to allow, since the number
   * leads the sentence in each.
   */
  budgetOf: 'of {max} tools exposed',
  budgetHint: 'Each one is re-sent to the model on every turn.',
  budgetHintOver:
    'Past this, channels stop sending the extras and clients start to degrade.',

  // Catalog controls.
  searchPlaceholder: 'Search integrations...',
  filterAll: 'All',
  filterOn: 'On',
  filterOff: 'Off',
  filterNeedsConnection: 'Needs connection',
  emptyNoMatchSearch: 'No integrations match your search.',
  emptyNoMatchFilter: 'No integrations match this filter.',
  emptyNoMatchFilterAndSearch: 'No integrations match this filter and search.',

  // Catalog cards.
  groupToolsEnabled: '{enabled}/{total} tools enabled',
  mcpNotConnected: 'Remote MCP server · connect to enable tools',
  mcpToolsEnabled_one: '{count} tool enabled',
  mcpToolsEnabled_other: '{count} tools enabled',
  mcpToolsOff_one: '{count} tool · turned off',
  mcpToolsOff_other: '{count} tools · turned off',

  // Group detail.
  backToCatalog: 'Back to catalog',
  updateApiKey: 'Update API key',
  disconnect: 'Disconnect',
  addApiKeyFor: 'Add {name} API key',
  connectGroup: 'Connect {name}',
  redirecting: 'Redirecting...',
  connectBanner:
    'Connect {name} to enable these tools. You only need to connect once for the whole integration.',
  scopes: 'Scopes',
  scopesTooltip: 'Required scopes: {scopes}',

  // Google Calendar group defaults.
  calendarHint:
    'Enable a calendar tool below to set the default calendar, time zone, and notifications for this integration.',
  defaultCalendar: 'Default calendar',
  calendarLoadError:
    'Could not load calendars. Reconnect Google Calendar and try again.',
  calendarLoading: 'Loading calendars…',
  calendarHelp:
    'Events and free/busy lookups use this calendar unless a tool call overrides it.',
  defaultTimeZone: 'Default time zone',
  timeZoneHelpCalendar:
    'Interprets event times and the working hours used by Find Free Slots.',
  attendeeNotifications: 'Attendee notifications',
  notificationsHelp:
    'Whether Google emails guests when events are created, changed, or cancelled.',
  notifyAll: 'Notify everyone',
  notifyExternal: 'Notify external guests only',
  notifyNone: "Don't send notifications",

  // Cal.com group defaults.
  calcomHint:
    'Enable a Cal.com tool below to set the default event type and time zone for this integration.',
  defaultEventType: 'Default event type',
  eventTypesLoadError:
    'Could not load event types. Check the API key and try again.',
  eventTypesLoading: 'Loading event types…',
  eventTypeHelp:
    'Bookings are created against this event type unless a tool call overrides it.',
  timeZoneHelpCalcom:
    "Used for availability lookups and the attendee's booking time zone.",

  // Weekday picker, for the tools whose config carries working days.
  weekdayMon: 'Mon',
  weekdayTue: 'Tue',
  weekdayWed: 'Wed',
  weekdayThu: 'Thu',
  weekdayFri: 'Fri',
  weekdaySat: 'Sat',
  weekdaySun: 'Sun',

  // Per-tool configuration modal.
  configureTitle: 'Configure {name}',
  configureFallbackName: 'Tool',
  configureGroupManaged:
    'This tool has no per-tool settings. Its defaults (calendar / event type, time zone, notifications) are managed for the whole integration from the group header on the Catalog page.',
  /** Split around a `<code>{}</code>` the reader is meant to type verbatim. */
  configJsonHelpBefore: 'Optional tool configuration as JSON. Leave as',
  configJsonHelpAfter: 'if none is needed.',
  configJsonLabel: 'Config (JSON)',
  configJsonExample: 'e.g. {"label": "inbox", "maxResults": 20}',
  configMustBeObject: 'Config must be a JSON object',
  configInvalidJson: 'Invalid JSON',

  // API-key connect modal.
  connectTitle: 'Connect {name}',
  apiKeyHelp:
    'Paste your {name} API key. It is encrypted at rest and never shown again.',
  apiKeyLabel: 'API key',

  /**
   * Remove now has to say what it does that off doesn't — it takes the
   * configuration with it. Somebody reaching for this to shorten their tool
   * list wants the other button.
   */
  removeToolTitle: 'Remove tool',
  removeToolDescription:
    'Remove "{name}" and everything configured on it? To take it off your MCP server without losing its settings, turn it off instead.',
  removeToolFallbackName: 'this tool',
  remove: 'Remove',

  disconnectTitle: 'Disconnect {name}?',
  disconnectDescription_one:
    'Are you sure? This revokes stored credentials for {name}. {count} enabled tool will stop working immediately and any request from the MCP server to this provider will fail until you reconnect. Your installed tools stay listed so you can resume after reconnecting.',
  disconnectDescription_other:
    'Are you sure? This revokes stored credentials for {name}. {count} enabled tools will stop working immediately and any request from the MCP server to this provider will fail until you reconnect. Your installed tools stay listed so you can resume after reconnecting.',
  disconnectFallbackName: 'this provider',

  scopeAlertTitle: 'Additional permissions required',
  scopeAlertDescription:
    'Enabling "{tool}" needs permissions you haven\'t granted to {group} yet: {missing}. We\'ll send you back to {group} to approve them — your existing connection stays in place and the new scopes are added on top.',
  scopeAlertConfirm: 'Grant permissions',

  // Snackbars on the page itself. Anything the API answers with is already
  // localized by the time it gets here and is shown as-is.
  okApiKeySaved: 'API key saved',
  okToolEnabled: 'Tool enabled',
  okToolDisabled: 'Tool disabled',
  okToolUpdated: 'Tool updated',
  okToolRemoved: 'Tool removed',
  okDefaultCalendar: 'Default calendar updated',
  okDefaultTimeZone: 'Default time zone updated',
  okNotifications: 'Notification setting updated',
  okDefaultEventType: 'Default event type updated',
  errUpdateFunction: 'Failed to update this function',
  errUpdateSettings: 'Failed to update settings',
  errSaveApiKey: 'Failed to save API key',
  errUpdateTool: 'Failed to update tool',
  errRemoveTool: 'Failed to remove tool',

  // Functions panel
  fnTitle: 'Functions',
  fnCount_one: '{count} function',
  fnCount_other: '{count} functions',
  fnUnsaved: 'unsaved changes',
  fnHeadlineNew: 'New script — not deployed yet',
  fnHeadlineVersion: 'v{version} · {status}',

  /**
   * Version statuses. `live` is ours — it means "this is the one the pointer
   * names" — while the other three are the row's stored `status`, translated
   * here rather than shown as the raw enum.
   */
  statusLive: 'live',
  statusDraft: 'draft',
  statusPublished: 'published',
  statusArchived: 'archived',

  versionLabel: 'Version',
  versionNewUnsaved: 'New script · unsaved',
  versionOption: 'v{version} · {status}',
  versionOptionFailed: 'v{version} · {status} · failed',
  rollingBack: 'Rolling back…',
  rollBackTo: 'Roll back to v{version}',
  newFunction: 'New function',
  savingDraft: 'Saving…',
  saveDraft: 'Save draft',
  deploying: 'Deploying…',
  deploy: 'Deploy',
  publishFailed: 'v{version} failed to publish — {error}',

  /** Split around an inline button, so the sentence can be reordered freely. */
  readOnlyBannerBefore:
    'This version was uploaded from the CLI, so its code is a compiled bundle and can’t be edited here.',
  readOnlyBannerAction: 'Start a new script',
  readOnlyBannerAfter: 'to edit in the dashboard.',

  metaVersion: 'Version',
  metaStatus: 'Status',
  metaFunctions: 'Functions',
  metaSource: 'Source',
  metaCreated: 'Created',
  metaPublished: 'Published',
  sourceEditor: 'Dashboard editor',
  sourceCli: 'CLI bundle',

  fnEmptyTitle: 'No functions yet',
  fnEmptyText:
    'Declare a function — its name, description and input — and its handler is written into the editor for you.',

  fnInputs_one: '{count} input',
  fnInputs_other: '{count} inputs',
  fnStructuredOutput: 'structured output',
  fnTooltipExposed:
    'On your MCP server — turn off to stop offering it, without redeploying',
  fnTooltipNotExposed: 'Deployed but not offered — turn on to expose it',
  fnTooltipRun: 'Run this function against a sample input',
  fnTooltipRunNeedsDraft: 'Save a draft before running this',
  fnTooltipEdit: 'Edit name, description and schemas',
  fnTooltipRemove:
    'Stop declaring this function — its handler stays in your code',

  fnInputSchema: 'Input schema',
  fnOutputSchema: 'Output schema',
  fnOutputSchemaNone: 'None — this tool returns text.',

  // Test panel.
  fnSampleInput: 'Sample input',
  fnRunning: 'Running…',
  fnRun: 'Run',
  fnTestHint:
    'Runs this version on a preview script — your live tools keep serving clients. Real connections, real resources, real egress rules.',
  fnTestInputViolations: 'Input doesn’t match the schema',
  fnTestError: 'Error',
  fnTestOutput: 'Output',
  fnTestOutputTimed: 'Output · {ms}ms',
  fnTestOutputViolations: 'Output doesn’t match the schema',

  // Functions-panel snackbars.
  fnErrLoadSource: 'Could not load this version’s code',
  fnErrFileExists: 'That file already exists',
  fnErrMaxFiles: 'A script can hold {max} files.',
  fnErrCreateVersion: 'Could not create the version',
  fnErrDeclareFirst: 'Declare at least one function first',
  fnErrDeclareBeforeDeploy: 'Declare at least one function before deploying',
  fnOkDraftSaved: 'Draft v{version} saved',
  fnErrSaveDraft: 'Could not save the draft',
  fnOkDeployed: 'v{version} deployed',
  fnErrDeploy: 'Deploy failed',
  fnOkRolledBack: 'Rolled back to v{version}',
  fnErrSampleInputJson: 'The sample input is not valid JSON.',
  fnErrTestFailed: 'The test could not be run.',
  fnErrLastOn:
    'At least one function has to stay on. Roll back to a version without it instead.',

  // New/edit function dialog.
  fnModalNew: 'New function',
  fnModalEdit: 'Edit function',
  fnFieldName: 'Name',
  fnFieldNamePlaceholder: 'lookup-order',
  fnFieldNameHelp:
    'What the model calls. Becomes the MCP tool name and the key in your handler — renaming it here renames that key too.',
  fnFieldTitle: 'Title',
  fnFieldTitlePlaceholder: 'Look up order',
  fnFieldDescription: 'Description',
  fnFieldDescriptionPlaceholder:
    'Find an order by its id. Use when the customer gives an order number.',
  fnFieldDescriptionHelp:
    'This is how the model decides whether to call it. Say when to use it, not just what it does.',
  fnInputSchemaHelp:
    'What the model may pass. Every property it declares is offered to the model as an argument.',
  fnOutputSchemaLabel: 'Output schema — optional',
  fnOutputSchemaHelp:
    'Declare one and your tool must return a matching object — the MCP client gets structured output instead of text.',
  fnErrNameCharset:
    'Name may only contain letters, digits, underscore or hyphen',
  fnErrNameTaken: 'This script already declares a function by that name',
  fnErrSchemaNotObject: 'Schema must be a JSON object',
  fnErrSchemaInvalid: 'Schema is not valid JSON',
  fnSaveChanges: 'Save changes',
  fnAddFunction: 'Add function',

  // Editor chrome
  ideReadOnly: 'read-only',
  ideUnsaved: 'unsaved',
  ideLines_one: '{count} line',
  ideLines_other: '{count} lines',
  /** Split around `<code>npm install</code>` and `<code>ctx</code>`. */
  ideNoticeBefore: 'No terminal here, and no',
  ideNoticeMiddle:
    '— this file is deployed exactly as written. To use a package, bundle it into a single file on your machine and upload that bundle. Everything in',
  ideNoticeAfter: 'works without installing anything.',
  ideCaret: 'Ln {line}, Col {column}',
  ideSpaces: 'Spaces: 2',
  ideSaveHint: '⌘S saves a draft',

  // File explorer.
  explorerTitle: 'Explorer',
  explorerSection: 'Script',
  explorerNewFile: 'New File…',
  explorerNewFileAria: 'New File',
  explorerNewFolder: 'New Folder…',
  explorerNewFolderAria: 'New Folder',
  explorerCollapse: 'Collapse Folders in Explorer',
  explorerCollapseAria: 'Collapse folders',
  explorerRename: 'Rename…',
  explorerDelete: 'Delete',
  explorerCopyPath: 'Copy Path',
  explorerEntryBadge: 'entry',
  explorerEntryTitle: 'The module the dispatcher calls',
  explorerAttachedBadge: 'attached',
  explorerAttachedTitle: 'Attached to every deploy',
  explorerDeleteFolderTitle: 'Delete folder',
  explorerDeleteFolder_one:
    'Delete "{folder}" and the {count} file in it? They are removed from this script, and there is no undo — a version you have already deployed still has them.',
  explorerDeleteFolder_other:
    'Delete "{folder}" and the {count} files in it? They are removed from this script, and there is no undo — a version you have already deployed still has them.',

  /**
   * Why a name being typed is refused.
   *
   * The rule itself is the server's — `projectPathIssue` is what the upload path
   * runs — and only the wording is here, keyed on the code that rule reports. So
   * the explorer refuses exactly what a deploy would, at the keystroke, and in
   * the reader's language.
   */
  pathNoSlash: 'Use New Folder to nest — a name cannot contain "/"',
  pathBadFolderName:
    'Invalid folder name "{name}" — letters, digits, dot, dash and underscore only',
  pathRequired: 'A name is required',
  pathTooLong: 'The path "{path}" exceeds {max} characters',
  pathCharset:
    'Invalid file path "{path}" — letters, digits, dot, dash, underscore and / only, with no leading or trailing slash',
  pathDots: 'Invalid file path "{path}" — . and .. are not allowed',
  pathExtension:
    'Invalid file path "{path}" — every file must end in .js, since it is deployed as a module exactly as written',
  pathReserved:
    'Invalid file path "{path}" — that name belongs to the SDK, which is attached to every deploy',
  pathTaken: 'Invalid file path "{path}" — it is already in use',

  // JSON fields.
  jsonFormat: 'Format',
  jsonSchemaType: 'What kind of value this is.',
  jsonSchemaProperties: 'For an object: the fields it holds, keyed by name.',
  jsonSchemaRequired: 'Names from `properties` the caller must provide.',
  jsonSchemaItems: 'For an array: the shape of one entry.',

  /**
   * What the editor refuses, and why.
   *
   * A courtesy rather than a control — the real enforcement is the outbound
   * worker, the CPU ceiling and the broker token — but a refusal at the
   * keystroke beats one at deploy time and much beats one at call time.
   */
  markerRequire:
    'require() is not available — the deployed script is an ES module and nothing resolves modules at runtime. To use a package, bundle it locally and upload with the CLI.',
  markerProcess:
    'process is not available. Cloudflare Workers run without Node built-ins; read configuration through ctx.secret() instead.',
  markerNodeGlobals:
    'Node built-ins are not available. Use TextEncoder / TextDecoder for bytes, and ctx.resources for storage.',
  markerEval:
    'Evaluating code at runtime is blocked by the Workers runtime and will throw.',
  markerBrowser:
    'There is no browser here — this code runs on the server, in a Worker isolate.',
  markerBareImport:
    'Only files in this project and ./ganju-sdk.js can be imported here — there is no install step. To use a package, bundle it locally and upload with the CLI.',

  // Function settings.
  //
  // The capabilities half writes `artifact_tool.config`, so it needs the row a
  // first draft creates. Secrets are artifact-scoped credential rows and need
  // nothing, which is why they stay usable before there is any code at all.
  settings: 'Settings',
  settingsTitle: 'Function settings',
  settingsSubtitle:
    'What your code may reach, and what it is allowed to spend doing it.',
  settingsNeedsDraft:
    'Save a draft first — these settings live on the tool your first draft creates. Secrets below can be added now.',

  settingsConnections: 'Connections',
  settingsConnectionsHelp:
    'Providers this script may ask for a token for, and send files as. The broker refuses anything not listed here, so widening it is a deliberate edit rather than something code can do for itself.',
  settingsConnectionConnected: 'Connected',
  settingsConnectionNeedsReauth: 'Needs re-authorization',
  settingsConnectionNotConnected: 'Not connected',
  settingsConnectionUnavailable: 'Unavailable on this deployment',
  settingsConnectionsNote:
    'Declaring a provider you have not connected is allowed — the call fails at run time with a message saying so, rather than the tool failing to deploy.',

  settingsSecrets: 'Secrets',
  settingsSecretsHelp:
    'Read from your code with ctx.secret(). Encrypted at rest, resolved through the broker on each call, and never sent back to the browser — so changing one takes effect on the next call, with no redeploy.',
  settingsSecretsEmpty: 'No secrets yet.',
  settingsSecretName: 'Name',
  settingsSecretNamePlaceholder: 'STRIPE_KEY',
  settingsSecretValue: 'Value',
  settingsAddSecret: 'Add secret',
  settingsAdding: 'Adding...',
  settingsOkSecretAdded: 'Secret added',
  settingsOkSecretRemoved: 'Secret removed',
  settingsErrSecretName:
    'A name may only contain letters, digits, underscore or hyphen',
  settingsErrSecretValue: 'Enter the secret value.',
  /**
   * Refused rather than shadowed. The broker resolves a label to the newest row
   * carrying it, so a second secret under the same name would quietly win and
   * the first would become unreachable without ever looking wrong here.
   */
  settingsErrSecretTaken: 'A secret by that name already exists.',
  settingsErrAddSecret: 'Could not add the secret',
  settingsRemoveSecretTitle: 'Remove secret',
  settingsRemoveSecretDescription:
    'Remove "{name}"? Any function reading it starts failing on its next call, and the value cannot be recovered.',
  settingsErrRemoveSecret: 'Could not remove the secret',

  // Names the group rather than the first field in it, which is what the
  // heading used to repeat.
  settingsLimits: 'Egress and limits',
  settingsAllowedHosts: 'Allowed hosts',
  settingsAllowedHostsHelp:
    'Comma-separated. Leave empty to allow any public host. Private and loopback addresses are always blocked, whatever this says.',
  settingsTimeout: 'Timeout (ms)',
  settingsTimeoutHelp:
    'How long one call may take. Default {default}, capped at {max}.',
  settingsResourceAccess: 'Resource access',
  settingsResourceAccessOwn: 'Only what this tool wrote',
  settingsResourceAccessAll: 'Every resource on this artifact',
  settingsResourceAccessHelp:
    'How far ctx.resources.create and .delete reach. The default confines a tool to its own output, so a buggy function has none of your documents to destroy — widen it only for a tool whose job is to prune what it did not write.',
  settingsOkSaved: 'Settings saved',
  settingsErrSave: 'Could not save the settings',

  // HTTP endpoint dialog
  epTitleNew: 'Add HTTP endpoint',
  epTitleEdit: 'Edit endpoint',
  epModeForm: 'Form',
  epModeJson: 'JSON',
  /** Split around `<strong>Form</strong>` and `<code>auth.credentialId</code>`. */
  epJsonHelpBefore:
    'Edit the full endpoint configuration as JSON. Switch back to',
  epJsonHelpMiddle:
    'to use the guided editor. To use a saved secret or a connected account, set',
  epJsonHelpAfter: 'to its id.',
  epConfigLabel: 'Configuration (JSON)',

  epName: 'Tool name',
  epNameHelp:
    'The name the assistant calls, e.g. lookup-order. Letters, digits, _ or -.',
  epDescription: 'Description',
  epDescriptionHelp: 'Tell the model when to call this tool.',
  epSectionRequest: 'Request',
  epMethod: 'Method',
  epUrl: 'URL',
  epUrlHelp: 'Use {{arg}} to drop in the inputs below.',
  epHeaders: 'Headers',
  epQuery: 'Query parameters',
  epAdd: 'Add',
  epFieldName: 'Name',
  epFieldValue: 'Value',
  epBody: 'Body',
  epFormat: 'Format',
  epBodyTemplate: 'Body template',
  epBodyTemplateHelp:
    'Supports {{arg}}. For JSON it must parse once the arguments are filled in, e.g. {"id":"{{orderId}}"}',
  epBodyNone: 'None',
  epBodyJson: 'JSON',
  epBodyForm: 'Form (urlencoded)',
  epBodyText: 'Text',

  epInputs: 'Inputs (model arguments)',
  epAddInput: 'Add input',
  epInputsHint:
    'Arguments the model fills in when it calls this tool. Reference them as {{name}} in the URL, headers, query, or body.',
  epArgRequired: 'Required',
  epArgType: 'Type',
  epArgDescription: 'Description',
  epArgDescriptionHelp: 'The model reads this to decide what to pass.',
  epTypeString: 'String',
  epTypeNumber: 'Number',
  epTypeBoolean: 'Boolean',

  epSectionAuth: 'Authentication',
  epAuthKind: 'Auth type',
  epAuthNone: 'None',
  epAuthBearer: 'Bearer token',
  epAuthBasic: 'Basic (user:pass)',
  epAuthApiKey: 'API key',
  epAuthOauth: 'Connected account',
  epSendIn: 'Send in',
  epSendInHeader: 'Header',
  epSendInQuery: 'Query param',
  epParamName: 'Parameter name',
  epConnection: 'Connection',
  epSecret: 'Secret',
  epNoConnections:
    'No connected accounts yet — connect one from the tool catalog first.',
  epNoSecrets: 'No saved secrets yet — add one below.',
  epOauthHelp:
    'Its access token is refreshed and sent as a Bearer header on every call.',
  epBasicHelp: 'Stored value should be "username:password".',
  epSecretHelp: 'The stored secret is sent with each request.',
  epAddSecret: 'Add new secret',
  epUseExistingSecret: 'Use an existing secret',
  epSecretLabel: 'Label',
  epSecretLabelHelp: 'A name to recognize this secret later.',
  epSecretValueBasic: 'Secret (username:password)',
  epSecretValue: 'Secret value',

  epAdvanced: 'Advanced options',
  epResponseType: 'Response type',
  epResponseAuto: 'Auto-detect',
  epResponseJson: 'JSON',
  epResponseText: 'Text',
  epJsonPath: 'JSON path',
  epJsonPathHelp: 'Extract a sub-tree, e.g. data.items',
  epOutputSchema: 'Output schema — optional',
  epOutputSchemaHelp:
    'Declare one and a JSON response comes back as structured output instead of text. The response must then be a JSON object, or the call is reported as an error.',
  epSuccessStatuses: 'Success statuses',
  epSuccessStatusesHelp: 'Comma-separated, e.g. 200, 201. Defaults to 2xx.',
  epTimeout: 'Timeout (ms)',
  epTimeoutHelp: 'Default 10000, max 30000.',
  epAllowedHosts: 'Allowed hosts',
  epAllowedHostsHelp:
    'Comma-separated allowlist. Private/loopback hosts are always blocked.',

  epSubmitAdd: 'Add endpoint',
  epOkAdded: 'Endpoint added',
  epOkUpdated: 'Endpoint updated',
  epErrSave: 'Failed to save endpoint',
  epErrConfigObject: 'Config must be a JSON object.',
  epErrConfigJsonSwitch: 'Invalid JSON — fix it before switching to the form.',
  epErrInvalidJson: 'Invalid JSON.',
  epErrInvalidConfig: 'Invalid configuration.',
  epErrNameRequired: 'Tool name is required.',
  epErrUrlRequired: 'URL is required.',
  epErrOutputSchemaObject: 'Output schema must be a JSON object.',
  epErrOutputSchemaJson: 'Output schema is not valid JSON.',
  epErrPickConnection: 'Select a connected account.',
  epErrPickSecret: 'Select an existing secret or add a new one.',
  epErrSecretValue: 'Enter the secret value.',
  epErrSaveSecret: 'Failed to save the secret.',

  // Remote MCP server dialog
  mcpTitleConnect: 'Connect {name}',
  mcpTitleEdit: '{name} tools',
  mcpCheckingConnection: 'Checking your {name} connection…',
  mcpDefaultDescription: 'Connect {name} to expose its tools to the assistant.',
  mcpOauthSuffix:
    "You'll be redirected to {name} to authorize, then brought back here to pick tools.",
  mcpTokenSuffix:
    "Paste a token — it's encrypted at rest and never shown again.",
  mcpNoTokenSuffix: 'This server needs no token — continue to list its tools.',
  mcpHeaderName: 'Header name',
  mcpHeaderNameHelp:
    'The HTTP header the server expects the token in (e.g. X-Api-Key).',
  mcpTokenLabel: '{name} token',
  mcpTokenHelp:
    'A personal access token with the scopes you want the assistant to use.',
  mcpToolsCount: 'Tools ({enabled}/{total})',
  mcpAll: 'All',
  mcpNone: 'None',
  mcpPickHint: "Choose which of {name}'s tools the assistant can call.",
  mcpAdvanced: 'Resources & prompts (optional)',
  mcpResourcesCount: 'Resources ({enabled}/{total})',
  mcpPromptsCount: 'Prompts ({enabled}/{total})',
  mcpAdvancedHint:
    'Resources and prompts are off by default — only the ones you enable here are exposed to the assistant.',
  mcpExposed: 'Exposed',
  mcpExposedHint: 'These tools are on your MCP server',
  mcpOffHint: 'Kept, but not on your MCP server',
  mcpConnecting: 'Connecting...',
  mcpConnectAndList: 'Connect & list tools',
  mcpChecking: 'Checking…',
  mcpOkConnected: '{name} connected',
  mcpOkUpdated: '{name} updated',
  mcpOkDisconnected: '{name} disconnected',
  mcpOkEnabled: '{name} enabled',
  mcpOkTurnedOff: '{name} turned off',
  mcpErrUnsupported: "This server can't be connected from here yet.",
  mcpErrTokenRequired: 'Enter a token to connect.',
  mcpErrHeaderRequired: 'Enter the header name the server expects.',
  mcpErrListTools:
    'Could not list tools with this token. Check it and try again.',
  mcpErrConnect: 'Could not connect to the server.',
  mcpErrStartOauth: 'Could not start the {name} connection.',
  mcpErrPickOne: 'Enable at least one tool.',
  mcpErrConnectFirst: 'Connect {name} first.',
  mcpErrSaveToken: 'Failed to save the token.',
  mcpErrSave: 'Failed to save.',
  mcpErrDisconnect: 'Failed to disconnect.',
  mcpErrUpdate: 'Failed to update.'
};

type ToolsCopy = typeof en;

export const TOOLS: Catalog<ToolsCopy> = {
  en,
  es: {
    title: 'Herramientas',
    subtitle:
      'Conecta integraciones y elige qué herramientas expone este servidor MCP.',
    bannerConnected:
      'Conectaste {provider}. Activa abajo las herramientas que quieras usar.',
    tabFunctions: 'Funciones',
    tabHttp: 'Endpoints HTTP',
    tabCatalog: 'Catálogo',

    lockedBadge: 'Pro',
    lockedTitle: 'Escribe tus propias herramientas',
    lockedText:
      'Define una herramienta en TypeScript, despliégala en este servidor MCP y llámala desde cualquier cliente. Tu código recibe las integraciones que ya conectaste — sin tocar nunca un token.',
    lockedUpgrade: 'Cambiar a Pro',

    httpTitle: 'Endpoints HTTP',
    httpSubtitle:
      'Expón tus propias APIs HTTP al agente como herramientas con nombre.',
    httpUsage: '{used} de {cap} en uso.',
    httpNew: 'Nuevo endpoint',
    httpEmptyTitle: 'Aún no hay endpoints',
    httpEmptyText:
      'Apunta el agente a una API que ya tengas en marcha. Cada endpoint se convierte en una herramienta que puede llamar por su nombre.',
    httpUntitled: 'Endpoint sin nombre',

    chipOff: 'Apagada',
    chipOffKept: 'Apagada · conserva su configuración',
    chipConnected: 'Conectado',
    chipExpired: 'Vencido',

    tooltipTurnOn: 'Encender',
    tooltipTurnOffEndpoint:
      'Apagar — conserva este endpoint y su configuración',
    tooltipTurnOffTool: 'Apagar — conserva su configuración',
    tooltipEdit: 'Editar',
    tooltipConfigure: 'Configurar',
    tooltipRemoveEndpoint: 'Eliminar — borra este endpoint y su configuración',
    tooltipRemoveTool: 'Eliminar — borra esta herramienta y su configuración',

    budgetOf: 'de {max} herramientas expuestas',
    budgetHint: 'Cada una se le reenvía al modelo en cada turno.',
    budgetHintOver:
      'A partir de aquí, los canales dejan de enviar las que sobran y los clientes empiezan a fallar.',

    searchPlaceholder: 'Buscar integraciones...',
    filterAll: 'Todas',
    filterOn: 'Encendidas',
    filterOff: 'Apagadas',
    filterNeedsConnection: 'Falta conectar',
    emptyNoMatchSearch: 'Ninguna integración coincide con tu búsqueda.',
    emptyNoMatchFilter: 'Ninguna integración coincide con este filtro.',
    emptyNoMatchFilterAndSearch:
      'Ninguna integración coincide con este filtro ni con la búsqueda.',

    groupToolsEnabled: '{enabled}/{total} herramientas activadas',
    mcpNotConnected:
      'Servidor MCP remoto · conéctalo para activar sus herramientas',
    mcpToolsEnabled_one: '{count} herramienta activada',
    mcpToolsEnabled_other: '{count} herramientas activadas',
    mcpToolsOff_one: '{count} herramienta · apagada',
    mcpToolsOff_other: '{count} herramientas · apagadas',

    backToCatalog: 'Volver al catálogo',
    updateApiKey: 'Actualizar API key',
    disconnect: 'Desconectar',
    addApiKeyFor: 'Agregar API key de {name}',
    connectGroup: 'Conectar {name}',
    redirecting: 'Redirigiendo...',
    connectBanner:
      'Conecta {name} para activar estas herramientas. Solo necesitas conectarlo una vez para toda la integración.',
    scopes: 'Permisos',
    scopesTooltip: 'Permisos necesarios: {scopes}',

    calendarHint:
      'Activa abajo una herramienta de calendario para definir el calendario, la zona horaria y las notificaciones por defecto de esta integración.',
    defaultCalendar: 'Calendario por defecto',
    calendarLoadError:
      'No pudimos cargar los calendarios. Vuelve a conectar Google Calendar e inténtalo de nuevo.',
    calendarLoading: 'Cargando calendarios…',
    calendarHelp:
      'Los eventos y las consultas de disponibilidad usan este calendario, salvo que la llamada indique otro.',
    defaultTimeZone: 'Zona horaria por defecto',
    timeZoneHelpCalendar:
      'Interpreta las horas de los eventos y el horario laboral que usa Buscar espacios libres.',
    attendeeNotifications: 'Notificaciones a invitados',
    notificationsHelp:
      'Si Google envía correo a los invitados cuando se crean, cambian o cancelan eventos.',
    notifyAll: 'Notificar a todos',
    notifyExternal: 'Notificar solo a invitados externos',
    notifyNone: 'No enviar notificaciones',

    calcomHint:
      'Activa abajo una herramienta de Cal.com para definir el tipo de evento y la zona horaria por defecto de esta integración.',
    defaultEventType: 'Tipo de evento por defecto',
    eventTypesLoadError:
      'No pudimos cargar los tipos de evento. Revisa la API key e inténtalo de nuevo.',
    eventTypesLoading: 'Cargando tipos de evento…',
    eventTypeHelp:
      'Las reservas se crean sobre este tipo de evento, salvo que la llamada indique otro.',
    timeZoneHelpCalcom:
      'Se usa para consultar disponibilidad y como zona horaria de reserva del invitado.',

    weekdayMon: 'Lun',
    weekdayTue: 'Mar',
    weekdayWed: 'Mié',
    weekdayThu: 'Jue',
    weekdayFri: 'Vie',
    weekdaySat: 'Sáb',
    weekdaySun: 'Dom',

    configureTitle: 'Configurar {name}',
    configureFallbackName: 'herramienta',
    configureGroupManaged:
      'Esta herramienta no tiene ajustes propios. Sus valores por defecto (calendario / tipo de evento, zona horaria, notificaciones) se gestionan para toda la integración desde el encabezado del grupo, en la pestaña Catálogo.',
    configJsonHelpBefore:
      'Configuración opcional de la herramienta, en JSON. Déjala en',
    configJsonHelpAfter: 'si no hace falta ninguna.',
    configJsonLabel: 'Configuración (JSON)',
    configJsonExample: 'ej. {"label": "inbox", "maxResults": 20}',
    configMustBeObject: 'La configuración debe ser un objeto JSON',
    configInvalidJson: 'JSON no válido',

    connectTitle: 'Conectar {name}',
    apiKeyHelp:
      'Pega tu API key de {name}. Se guarda cifrada y no vuelve a mostrarse.',
    apiKeyLabel: 'API key',

    removeToolTitle: 'Eliminar herramienta',
    removeToolDescription:
      '¿Eliminar "{name}" y todo lo que tiene configurado? Si solo quieres quitarla de tu servidor MCP sin perder sus ajustes, apágala en vez de eliminarla.',
    removeToolFallbackName: 'esta herramienta',
    remove: 'Eliminar',

    disconnectTitle: '¿Desconectar {name}?',
    disconnectDescription_one:
      '¿Seguro? Esto revoca las credenciales guardadas de {name}. {count} herramienta activa dejará de funcionar de inmediato y cualquier petición del servidor MCP a este proveedor fallará hasta que lo vuelvas a conectar. Tus herramientas instaladas siguen en la lista para que puedas retomarlas después.',
    disconnectDescription_other:
      '¿Seguro? Esto revoca las credenciales guardadas de {name}. {count} herramientas activas dejarán de funcionar de inmediato y cualquier petición del servidor MCP a este proveedor fallará hasta que lo vuelvas a conectar. Tus herramientas instaladas siguen en la lista para que puedas retomarlas después.',
    disconnectFallbackName: 'este proveedor',

    scopeAlertTitle: 'Se necesitan permisos adicionales',
    scopeAlertDescription:
      'Activar "{tool}" requiere permisos que aún no le has dado a {group}: {missing}. Te enviaremos de vuelta a {group} para aprobarlos — tu conexión actual se mantiene y los nuevos permisos se suman a ella.',
    scopeAlertConfirm: 'Dar permisos',

    okApiKeySaved: 'API key guardada',
    okToolEnabled: 'Herramienta activada',
    okToolDisabled: 'Herramienta desactivada',
    okToolUpdated: 'Herramienta actualizada',
    okToolRemoved: 'Herramienta eliminada',
    okDefaultCalendar: 'Calendario por defecto actualizado',
    okDefaultTimeZone: 'Zona horaria por defecto actualizada',
    okNotifications: 'Preferencia de notificaciones actualizada',
    okDefaultEventType: 'Tipo de evento por defecto actualizado',
    errUpdateFunction: 'No pudimos actualizar esta función',
    errUpdateSettings: 'No pudimos actualizar la configuración',
    errSaveApiKey: 'No pudimos guardar la API key',
    errUpdateTool: 'No pudimos actualizar la herramienta',
    errRemoveTool: 'No pudimos eliminar la herramienta',

    fnTitle: 'Funciones',
    fnCount_one: '{count} función',
    fnCount_other: '{count} funciones',
    fnUnsaved: 'cambios sin guardar',
    fnHeadlineNew: 'Script nuevo — aún sin desplegar',
    fnHeadlineVersion: 'v{version} · {status}',

    statusLive: 'en vivo',
    statusDraft: 'borrador',
    statusPublished: 'publicada',
    statusArchived: 'archivada',

    versionLabel: 'Versión',
    versionNewUnsaved: 'Script nuevo · sin guardar',
    versionOption: 'v{version} · {status}',
    versionOptionFailed: 'v{version} · {status} · falló',
    rollingBack: 'Revirtiendo…',
    rollBackTo: 'Revertir a v{version}',
    newFunction: 'Nueva función',
    savingDraft: 'Guardando…',
    saveDraft: 'Guardar borrador',
    deploying: 'Desplegando…',
    deploy: 'Desplegar',
    publishFailed: 'La v{version} no se pudo publicar — {error}',

    readOnlyBannerBefore:
      'Esta versión se subió desde la CLI, así que su código es un bundle compilado y no se puede editar aquí.',
    readOnlyBannerAction: 'Empieza un script nuevo',
    readOnlyBannerAfter: 'para editarlo en el panel.',

    metaVersion: 'Versión',
    metaStatus: 'Estado',
    metaFunctions: 'Funciones',
    metaSource: 'Origen',
    metaCreated: 'Creada',
    metaPublished: 'Publicada',
    sourceEditor: 'Editor del panel',
    sourceCli: 'Bundle de la CLI',

    fnEmptyTitle: 'Aún no hay funciones',
    fnEmptyText:
      'Declara una función — su nombre, su descripción y su entrada — y escribimos su handler en el editor por ti.',

    fnInputs_one: '{count} entrada',
    fnInputs_other: '{count} entradas',
    fnStructuredOutput: 'salida estructurada',
    fnTooltipExposed:
      'Está en tu servidor MCP — apágala para dejar de ofrecerla, sin volver a desplegar',
    fnTooltipNotExposed:
      'Desplegada pero no ofrecida — enciéndela para exponerla',
    fnTooltipRun: 'Ejecuta esta función con una entrada de ejemplo',
    fnTooltipRunNeedsDraft: 'Guarda un borrador antes de ejecutarla',
    fnTooltipEdit: 'Editar nombre, descripción y esquemas',
    fnTooltipRemove:
      'Dejar de declarar esta función — su handler se queda en tu código',

    fnInputSchema: 'Esquema de entrada',
    fnOutputSchema: 'Esquema de salida',
    fnOutputSchemaNone: 'Ninguno — esta herramienta devuelve texto.',

    fnSampleInput: 'Entrada de ejemplo',
    fnRunning: 'Ejecutando…',
    fnRun: 'Ejecutar',
    fnTestHint:
      'Ejecuta esta versión en un script de vista previa — tus herramientas en vivo siguen atendiendo a los clientes. Conexiones reales, recursos reales, reglas de salida reales.',
    fnTestInputViolations: 'La entrada no coincide con el esquema',
    fnTestError: 'Error',
    fnTestOutput: 'Salida',
    fnTestOutputTimed: 'Salida · {ms}ms',
    fnTestOutputViolations: 'La salida no coincide con el esquema',

    fnErrLoadSource: 'No pudimos cargar el código de esta versión',
    fnErrFileExists: 'Ese archivo ya existe',
    fnErrMaxFiles: 'Un script puede tener {max} archivos.',
    fnErrCreateVersion: 'No pudimos crear la versión',
    fnErrDeclareFirst: 'Declara al menos una función primero',
    fnErrDeclareBeforeDeploy: 'Declara al menos una función antes de desplegar',
    fnOkDraftSaved: 'Borrador v{version} guardado',
    fnErrSaveDraft: 'No pudimos guardar el borrador',
    fnOkDeployed: 'v{version} desplegada',
    fnErrDeploy: 'El despliegue falló',
    fnOkRolledBack: 'Revertido a la v{version}',
    fnErrSampleInputJson: 'La entrada de ejemplo no es JSON válido.',
    fnErrTestFailed: 'No pudimos ejecutar la prueba.',
    fnErrLastOn:
      'Al menos una función tiene que quedar encendida. Si no la quieres, revierte a una versión que no la traiga.',

    fnModalNew: 'Nueva función',
    fnModalEdit: 'Editar función',
    fnFieldName: 'Nombre',
    fnFieldNamePlaceholder: 'lookup-order',
    fnFieldNameHelp:
      'Lo que llama el modelo. Se convierte en el nombre de la herramienta MCP y en la clave de tu handler — si lo cambias aquí, también cambia esa clave.',
    fnFieldTitle: 'Título',
    fnFieldTitlePlaceholder: 'Buscar pedido',
    fnFieldDescription: 'Descripción',
    fnFieldDescriptionPlaceholder:
      'Busca un pedido por su id. Úsala cuando el cliente dé un número de pedido.',
    fnFieldDescriptionHelp:
      'Así decide el modelo si la llama. Di cuándo usarla, no solo qué hace.',
    fnInputSchemaHelp:
      'Lo que el modelo puede pasar. Cada propiedad que declares se le ofrece al modelo como argumento.',
    fnOutputSchemaLabel: 'Esquema de salida — opcional',
    fnOutputSchemaHelp:
      'Si declaras uno, tu herramienta debe devolver un objeto que coincida — el cliente MCP recibe salida estructurada en vez de texto.',
    fnErrNameCharset:
      'El nombre solo puede tener letras, dígitos, guion bajo o guion',
    fnErrNameTaken: 'Este script ya declara una función con ese nombre',
    fnErrSchemaNotObject: 'El esquema debe ser un objeto JSON',
    fnErrSchemaInvalid: 'El esquema no es JSON válido',
    fnSaveChanges: 'Guardar cambios',
    fnAddFunction: 'Agregar función',

    ideReadOnly: 'solo lectura',
    ideUnsaved: 'sin guardar',
    ideLines_one: '{count} línea',
    ideLines_other: '{count} líneas',
    ideNoticeBefore: 'Aquí no hay terminal, ni',
    ideNoticeMiddle:
      '— este archivo se despliega exactamente como está escrito. Para usar un paquete, empaquétalo en un solo archivo en tu máquina y sube ese bundle. Todo lo que hay en',
    ideNoticeAfter: 'funciona sin instalar nada.',
    ideCaret: 'Ln {line}, Col {column}',
    ideSpaces: 'Espacios: 2',
    ideSaveHint: '⌘S guarda un borrador',

    explorerTitle: 'Explorador',
    explorerSection: 'Script',
    explorerNewFile: 'Nuevo archivo…',
    explorerNewFileAria: 'Nuevo archivo',
    explorerNewFolder: 'Nueva carpeta…',
    explorerNewFolderAria: 'Nueva carpeta',
    explorerCollapse: 'Contraer carpetas del explorador',
    explorerCollapseAria: 'Contraer carpetas',
    explorerRename: 'Cambiar nombre…',
    explorerDelete: 'Eliminar',
    explorerCopyPath: 'Copiar ruta',
    explorerEntryBadge: 'entrada',
    explorerEntryTitle: 'El módulo que llama el dispatcher',
    explorerAttachedBadge: 'adjunto',
    explorerAttachedTitle: 'Se adjunta a cada despliegue',
    explorerDeleteFolderTitle: 'Eliminar carpeta',
    explorerDeleteFolder_one:
      '¿Eliminar "{folder}" y el {count} archivo que contiene? Se quitan de este script y no hay forma de deshacerlo — una versión que ya desplegaste sigue teniéndolos.',
    explorerDeleteFolder_other:
      '¿Eliminar "{folder}" y los {count} archivos que contiene? Se quitan de este script y no hay forma de deshacerlo — una versión que ya desplegaste sigue teniéndolos.',

    pathNoSlash:
      'Usa Nueva carpeta para anidar — un nombre no puede contener "/"',
    pathBadFolderName:
      'Nombre de carpeta no válido "{name}" — solo letras, dígitos, punto, guion y guion bajo',
    pathRequired: 'Hace falta un nombre',
    pathTooLong: 'La ruta "{path}" supera los {max} caracteres',
    pathCharset:
      'Ruta no válida "{path}" — solo letras, dígitos, punto, guion, guion bajo y /, sin barra al principio ni al final',
    pathDots: 'Ruta no válida "{path}" — . y .. no están permitidos',
    pathExtension:
      'Ruta no válida "{path}" — todo archivo debe terminar en .js, porque se despliega como módulo tal cual está escrito',
    pathReserved:
      'Ruta no válida "{path}" — ese nombre le pertenece al SDK, que se adjunta a cada despliegue',
    pathTaken: 'Ruta no válida "{path}" — ya está en uso',

    jsonFormat: 'Formatear',
    jsonSchemaType: 'Qué tipo de valor es.',
    jsonSchemaProperties:
      'Para un objeto: los campos que contiene, con su nombre como clave.',
    jsonSchemaRequired: 'Nombres de `properties` que quien llama debe enviar.',
    jsonSchemaItems: 'Para un arreglo: la forma de cada entrada.',

    markerRequire:
      'require() no está disponible — el script desplegado es un módulo ES y nada resuelve módulos en tiempo de ejecución. Para usar un paquete, empaquétalo en tu máquina y súbelo con la CLI.',
    markerProcess:
      'process no está disponible. Los Workers de Cloudflare corren sin los built-ins de Node; lee la configuración con ctx.secret() en su lugar.',
    markerNodeGlobals:
      'Los built-ins de Node no están disponibles. Usa TextEncoder / TextDecoder para bytes, y ctx.resources para almacenamiento.',
    markerEval:
      'Evaluar código en tiempo de ejecución está bloqueado por el runtime de Workers y lanzará un error.',
    markerBrowser:
      'Aquí no hay navegador — este código corre en el servidor, dentro de un isolate de Worker.',
    markerBareImport:
      'Aquí solo se pueden importar archivos de este proyecto y ./ganju-sdk.js — no hay paso de instalación. Para usar un paquete, empaquétalo en tu máquina y súbelo con la CLI.',

    settings: 'Ajustes',
    settingsTitle: 'Ajustes de las funciones',
    settingsSubtitle:
      'A qué puede llegar tu código, y cuánto se le permite gastar al hacerlo.',
    settingsNeedsDraft:
      'Guarda un borrador primero — estos ajustes viven en la herramienta que crea tu primer borrador. Los secretos de abajo ya se pueden agregar.',

    settingsConnections: 'Conexiones',
    settingsConnectionsHelp:
      'Proveedores a los que este script puede pedirle un token, y como los que puede enviar archivos. El broker rechaza todo lo que no esté en esta lista, así que ampliarla es una decisión explícita y no algo que el código pueda hacer por su cuenta.',
    settingsConnectionConnected: 'Conectado',
    settingsConnectionNeedsReauth: 'Requiere volver a autorizar',
    settingsConnectionNotConnected: 'Sin conectar',
    settingsConnectionUnavailable: 'No disponible en este despliegue',
    settingsConnectionsNote:
      'Puedes declarar un proveedor que aún no hayas conectado — la llamada falla en tiempo de ejecución con un mensaje que lo explica, en vez de impedir el despliegue.',

    settingsSecrets: 'Secretos',
    settingsSecretsHelp:
      'Se leen desde tu código con ctx.secret(). Se guardan cifrados, se resuelven a través del broker en cada llamada y nunca vuelven al navegador — así que cambiar uno surte efecto en la siguiente llamada, sin volver a desplegar.',
    settingsSecretsEmpty: 'Aún no hay secretos.',
    settingsSecretName: 'Nombre',
    settingsSecretNamePlaceholder: 'STRIPE_KEY',
    settingsSecretValue: 'Valor',
    settingsAddSecret: 'Agregar secreto',
    settingsAdding: 'Agregando...',
    settingsOkSecretAdded: 'Secreto agregado',
    settingsOkSecretRemoved: 'Secreto eliminado',
    settingsErrSecretName:
      'El nombre solo puede tener letras, dígitos, guion bajo o guion',
    settingsErrSecretValue: 'Escribe el valor del secreto.',
    settingsErrSecretTaken: 'Ya existe un secreto con ese nombre.',
    settingsErrAddSecret: 'No pudimos agregar el secreto',
    settingsRemoveSecretTitle: 'Eliminar secreto',
    settingsRemoveSecretDescription:
      '¿Eliminar "{name}"? Cualquier función que lo lea empezará a fallar en su siguiente llamada, y el valor no se puede recuperar.',
    settingsErrRemoveSecret: 'No pudimos eliminar el secreto',

    settingsLimits: 'Salida y límites',
    settingsAllowedHosts: 'Hosts permitidos',
    settingsAllowedHostsHelp:
      'Separados por comas. Déjalo vacío para permitir cualquier host público. Las direcciones privadas y de loopback siempre están bloqueadas, diga lo que diga esta lista.',
    settingsTimeout: 'Tiempo límite (ms)',
    settingsTimeoutHelp:
      'Cuánto puede tardar una llamada. Por defecto {default}, con un tope de {max}.',
    settingsResourceAccess: 'Acceso a recursos',
    settingsResourceAccessOwn: 'Solo lo que escribió esta herramienta',
    settingsResourceAccessAll: 'Todos los recursos de este artefacto',
    settingsResourceAccessHelp:
      'Hasta dónde llegan ctx.resources.create y .delete. Por defecto una herramienta queda confinada a lo que ella misma escribió, así que una función con errores no tiene ninguno de tus documentos que destruir — amplíalo solo para una herramienta cuyo trabajo sea limpiar lo que no escribió.',
    settingsOkSaved: 'Ajustes guardados',
    settingsErrSave: 'No pudimos guardar los ajustes',

    epTitleNew: 'Agregar endpoint HTTP',
    epTitleEdit: 'Editar endpoint',
    epModeForm: 'Formulario',
    epModeJson: 'JSON',
    epJsonHelpBefore:
      'Edita toda la configuración del endpoint como JSON. Vuelve a',
    epJsonHelpMiddle:
      'para usar el editor guiado. Para usar un secreto guardado o una cuenta conectada, pon',
    epJsonHelpAfter: 'con su id.',
    epConfigLabel: 'Configuración (JSON)',

    epName: 'Nombre de la herramienta',
    epNameHelp:
      'El nombre que llama el asistente, ej. lookup-order. Letras, dígitos, _ o -.',
    epDescription: 'Descripción',
    epDescriptionHelp: 'Dile al modelo cuándo llamar a esta herramienta.',
    epSectionRequest: 'Petición',
    epMethod: 'Método',
    epUrl: 'URL',
    epUrlHelp: 'Usa {{arg}} para insertar las entradas de abajo.',
    epHeaders: 'Cabeceras',
    epQuery: 'Parámetros de consulta',
    epAdd: 'Agregar',
    epFieldName: 'Nombre',
    epFieldValue: 'Valor',
    epBody: 'Cuerpo',
    epFormat: 'Formato',
    epBodyTemplate: 'Plantilla del cuerpo',
    epBodyTemplateHelp:
      'Admite {{arg}}. Si es JSON, debe poder parsearse una vez rellenados los argumentos, ej. {"id":"{{orderId}}"}',
    epBodyNone: 'Ninguno',
    epBodyJson: 'JSON',
    epBodyForm: 'Formulario (urlencoded)',
    epBodyText: 'Texto',

    epInputs: 'Entradas (argumentos del modelo)',
    epAddInput: 'Agregar entrada',
    epInputsHint:
      'Argumentos que el modelo rellena cuando llama a esta herramienta. Referéncialos como {{name}} en la URL, las cabeceras, la consulta o el cuerpo.',
    epArgRequired: 'Obligatorio',
    epArgType: 'Tipo',
    epArgDescription: 'Descripción',
    epArgDescriptionHelp: 'El modelo lee esto para decidir qué enviar.',
    epTypeString: 'Texto',
    epTypeNumber: 'Número',
    epTypeBoolean: 'Booleano',

    epSectionAuth: 'Autenticación',
    epAuthKind: 'Tipo de autenticación',
    epAuthNone: 'Ninguna',
    epAuthBearer: 'Token Bearer',
    epAuthBasic: 'Basic (usuario:contraseña)',
    epAuthApiKey: 'API key',
    epAuthOauth: 'Cuenta conectada',
    epSendIn: 'Enviar en',
    epSendInHeader: 'Cabecera',
    epSendInQuery: 'Parámetro de consulta',
    epParamName: 'Nombre del parámetro',
    epConnection: 'Conexión',
    epSecret: 'Secreto',
    epNoConnections:
      'Aún no hay cuentas conectadas — conecta una desde el catálogo de herramientas primero.',
    epNoSecrets: 'Aún no hay secretos guardados — agrega uno abajo.',
    epOauthHelp:
      'Su token de acceso se renueva y se envía como cabecera Bearer en cada llamada.',
    epBasicHelp: 'El valor guardado debe ser "usuario:contraseña".',
    epSecretHelp: 'El secreto guardado se envía con cada petición.',
    epAddSecret: 'Agregar secreto nuevo',
    epUseExistingSecret: 'Usar un secreto existente',
    epSecretLabel: 'Etiqueta',
    epSecretLabelHelp: 'Un nombre para reconocer este secreto después.',
    epSecretValueBasic: 'Secreto (usuario:contraseña)',
    epSecretValue: 'Valor del secreto',

    epAdvanced: 'Opciones avanzadas',
    epResponseType: 'Tipo de respuesta',
    epResponseAuto: 'Detectar automáticamente',
    epResponseJson: 'JSON',
    epResponseText: 'Texto',
    epJsonPath: 'Ruta JSON',
    epJsonPathHelp: 'Extrae un subárbol, ej. data.items',
    epOutputSchema: 'Esquema de salida — opcional',
    epOutputSchemaHelp:
      'Si declaras uno, una respuesta JSON vuelve como salida estructurada en vez de texto. La respuesta debe ser entonces un objeto JSON, o la llamada se reporta como error.',
    epSuccessStatuses: 'Estados de éxito',
    epSuccessStatusesHelp:
      'Separados por comas, ej. 200, 201. Por defecto, 2xx.',
    epTimeout: 'Tiempo límite (ms)',
    epTimeoutHelp: 'Por defecto 10000, máximo 30000.',
    epAllowedHosts: 'Hosts permitidos',
    epAllowedHostsHelp:
      'Lista separada por comas. Los hosts privados y de loopback siempre están bloqueados.',

    epSubmitAdd: 'Agregar endpoint',
    epOkAdded: 'Endpoint agregado',
    epOkUpdated: 'Endpoint actualizado',
    epErrSave: 'No pudimos guardar el endpoint',
    epErrConfigObject: 'La configuración debe ser un objeto JSON.',
    epErrConfigJsonSwitch:
      'JSON no válido — corrígelo antes de volver al formulario.',
    epErrInvalidJson: 'JSON no válido.',
    epErrInvalidConfig: 'Configuración no válida.',
    epErrNameRequired: 'El nombre de la herramienta es obligatorio.',
    epErrUrlRequired: 'La URL es obligatoria.',
    epErrOutputSchemaObject: 'El esquema de salida debe ser un objeto JSON.',
    epErrOutputSchemaJson: 'El esquema de salida no es JSON válido.',
    epErrPickConnection: 'Elige una cuenta conectada.',
    epErrPickSecret: 'Elige un secreto existente o agrega uno nuevo.',
    epErrSecretValue: 'Escribe el valor del secreto.',
    epErrSaveSecret: 'No pudimos guardar el secreto.',

    mcpTitleConnect: 'Conectar {name}',
    mcpTitleEdit: 'Herramientas de {name}',
    mcpCheckingConnection: 'Revisando tu conexión con {name}…',
    mcpDefaultDescription:
      'Conecta {name} para exponer sus herramientas al asistente.',
    mcpOauthSuffix:
      'Te llevaremos a {name} para autorizar y luego de vuelta aquí para elegir herramientas.',
    mcpTokenSuffix:
      'Pega un token — se guarda cifrado y no vuelve a mostrarse.',
    mcpNoTokenSuffix:
      'Este servidor no necesita token — continúa para listar sus herramientas.',
    mcpHeaderName: 'Nombre de la cabecera',
    mcpHeaderNameHelp:
      'La cabecera HTTP en la que el servidor espera el token (ej. X-Api-Key).',
    mcpTokenLabel: 'Token de {name}',
    mcpTokenHelp:
      'Un token de acceso personal con los permisos que quieras darle al asistente.',
    mcpToolsCount: 'Herramientas ({enabled}/{total})',
    mcpAll: 'Todas',
    mcpNone: 'Ninguna',
    mcpPickHint:
      'Elige cuáles de las herramientas de {name} puede llamar el asistente.',
    mcpAdvanced: 'Recursos y prompts (opcional)',
    mcpResourcesCount: 'Recursos ({enabled}/{total})',
    mcpPromptsCount: 'Prompts ({enabled}/{total})',
    mcpAdvancedHint:
      'Los recursos y prompts están apagados por defecto — solo se le exponen al asistente los que actives aquí.',
    mcpExposed: 'Expuestas',
    mcpExposedHint: 'Estas herramientas están en tu servidor MCP',
    mcpOffHint: 'Se conservan, pero no están en tu servidor MCP',
    mcpConnecting: 'Conectando...',
    mcpConnectAndList: 'Conectar y listar herramientas',
    mcpChecking: 'Revisando…',
    mcpOkConnected: '{name} conectado',
    mcpOkUpdated: '{name} actualizado',
    mcpOkDisconnected: '{name} desconectado',
    mcpOkEnabled: '{name} activado',
    mcpOkTurnedOff: '{name} apagado',
    mcpErrUnsupported: 'Este servidor todavía no se puede conectar desde aquí.',
    mcpErrTokenRequired: 'Escribe un token para conectar.',
    mcpErrHeaderRequired:
      'Escribe el nombre de la cabecera que espera el servidor.',
    mcpErrListTools:
      'No pudimos listar las herramientas con este token. Revísalo e inténtalo de nuevo.',
    mcpErrConnect: 'No pudimos conectar con el servidor.',
    mcpErrStartOauth: 'No pudimos iniciar la conexión con {name}.',
    mcpErrPickOne: 'Activa al menos una herramienta.',
    mcpErrConnectFirst: 'Conecta {name} primero.',
    mcpErrSaveToken: 'No pudimos guardar el token.',
    mcpErrSave: 'No pudimos guardar.',
    mcpErrDisconnect: 'No pudimos desconectar.',
    mcpErrUpdate: 'No pudimos actualizar.'
  }
};

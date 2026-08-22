// The catalog of tools this platform ships: the groups the dashboard renders as
// cards, and the definitions inside them.
//
// This is code and not database rows, because a catalog entry is meaningless
// without a handler to run it. The MCP boot loop resolves an installed tool
// through `toolRegistry`, and a key with no handler there is skipped silently —
// the tool simply stops appearing on the customer's server, with nothing in the
// UI to say why. Declaring the catalog here makes the registry exhaustive
// against `ToolKey`, so that mismatch is a build failure instead.
//
// It also removes a class of drift that was real: these rows were seeded out of
// band, one environment at a time, so a definition could exist on dev and not on
// production. Now they ship with the code that implements them.
//
// Adding a tool: add the entry here, add its handler to `toolRegistry` under the
// same key. TypeScript fails the build until both exist.

export interface CatalogTool {
  // Doubles as the MCP tool name for native tools, which is why it is also what
  // `isReservedToolName` protects from user-authored tools.
  key: string;
  title: string;
  description: string | null;
  // The single OAuth scope this tool needs beyond the group's baseline, used to
  // prompt for incremental re-authorization. Null when the group's grant covers
  // it.
  requiredScopes: string | null;
}

export interface CatalogGroup {
  key: string;
  title: string;
  description: string | null;
  icon: string | null;
  // The OAuth provider whose credential this group's tools run on, or null for
  // groups that need no connection. Resolved per call at boot.
  provider: string | null;
  tools: readonly CatalogTool[];
}

// Ordered deliberately: the query this replaced had no ORDER BY, so the cards
// rendered in whatever order Postgres returned them and could change between
// deploys. Integrations first, then the platform's own groups, then the three
// definitions whose tools the user authors.
export const TOOL_CATALOG = [
  {
    key: 'gmail',
    title: 'Gmail',
    description: 'Send, read, search, and manage emails',
    icon: 'https://www.gstatic.com/images/branding/product/1x/gmail_2020q4_48dp.png',
    provider: 'google-gmail',
    tools: [
      {
        key: 'gmail-batch-modify-labels',
        title: 'Batch Modify Labels',
        description:
          'Add or remove labels on many emails at once (archive, mark read, etc.).',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.modify'
      },
      {
        key: 'gmail-create-draft',
        title: 'Create Draft',
        description: 'Save a new draft in Gmail without sending it yet.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.compose'
      },
      {
        key: 'gmail-delete-draft',
        title: 'Delete Draft',
        description: 'Permanently delete a draft.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.compose'
      },
      {
        key: 'gmail-forward-email',
        title: 'Forward Email',
        description: 'Forward an email to a new recipient.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.send'
      },
      {
        key: 'gmail-get-draft',
        title: 'Get Draft',
        description: 'Open a saved draft to review its contents.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.compose'
      },
      {
        key: 'gmail-get-profile',
        title: 'Get Profile',
        description:
          'Show the email address and inbox stats for the connected Gmail account.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.readonly'
      },
      {
        key: 'gmail-get-thread',
        title: 'Get Thread',
        description: 'See every message inside one conversation.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.readonly'
      },
      {
        key: 'gmail-list-drafts',
        title: 'List Drafts',
        description: 'Browse your saved drafts.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.compose'
      },
      {
        key: 'gmail-list-emails',
        title: 'List Emails',
        description: 'Browse your Gmail inbox, with optional search filters.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.readonly'
      },
      {
        key: 'gmail-list-labels',
        title: 'List Labels',
        description: 'See all of your Gmail labels and folders.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.labels'
      },
      {
        key: 'gmail-list-threads',
        title: 'List Threads',
        description: 'List your Gmail conversations.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.readonly'
      },
      {
        key: 'gmail-modify-labels',
        title: 'Modify Labels',
        description:
          'Add or remove labels on a single email — archive it, mark it read, star it, and more.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.modify'
      },
      {
        key: 'gmail-read-email',
        title: 'Read Email',
        description: 'Open and read a specific email.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.readonly'
      },
      {
        key: 'gmail-reply-email',
        title: 'Reply Email',
        description:
          'Reply to an email so the response stays in the same conversation.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.send'
      },
      {
        key: 'gmail-send-draft',
        title: 'Send Draft',
        description: "Send a draft you've already saved.",
        requiredScopes: 'https://www.googleapis.com/auth/gmail.send'
      },
      {
        key: 'gmail-send-email',
        title: 'Send Email',
        description:
          'Compose and send a new email from your connected Gmail account.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.send'
      },
      {
        key: 'gmail-trash-email',
        title: 'Move to Trash',
        description:
          'Move an email to Trash. It stays recoverable for 30 days.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.modify'
      },
      {
        key: 'gmail-update-draft',
        title: 'Update Draft',
        description: 'Edit the contents of a saved draft.',
        requiredScopes: 'https://www.googleapis.com/auth/gmail.compose'
      }
    ]
  },
  {
    key: 'outlook',
    title: 'Outlook',
    description: 'Microsoft Outlook mail tools backed by Microsoft Graph.',
    icon: 'https://api.iconify.design/vscode-icons:file-type-outlook.svg',
    provider: 'microsoft-outlook',
    tools: [
      {
        key: 'outlook-batch-move-messages',
        title: 'Batch Move Messages',
        description: 'Move up to 20 messages to the same folder.',
        requiredScopes: 'https://graph.microsoft.com/Mail.ReadWrite'
      },
      {
        key: 'outlook-create-draft',
        title: 'Create Draft',
        description: 'Create a draft email saved in Drafts.',
        requiredScopes: 'https://graph.microsoft.com/Mail.ReadWrite'
      },
      {
        key: 'outlook-delete-draft',
        title: 'Delete Draft',
        description: 'Permanently delete a draft.',
        requiredScopes: 'https://graph.microsoft.com/Mail.ReadWrite'
      },
      {
        key: 'outlook-forward-email',
        title: 'Forward',
        description: 'Forward an existing message to a new recipient.',
        requiredScopes: 'https://graph.microsoft.com/Mail.Send'
      },
      {
        key: 'outlook-get-draft',
        title: 'Get Draft',
        description: 'Read the full contents of a draft.',
        requiredScopes: 'https://graph.microsoft.com/Mail.Read'
      },
      {
        key: 'outlook-get-profile',
        title: 'Get Profile',
        description: "Get the connected account's profile and inbox totals.",
        requiredScopes: 'https://graph.microsoft.com/User.Read'
      },
      {
        key: 'outlook-get-thread',
        title: 'Get Thread',
        description: 'Get summaries of every message in a conversation.',
        requiredScopes: 'https://graph.microsoft.com/Mail.Read'
      },
      {
        key: 'outlook-list-drafts',
        title: 'List Drafts',
        description: 'List drafts in the Drafts folder.',
        requiredScopes: 'https://graph.microsoft.com/Mail.Read'
      },
      {
        key: 'outlook-list-emails',
        title: 'List Emails',
        description: 'List inbox messages, optionally filtered by search.',
        requiredScopes: 'https://graph.microsoft.com/Mail.Read'
      },
      {
        key: 'outlook-list-folders',
        title: 'List Folders',
        description: 'List every mail folder on the account.',
        requiredScopes: 'https://graph.microsoft.com/Mail.Read'
      },
      {
        key: 'outlook-list-threads',
        title: 'List Threads',
        description: 'List inbox conversation threads.',
        requiredScopes: 'https://graph.microsoft.com/Mail.Read'
      },
      {
        key: 'outlook-move-message',
        title: 'Move Message',
        description: 'Move a message to a different folder.',
        requiredScopes: 'https://graph.microsoft.com/Mail.ReadWrite'
      },
      {
        key: 'outlook-read-email',
        title: 'Read Email',
        description: 'Read the full contents of one message by ID.',
        requiredScopes: 'https://graph.microsoft.com/Mail.Read'
      },
      {
        key: 'outlook-reply-email',
        title: 'Reply',
        description:
          'Reply to an existing message, preserving the conversation.',
        requiredScopes: 'https://graph.microsoft.com/Mail.Send'
      },
      {
        key: 'outlook-send-draft',
        title: 'Send Draft',
        description: 'Send an existing draft as-is.',
        requiredScopes: 'https://graph.microsoft.com/Mail.Send'
      },
      {
        key: 'outlook-send-email',
        title: 'Send Email',
        description: 'Send a brand-new email from the connected account.',
        requiredScopes: 'https://graph.microsoft.com/Mail.Send'
      },
      {
        key: 'outlook-trash-email',
        title: 'Move to Trash',
        description: 'Move a message to the Deleted Items folder.',
        requiredScopes: 'https://graph.microsoft.com/Mail.ReadWrite'
      },
      {
        key: 'outlook-update-draft',
        title: 'Update Draft',
        description: 'Replace the contents of an existing draft.',
        requiredScopes: 'https://graph.microsoft.com/Mail.ReadWrite'
      }
    ]
  },
  {
    key: 'slack',
    title: 'Slack',
    description:
      'Post messages, browse channels, and upload files in Slack via Web API.',
    icon: 'https://api.iconify.design/logos:slack-icon.svg',
    provider: 'slack',
    tools: [
      {
        key: 'slack-get-user',
        title: 'Get User',
        description: 'Look up a Slack user by ID or email.',
        requiredScopes: 'users:read,users:read.email'
      },
      {
        key: 'slack-list-channels',
        title: 'List Channels',
        description: 'Browse the channels and DMs the agent can see.',
        requiredScopes: 'channels:read,groups:read,mpim:read,im:read'
      },
      {
        key: 'slack-send-message',
        title: 'Send Message',
        description: 'Post a message to a Slack channel, DM, or thread.',
        requiredScopes: 'chat:write'
      },
      {
        key: 'slack-upload-file',
        title: 'Upload File',
        description: 'Upload a stored resource into a Slack channel.',
        requiredScopes: 'files:write,chat:write'
      }
    ]
  },
  {
    key: 'slack-user',
    title: 'Slack Search',
    description:
      'Workspace-wide message search for Slack. Backed by a user (xoxp) token because Slack does not allow bot tokens to call search.messages.',
    icon: 'https://api.iconify.design/logos:slack-icon.svg',
    provider: 'slack-user',
    tools: [
      {
        key: 'slack-search-messages',
        title: 'Search Messages',
        description:
          'Search messages across the workspace. Requires a Slack user token (xoxp).',
        requiredScopes: 'search:read'
      }
    ]
  },
  {
    key: 'google-calendar',
    title: 'Google Calendar',
    description: 'Create and manage calendar events, and find open time slots',
    icon: 'https://api.iconify.design/logos:google-calendar.svg',
    provider: 'google-calendar',
    tools: [
      {
        key: 'calendar-create-event',
        title: 'Create Event',
        description: 'Add a new event to a calendar.',
        requiredScopes: 'https://www.googleapis.com/auth/calendar.events'
      },
      {
        key: 'calendar-delete-event',
        title: 'Delete Event',
        description: 'Permanently remove an event from a calendar.',
        requiredScopes: 'https://www.googleapis.com/auth/calendar.events'
      },
      {
        key: 'calendar-find-free-slots',
        title: 'Find Free Slots',
        description: 'Find open time gaps on a calendar.',
        requiredScopes: 'https://www.googleapis.com/auth/calendar.readonly'
      },
      {
        key: 'calendar-list-calendars',
        title: 'List Calendars',
        description: 'See all calendars on the connected Google account.',
        requiredScopes: 'https://www.googleapis.com/auth/calendar.readonly'
      },
      {
        key: 'calendar-list-events',
        title: 'List Events',
        description: 'Browse events on a calendar within a time range.',
        requiredScopes: 'https://www.googleapis.com/auth/calendar.readonly'
      },
      {
        key: 'calendar-update-event',
        title: 'Update Event',
        description: 'Change the details of an existing event.',
        requiredScopes: 'https://www.googleapis.com/auth/calendar.events'
      }
    ]
  },
  {
    key: 'calcom',
    title: 'Cal.com',
    description: 'Check availability and book or cancel meetings on Cal.com',
    icon: 'https://api.iconify.design/simple-icons:caldotcom.svg',
    provider: 'calcom',
    tools: [
      {
        key: 'calcom-cancel-booking',
        title: 'Cancel Booking',
        description: 'Cancel an existing booking by its UID.',
        requiredScopes: null
      },
      {
        key: 'calcom-create-booking',
        title: 'Create Booking',
        description: 'Book an available slot for an attendee.',
        requiredScopes: null
      },
      {
        key: 'calcom-list-available-slots',
        title: 'List Available Slots',
        description:
          'Find open booking times for an event type in a date range.',
        requiredScopes: null
      },
      {
        key: 'calcom-list-event-types',
        title: 'List Event Types',
        description:
          'See the bookable meeting types on the connected Cal.com account.',
        requiredScopes: null
      }
    ]
  },
  {
    key: 'web',
    title: 'Web Search',
    description:
      'Search the live web and extract page content, powered by Tavily.',
    icon: 'https://api.iconify.design/mdi:web.svg',
    provider: 'tavily',
    tools: [
      {
        key: 'web-extract',
        title: 'Web Extract',
        description:
          'Fetch the full cleaned text of specific web pages by URL for in-depth reading.',
        requiredScopes: null
      },
      {
        key: 'web-search',
        title: 'Web Search',
        description:
          'Search the live web and return the top results plus a synthesized answer so the model can cite sources.',
        requiredScopes: null
      }
    ]
  },
  {
    key: 'builtin',
    title: 'Built-in',
    description: 'Core tools available to every MCP server',
    icon: null,
    provider: null,
    tools: [
      {
        key: 'list-prompts',
        title: 'List Prompts',
        description:
          'List the prompts and commands this assistant exposes, and how to run them on the current channel.',
        requiredScopes: null
      },
      {
        key: 'list-resources',
        title: 'List Resources',
        description: 'List every resource available to this assistant.',
        requiredScopes: null
      },
      {
        key: 'read-resource',
        title: 'Read Resource',
        description: 'Read the contents of a stored resource.',
        requiredScopes: null
      },
      {
        key: 'search-resources',
        title: 'Search Resources',
        description:
          'Find the resources most relevant to a question using semantic search.',
        requiredScopes: null
      },
      {
        key: 'send-resource',
        title: 'Send Resource',
        description: 'Deliver a resource to the user as a chat attachment.',
        requiredScopes: null
      }
    ]
  },
  {
    key: 'greeting',
    title: 'Greeting',
    description: 'Simple greeting utilities',
    icon: null,
    provider: null,
    tools: [
      {
        key: 'greeting',
        title: 'Greeting',
        description:
          'Reply with a friendly hello in English or Spanish (demo tool).',
        requiredScopes: null
      }
    ]
  },
  {
    key: 'http-endpoint',
    title: 'HTTP Endpoints',
    description:
      'Expose your own HTTP APIs to the agent as named tools. Each endpoint you add becomes a tool the assistant can call.',
    icon: 'https://api.iconify.design/mdi:api.svg',
    provider: null,
    tools: [
      {
        key: 'http-endpoint',
        title: 'HTTP Endpoint',
        description:
          'A user-configured HTTP request exposed to the agent as its own named tool.',
        requiredScopes: null
      }
    ]
  },
  {
    key: 'mcp-proxy',
    title: 'MCP Servers',
    description:
      "Connect a vendor's official remote MCP server and expose its tools to the agent. Each server you add brings its own set of tools.",
    icon: 'https://api.iconify.design/mdi:server-network.svg',
    provider: null,
    tools: [
      {
        key: 'mcp-proxy',
        title: 'MCP Server',
        description:
          'A connected remote MCP server. Each server you add exposes its tools to the agent under a vendor prefix.',
        requiredScopes: null
      }
    ]
  },
  {
    key: 'custom-code',
    title: 'Custom code',
    description:
      'Write your own tools as a Cloudflare Worker and deploy them to this MCP server.',
    icon: null,
    provider: null,
    tools: [
      {
        key: 'custom-code',
        title: 'Custom code',
        description:
          'Tools implemented by your own code. One script per artifact; names and schemas come from the published version.',
        requiredScopes: null
      }
    ]
  }
] as const satisfies readonly CatalogGroup[];

// Every native tool key, as a union. `toolRegistry` in apps/mcp is typed against
// this, which is what turns "a catalog entry with no handler" into a type error.
export type ToolKey = (typeof TOOL_CATALOG)[number]['tools'][number]['key'];
export type ToolGroupKey = (typeof TOOL_CATALOG)[number]['key'];

const TOOL_INDEX = new Map<
  string,
  { tool: CatalogTool; group: CatalogGroup }
>();
for (const group of TOOL_CATALOG) {
  for (const tool of group.tools) {
    TOOL_INDEX.set(tool.key, { tool, group });
  }
}

const GROUP_INDEX = new Map<string, CatalogGroup>(
  TOOL_CATALOG.map(group => [group.key, group])
);

export const TOOL_KEYS = [...TOOL_INDEX.keys()] as ToolKey[];

/**
 * Look up one tool and the group it belongs to.
 *
 * Returns undefined rather than throwing, because the callers that matter are
 * reading a STORED `artifact_tool.tool_key` — a row written before a tool was
 * retired still has to be readable. The MCP boot loop skips what it can't
 * resolve; it must never fail the whole artifact over one row.
 */
export const findCatalogTool = (
  key: string
): { tool: CatalogTool; group: CatalogGroup } | undefined =>
  TOOL_INDEX.get(key);

export const findCatalogGroup = (key: string): CatalogGroup | undefined =>
  GROUP_INDEX.get(key);

/**
 * Is this a tool the platform ships? Used on the WRITE path, where installing an
 * unknown key has to be refused — unlike the read path above, which is lenient
 * on purpose.
 */
export const isToolKey = (key: string): key is ToolKey => TOOL_INDEX.has(key);

/**
 * One installed tool's catalog entry, shaped for an API response.
 *
 * `artifact_tool` rows carry only a key, so every surface that renders a tool —
 * the dashboard's cards, a channel's usage attribution — needs the title,
 * description and group that used to arrive on the join. Attaching it
 * server-side keeps those responses self-describing, so a client never has to
 * hold its own copy of the catalog to render a row.
 *
 * Null for a key the catalog no longer offers. Callers render what they can
 * (the key is still on the row) rather than dropping the tool.
 */
export interface CatalogToolDescriptor {
  key: string;
  title: string;
  description: string | null;
  requiredScopes: string | null;
  group: Omit<CatalogGroup, 'tools'>;
}

export const describeCatalogTool = (
  key: string
): CatalogToolDescriptor | null => {
  const found = TOOL_INDEX.get(key);
  if (!found) return null;
  const { tool, group } = found;
  return {
    key: tool.key,
    title: tool.title,
    description: tool.description,
    requiredScopes: tool.requiredScopes,
    group: {
      key: group.key,
      title: group.title,
      description: group.description,
      icon: group.icon,
      provider: group.provider
    }
  };
};

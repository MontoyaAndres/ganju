import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';

import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import {
  Add,
  Close,
  DeleteOutlined,
  ArrowBack,
  ForumOutlined,
  Telegram,
  WhatsApp,
  BuildOutlined,
  AttachFileOutlined,
  AutoAwesomeOutlined,
  ImageOutlined,
  InsertDriveFileOutlined,
  AudiotrackOutlined,
  VideocamOutlined,
  OpenInNew
} from '@mui/icons-material';

import { Wrapper, UsageModalOverlay } from './styles';
import { i18n } from '../../../lib';

import type { Translate } from '../../../lib';
import type { Source } from '@ganju/utils';

interface BotInfo {
  id: number;
  isBot: boolean;
  firstName: string;
  username?: string;
}

interface SlackBotInfo {
  userId: string;
  botId?: string;
  teamId: string;
  teamName?: string;
  username?: string;
  url?: string;
}

interface DiscordBotInfo {
  id: string;
  username?: string;
  globalName?: string | null;
  discriminator?: string;
  applicationId?: string;
}

interface WhatsappBotInfo {
  id: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
}

interface Channel {
  id: string;
  platform: string;
  status: string;
  config: Record<string, unknown> | null;
  metadata: {
    telegram?: { bot?: BotInfo };
    slack?: { bot?: SlackBotInfo };
    discord?: { bot?: DiscordBotInfo };
    whatsapp?: { bot?: WhatsappBotInfo };
  } | null;
  conversationCount: number;
  messageCount: number;
  artifactId: string;
  llmId: string | null;
  hasCredentials: boolean;
  createdAt: string;
  updatedAt: string;
}

interface OrganizationLlm {
  id: string;
  name: string;
  provider: string;
  model: string;
}

interface Conversation {
  id: string;
  externalConversationId: string;
  title: string | null;
  scope: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

interface UsageResource {
  id: string;
  title: string;
  uri: string;
  mimeType: string;
  fileKey: string | null;
  fileName: string | null;
}

interface UsageTool {
  id: string;
  toolDefinition: { id: string; key: string; title: string } | null;
}

interface UsagePrompt {
  id: string;
  title: string;
}

interface MessageUsage {
  id: string;
  kind: 'prompt' | 'tool' | 'resource';
  toolName: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  input: Record<string, unknown> | null;
  output: unknown;
  artifactTool: UsageTool | null;
  artifactResource: UsageResource | null;
  artifactPrompt: UsagePrompt | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  createdAt: string;
  metadata: { sources?: Source[] } | null;
  participant: {
    displayName: string | null;
    externalUserId: string;
    linkedUser: { id: string; name: string; image: string | null } | null;
  } | null;
  usages: MessageUsage[];
}

type Tab = 'overview' | 'conversations';

const PLATFORMS = [
  {
    id: utils.constants.CHANNEL_PLATFORM_TELEGRAM,
    label: 'Telegram',
    Icon: Telegram,
    enabled: true
  },
  {
    id: utils.constants.CHANNEL_PLATFORM_SLACK,
    label: 'Slack',
    Icon: UI.Icons.Slack,
    enabled: true
  },
  {
    id: utils.constants.CHANNEL_PLATFORM_WHATSAPP,
    label: 'WhatsApp',
    Icon: WhatsApp,
    enabled: true
  },
  {
    id: utils.constants.CHANNEL_PLATFORM_DISCORD,
    label: 'Discord',
    Icon: UI.Icons.Discord,
    enabled: true
  }
];

const platformIcon = (platform: string) => {
  if (platform === utils.constants.CHANNEL_PLATFORM_TELEGRAM)
    return <Telegram />;

  if (platform === utils.constants.CHANNEL_PLATFORM_SLACK)
    return <UI.Icons.Slack width={20} height={20} />;

  if (platform === utils.constants.CHANNEL_PLATFORM_WHATSAPP)
    return <WhatsApp />;

  if (platform === utils.constants.CHANNEL_PLATFORM_DISCORD)
    return <UI.Icons.Discord width={20} height={20} />;

  return <ForumOutlined />;
};

const channelLabel = (channel: Channel): string => {
  if (channel.platform === utils.constants.CHANNEL_PLATFORM_TELEGRAM) {
    const bot = channel.metadata?.telegram?.bot;
    if (bot?.username) return `@${bot.username}`;
    if (bot?.firstName) return bot.firstName;
  }
  if (channel.platform === utils.constants.CHANNEL_PLATFORM_SLACK) {
    const bot = channel.metadata?.slack?.bot;
    if (bot?.username) return `@${bot.username}`;
    if (bot?.teamName) return bot.teamName;
  }
  if (channel.platform === utils.constants.CHANNEL_PLATFORM_DISCORD) {
    const bot = channel.metadata?.discord?.bot;
    if (bot?.username) return `@${bot.username}`;
    if (bot?.globalName) return bot.globalName;
  }
  if (channel.platform === utils.constants.CHANNEL_PLATFORM_WHATSAPP) {
    const bot = channel.metadata?.whatsapp?.bot;
    if (bot?.displayPhoneNumber) return bot.displayPhoneNumber;
    if (bot?.verifiedName) return bot.verifiedName;
  }
  return channel.platform;
};

/**
 * Values the API sends, mapped to a catalog key rather than to a string — the
 * same call `overview`'s `CHART_OPTIONS` makes. Typed as a union, so a typo
 * fails the build; an unrecognised value falls back to what the wire said,
 * which is better than a blank pill.
 */
const SCOPE_KEY = {
  [utils.constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE]: 'scopePrivate',
  [utils.constants.CHANNEL_CONVERSATION_SCOPE_GROUP]: 'scopeGroup',
  [utils.constants.CHANNEL_CONVERSATION_SCOPE_CHANNEL]: 'scopeChannel'
} as const satisfies Record<string, keyof (typeof i18n.copy.CHANNELS)['en']>;

const ROLE_KEY = {
  [utils.constants.ROLE_MESSAGE_USER]: 'roleUser',
  [utils.constants.ROLE_MESSAGE_ASSISTANT]: 'roleAssistant',
  [utils.constants.ROLE_MESSAGE_SYSTEM]: 'roleSystem',
  [utils.constants.ROLE_MESSAGE_TOOL]: 'roleTool'
} as const satisfies Record<string, keyof (typeof i18n.copy.CHANNELS)['en']>;

const KIND_KEY = {
  [utils.constants.USAGE_KIND_PROMPT]: 'kindPrompt',
  [utils.constants.USAGE_KIND_TOOL]: 'kindTool',
  [utils.constants.USAGE_KIND_RESOURCE]: 'kindResource'
} as const satisfies Record<string, keyof (typeof i18n.copy.CHANNELS)['en']>;

const labelFor = (
  map: Record<string, keyof (typeof i18n.copy.CHANNELS)['en']>,
  value: string,
  t: ChannelsT
): string => {
  const key = map[value];
  return key ? t(key) : value;
};

const usageIcon = (kind: MessageUsage['kind']) => {
  if (kind === utils.constants.USAGE_KIND_TOOL) return <BuildOutlined />;
  if (kind === utils.constants.USAGE_KIND_RESOURCE)
    return <AttachFileOutlined />;
  return <AutoAwesomeOutlined />;
};

const usageLabel = (u: MessageUsage, t: ChannelsT): string => {
  if (u.kind === utils.constants.USAGE_KIND_TOOL) {
    const def = u.artifactTool?.toolDefinition;
    // http-endpoint / mcp-proxy back many tools per row, so their definition
    // title is just the generic parent — prefer the recorded specific name.
    const proxied =
      def?.key === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT ||
      def?.key === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY;
    return (
      (proxied ? u.toolName : def?.title) ||
      u.toolName ||
      def?.title ||
      def?.key ||
      (typeof u.input?.name === 'string'
        ? (u.input.name as string)
        : t('fallbackTool'))
    );
  }
  if (u.kind === utils.constants.USAGE_KIND_RESOURCE) {
    return (
      u.artifactResource?.title ||
      u.artifactResource?.uri ||
      u.artifactTool?.toolDefinition?.title ||
      u.toolName ||
      u.artifactTool?.toolDefinition?.key ||
      (typeof u.input?.uri === 'string'
        ? (u.input.uri as string)
        : typeof u.input?.name === 'string'
          ? (u.input.name as string)
          : t('fallbackResource'))
    );
  }
  // Proxied prompts have no artifact_prompt row — fall back to the recorded name.
  return u.artifactPrompt?.title || u.toolName || t('fallbackPrompt');
};

const extractUsageText = (output: unknown): string => {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  const o = output as {
    content?: Array<{ type?: string; text?: string }>;
    messages?: Array<{ content?: unknown }>;
  };
  if (Array.isArray(o.content)) {
    const texts = o.content
      .filter(c => c?.type === 'text' && typeof c.text === 'string')
      .map(c => c.text as string);
    if (texts.length) return texts.join('\n');
  }
  if (Array.isArray(o.messages)) {
    const texts = o.messages
      .map(m => {
        const c = m?.content;
        if (typeof c === 'string') return c;
        if (
          c &&
          typeof c === 'object' &&
          (c as { type?: string }).type === 'text' &&
          typeof (c as { text?: string }).text === 'string'
        ) {
          return (c as { text: string }).text;
        }
        return '';
      })
      .filter(Boolean);
    if (texts.length) return texts.join('\n');
  }
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return '';
  }
};

const resourceAttachmentIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return <ImageOutlined />;
  if (mimeType.startsWith('video/')) return <VideocamOutlined />;
  if (mimeType.startsWith('audio/')) return <AudiotrackOutlined />;
  return <InsertDriveFileOutlined />;
};

const collectResourceAttachments = (
  usages: MessageUsage[]
): UsageResource[] => {
  const seen = new Set<string>();
  const out: UsageResource[] = [];
  for (const u of usages) {
    if (
      u.kind === utils.constants.USAGE_KIND_RESOURCE &&
      u.artifactResource &&
      !seen.has(u.artifactResource.id)
    ) {
      seen.add(u.artifactResource.id);
      out.push(u.artifactResource);
    }
  }
  return out;
};

type ChannelsT = Translate<(typeof i18n.copy.CHANNELS)['en']>;

const SlackRequirements = ({ t }: { t: ChannelsT }) => (
  <div className="slack-requirements">
    <div className="slack-requirements-group">
      <p className="slack-requirements-label">{t('scopesRequired')}</p>
      <div className="slack-scope-chips">
        {utils.constants.SLACK_REQUIRED_SCOPES.map(scope => (
          <code key={scope} className="slack-scope-chip">
            {scope}
          </code>
        ))}
      </div>
    </div>
    <div className="slack-requirements-group">
      <p className="slack-requirements-label">{t('scopesRecommended')}</p>
      <div className="slack-scope-chips">
        {utils.constants.SLACK_RECOMMENDED_SCOPES.map(scope => (
          <code key={scope} className="slack-scope-chip">
            {scope}
          </code>
        ))}
      </div>
      <p className="slack-requirements-hint">{t('scopesRecommendedHint')}</p>
    </div>
    <div className="slack-requirements-group">
      <p className="slack-requirements-label">{t('botEvents')}</p>
      <div className="slack-scope-chips">
        {utils.constants.SLACK_BOT_EVENTS.map(event => (
          <code key={event} className="slack-scope-chip">
            {event}
          </code>
        ))}
      </div>
      <p className="slack-requirements-hint">{t('botEventsHint')}</p>
    </div>
  </div>
);

const DiscordRequirements = ({ t }: { t: ChannelsT }) => (
  <div className="slack-requirements">
    <div className="slack-requirements-group">
      <p className="slack-requirements-label">{t('discordIntents')}</p>
      <div className="slack-scope-chips">
        <code className="slack-scope-chip">MESSAGE CONTENT INTENT</code>
        <code className="slack-scope-chip">SERVER MEMBERS INTENT</code>
      </div>
      <p className="slack-requirements-hint">{t('discordIntentsHint')}</p>
    </div>
    <div className="slack-requirements-group">
      <p className="slack-requirements-label">{t('discordInviteScopes')}</p>
      <div className="slack-scope-chips">
        <code className="slack-scope-chip">bot</code>
        <code className="slack-scope-chip">applications.commands</code>
      </div>
      <p className="slack-requirements-hint">{t('discordInviteHint')}</p>
    </div>
  </div>
);

const WhatsappRequirements = ({ t }: { t: ChannelsT }) => (
  <div className="slack-requirements">
    <div className="slack-requirements-group">
      <p className="slack-requirements-label">{t('whatsappWebhookFields')}</p>
      <div className="slack-scope-chips">
        <code className="slack-scope-chip">messages</code>
      </div>
      <p className="slack-requirements-hint">
        {t('whatsappWebhookHintBefore')}
        <code>messages</code>
        {t('whatsappWebhookHintAfter')}
      </p>
    </div>
    <div className="slack-requirements-group">
      <p className="slack-requirements-label">{t('whatsappCredentials')}</p>
      <p className="slack-requirements-hint">
        {t('whatsappCredentialsBefore')}
        <code>whatsapp_business_messaging</code>
        {t('whatsappCredentialsAfter')}
      </p>
    </div>
  </div>
);

export const Channels = () => {
  const router = useRouter();
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.CHANNELS);
  const c = i18n.useT(i18n.copy.COMMON);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsStatus, setConversationsStatus] = useState<
    'idle' | 'pending' | 'resolved' | 'rejected'
  >('idle');
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesStatus, setMessagesStatus] = useState<
    'idle' | 'pending' | 'resolved' | 'rejected'
  >('idle');

  const [createValues, setCreateValues] = useState({
    platform: utils.constants.CHANNEL_PLATFORM_TELEGRAM as string,
    botToken: '',
    signingSecret: '',
    applicationId: '',
    publicKey: '',
    accessToken: '',
    phoneNumberId: '',
    verifyToken: '',
    appSecret: '',
    llmId: utils.constants.LLM_SYSTEM_DEFAULT as string
  });
  const [llms, setLlms] = useState<OrganizationLlm[]>([]);
  const [editingLlmId, setEditingLlmId] = useState<string | null>(null);
  const [savingLlm, setSavingLlm] = useState(false);
  const [savingDebounce, setSavingDebounce] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [deleteAlert, setDeleteAlert] = useState(false);
  const [viewingUsage, setViewingUsage] = useState<{
    usage: MessageUsage;
    message: Message;
    userMessage: Message | null;
  } | null>(null);

  const [status, setStatus] = useState<
    'idle' | 'pending' | 'resolved' | 'rejected'
  >('idle');

  const [panelWidth, setPanelWidth] = useState(480);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const { id: organizationId, projectId } = router.query as {
    id: string;
    projectId: string;
  };
  const apiBase = `/organization/${organizationId}/project/${projectId}/channel`;

  const fetchChannels = async (signal?: AbortSignal) => {
    if (!organizationId || !projectId) return;
    setStatus('pending');
    try {
      const data = await utils.fetcher({
        url: apiBase,
        config: { credentials: 'include', signal }
      });
      if (signal?.aborted) return;
      if (data && !data.error) setChannels(data);
      setStatus('resolved');
    } catch {
      if (!signal?.aborted) setStatus('rejected');
    }
  };

  useEffect(() => {
    if (!organizationId || !projectId) return;
    const controller = new AbortController();
    fetchChannels(controller.signal);
    return () => controller.abort();
  }, [organizationId, projectId]);

  const fetchConversations = async (channelId: string) => {
    setConversations([]);
    setConversationsStatus('pending');
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/${channelId}/conversation`,
        config: { credentials: 'include' }
      });
      if (data && !data.error) setConversations(data);
      setConversationsStatus('resolved');
    } catch {
      setConversationsStatus('rejected');
    }
  };

  const fetchMessages = async (channelId: string, conversationId: string) => {
    setMessages([]);
    setMessagesStatus('pending');
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/${channelId}/conversation/${conversationId}/message`,
        config: { credentials: 'include' }
      });
      if (data && !data.error) setMessages(data);
      setMessagesStatus('resolved');
    } catch {
      setMessagesStatus('rejected');
    }
  };

  const handleSelect = (channel: Channel) => {
    setSelectedChannel(channel);
    setIsCreating(false);
    setActiveTab('overview');
    setActiveConversation(null);
    setConversations([]);
    setMessages([]);
  };

  const handleClose = () => {
    setSelectedChannel(null);
    setIsCreating(false);
    setActiveConversation(null);
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'conversations' && selectedChannel) {
      setActiveConversation(null);
      fetchConversations(selectedChannel.id);
    }
  };

  const handleOpenConversation = (conversation: Conversation) => {
    if (!selectedChannel) return;
    setActiveConversation(conversation);
    fetchMessages(selectedChannel.id, conversation.id);
  };

  const handleCreate = () => {
    setSelectedChannel(null);
    setIsCreating(true);
    setCreateValues({
      platform: utils.constants.CHANNEL_PLATFORM_TELEGRAM,
      botToken: '',
      signingSecret: '',
      applicationId: '',
      publicKey: '',
      accessToken: '',
      phoneNumberId: '',
      verifyToken: '',
      appSecret: '',
      llmId: utils.constants.LLM_SYSTEM_DEFAULT
    });
    setErrors({});
  };

  const fetchLlms = async (signal?: AbortSignal) => {
    if (!organizationId) return;
    try {
      const data = await utils.fetcher({
        url: `/organization/${organizationId}/llm`,
        config: { credentials: 'include', signal }
      });
      if (signal?.aborted) return;
      if (Array.isArray(data)) setLlms(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    fetchLlms(controller.signal);
    return () => controller.abort();
  }, [organizationId]);

  const handleChannelLlmChange = async (channelId: string, llmId: string) => {
    if (savingLlm) return;
    setSavingLlm(true);
    setEditingLlmId(channelId);
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/${channelId}`,
        config: {
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ llmId: llmId || null })
        }
      });
      if (data && !data.error) {
        const next = llmId || null;
        setSelectedChannel(prev =>
          prev && prev.id === channelId ? { ...prev, llmId: next } : prev
        );
        setChannels(prev =>
          prev.map(c => (c.id === channelId ? { ...c, llmId: next } : c))
        );
        snackbar.success(t('toastModelUpdated'));
      } else {
        snackbar.error(data?.error?.message || t('toastModelUpdateFailed'));
      }
    } catch {
      snackbar.error(t('toastModelUpdateFailed'));
    } finally {
      setSavingLlm(false);
      setEditingLlmId(null);
    }
  };

  // How long the bot waits for a participant to stop typing before answering.
  // People send a thought across several messages; buffering lets one reply
  // cover all of them. Sent as part of `config`, so the existing keys are
  // preserved rather than replaced.
  const handleDebounceChange = async (channelId: string, value: string) => {
    if (savingDebounce) return;
    const debounceMs = Number(value);
    setSavingDebounce(true);
    try {
      const nextConfig = {
        ...(selectedChannel?.config || {}),
        debounceMs
      };
      const data = await utils.fetcher({
        url: `${apiBase}/${channelId}`,
        config: {
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ config: nextConfig })
        }
      });
      if (data && !data.error) {
        setSelectedChannel(prev =>
          prev && prev.id === channelId ? { ...prev, config: nextConfig } : prev
        );
        setChannels(prev =>
          prev.map(c => (c.id === channelId ? { ...c, config: nextConfig } : c))
        );
        snackbar.success(
          debounceMs === utils.constants.CHANNEL_DEBOUNCE_DISABLED
            ? t('toastReplyEveryMessage')
            : t('toastReplyTimingUpdated')
        );
      } else {
        snackbar.error(data?.error?.message || t('toastReplyTimingFailed'));
      }
    } catch {
      snackbar.error(t('toastReplyTimingFailed'));
    } finally {
      setSavingDebounce(false);
    }
  };

  const handleCreateSubmit = async () => {
    if (submitting) return;
    setErrors({});

    const isSlack =
      createValues.platform === utils.constants.CHANNEL_PLATFORM_SLACK;
    const isDiscord =
      createValues.platform === utils.constants.CHANNEL_PLATFORM_DISCORD;
    const isWhatsapp =
      createValues.platform === utils.constants.CHANNEL_PLATFORM_WHATSAPP;

    const nextErrors: Record<string, string> = {};
    // WhatsApp authenticates with an access token (not a bot token); every other
    // platform uses a bot token.
    if (!isWhatsapp && !createValues.botToken.trim()) {
      nextErrors.botToken = t('errorBotToken');
    }
    if (isSlack && !createValues.signingSecret.trim()) {
      nextErrors.signingSecret = t('errorSigningSecret');
    }
    if (isDiscord && !createValues.applicationId.trim()) {
      nextErrors.applicationId = t('errorApplicationId');
    }
    if (isDiscord && !createValues.publicKey.trim()) {
      nextErrors.publicKey = t('errorPublicKey');
    }
    if (isWhatsapp && !createValues.accessToken.trim()) {
      nextErrors.accessToken = t('errorAccessToken');
    }
    if (isWhatsapp && !createValues.phoneNumberId.trim()) {
      nextErrors.phoneNumberId = t('errorPhoneNumberId');
    }
    if (isWhatsapp && !createValues.verifyToken.trim()) {
      nextErrors.verifyToken = t('errorVerifyToken');
    }
    if (isWhatsapp && !createValues.appSecret.trim()) {
      nextErrors.appSecret = t('errorAppSecret');
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const credentials: Record<string, string> = isWhatsapp
      ? {
          accessToken: createValues.accessToken.trim(),
          phoneNumberId: createValues.phoneNumberId.trim(),
          verifyToken: createValues.verifyToken.trim(),
          appSecret: createValues.appSecret.trim()
        }
      : { botToken: createValues.botToken.trim() };
    if (isSlack) {
      credentials.signingSecret = createValues.signingSecret.trim();
    }
    if (isDiscord) {
      credentials.applicationId = createValues.applicationId.trim();
      credentials.publicKey = createValues.publicKey.trim();
    }

    const body: Record<string, unknown> = {
      platform: createValues.platform,
      credentials,
      llmId:
        createValues.llmId === utils.constants.LLM_SYSTEM_DEFAULT
          ? null
          : createValues.llmId
    };

    setSubmitting(true);
    try {
      const data = await utils.fetcher({
        url: apiBase,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify(body)
        }
      });

      if (data && !data.error) {
        setIsCreating(false);
        await fetchChannels();
        setSelectedChannel({ ...data, hasCredentials: true });
        setActiveTab('overview');
        snackbar.success(t('toastChannelConnected'));
      } else {
        snackbar.error(data?.error || t('toastChannelCreateFailed'));
      }
    } catch {
      snackbar.error(t('toastChannelCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusToggle = async () => {
    if (!selectedChannel || statusUpdating) return;
    const next =
      selectedChannel.status === utils.constants.STATUS_ACTIVE
        ? utils.constants.STATUS_DISABLED
        : utils.constants.STATUS_ACTIVE;
    setStatusUpdating(true);
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/${selectedChannel.id}`,
        config: {
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ status: next })
        }
      });
      if (data && !data.error) {
        setSelectedChannel(prev =>
          prev ? { ...prev, ...data, hasCredentials: true } : prev
        );
        setChannels(prev =>
          prev.map(c =>
            c.id === selectedChannel.id ? { ...c, status: next } : c
          )
        );
        snackbar.success(
          next === utils.constants.STATUS_ACTIVE
            ? t('toastChannelEnabled')
            : t('toastChannelDisabled')
        );
      } else {
        snackbar.error(data?.error || t('toastChannelUpdateFailed'));
      }
    } catch {
      snackbar.error(t('toastChannelUpdateFailed'));
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedChannel || submitting) return;
    setSubmitting(true);
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/${selectedChannel.id}`,
        config: { method: 'DELETE', credentials: 'include' }
      });
      if (data && !data.error) {
        setDeleteAlert(false);
        setSelectedChannel(null);
        fetchChannels();
        snackbar.success(t('toastChannelRemoved'));
      } else {
        snackbar.error(data?.error || t('toastChannelRemoveFailed'));
      }
    } catch {
      snackbar.error(t('toastChannelRemoveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenResource = (resourceId: string) => {
    router.push(
      `/organization/${organizationId}/project/${projectId}/resources?selected=${resourceId}`
    );
  };

  const handleOpenTool = (artifactToolId: string) => {
    router.push(
      `/organization/${organizationId}/project/${projectId}/tools?selected=${artifactToolId}`
    );
  };

  const handleOpenPrompt = (promptId: string) => {
    router.push(
      `/organization/${organizationId}/project/${projectId}/prompts?selected=${promptId}`
    );
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const move = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const diff = startX.current - ev.clientX;
      const next = Math.max(
        360,
        Math.min(startWidth.current + diff, window.innerWidth - 300)
      );
      setPanelWidth(next);
    };
    const end = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', end);
  };

  const showRightPanel = !!selectedChannel || isCreating;
  const isActive = selectedChannel?.status === utils.constants.STATUS_ACTIVE;

  return (
    <Wrapper panelWidth={panelWidth}>
      <div className={`channels-list ${showRightPanel ? 'has-selection' : ''}`}>
        <div className="channels-header">
          <div className="channels-header-text">
            <h1 className="channels-title">{t('title')}</h1>
            <p className="channels-subtitle">{t('subtitle')}</p>
          </div>
          <UI.Button variant="contained" size="small" onClick={handleCreate}>
            <Add />
            <span className="button-text">{t('addChannel')}</span>
          </UI.Button>
        </div>

        {status === 'pending' && channels.length === 0 && (
          <div className="channels-items">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="channel-item channel-item-skeleton">
                <UI.Skeleton variant="rounded" width={36} height={36} />
                <div style={{ flex: 1 }}>
                  <UI.Skeleton variant="text" width="40%" height={18} />
                  <UI.Skeleton variant="text" width="60%" height={12} />
                </div>
              </div>
            ))}
          </div>
        )}

        {status !== 'pending' && channels.length === 0 && (
          <div className="channels-empty-state">
            <ForumOutlined />
            <h3>{t('emptyTitle')}</h3>
            <p>{t('emptyText')}</p>
            <UI.Button variant="contained" size="small" onClick={handleCreate}>
              <Add />
              <span className="button-text">{t('addChannel')}</span>
            </UI.Button>
          </div>
        )}

        <div className="channels-items">
          {channels.map(channel => {
            const active = channel.status === utils.constants.STATUS_ACTIVE;
            return (
              <div
                key={channel.id}
                className={`channel-item ${selectedChannel?.id === channel.id ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(channel)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(channel);
                  }
                }}
              >
                <div className="channel-item-icon">
                  {platformIcon(channel.platform)}
                </div>
                <div className="channel-item-body">
                  <p className="channel-item-title">{channelLabel(channel)}</p>
                  <p className="channel-item-meta">
                    <span>
                      {t.plural(
                        'countConversations',
                        channel.conversationCount
                      )}
                    </span>
                    <span>·</span>
                    <span>
                      {t.plural('countMessages', channel.messageCount)}
                    </span>
                  </p>
                </div>
                <span
                  className={`channel-status-pill ${active ? 'is-active' : 'is-disabled'}`}
                >
                  {t(active ? 'statusActive' : 'statusDisabled')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {showRightPanel && (
        <div className="channel-panel">
          <div
            className="panel-resize-handle"
            onMouseDown={handleResizeStart}
          />
          <div className="panel-header">
            {activeConversation ? (
              <IconButton
                className="panel-back-inline"
                onClick={() => setActiveConversation(null)}
              >
                <ArrowBack />
              </IconButton>
            ) : (
              <IconButton className="panel-back-btn" onClick={handleClose}>
                <ArrowBack />
              </IconButton>
            )}
            <h2 className="panel-title">
              {isCreating
                ? t('panelConnect')
                : activeConversation
                  ? activeConversation.title || t('panelConversation')
                  : selectedChannel
                    ? channelLabel(selectedChannel)
                    : ''}
            </h2>
            <div className="panel-actions">
              <IconButton className="panel-close-btn" onClick={handleClose}>
                <Close />
              </IconButton>
            </div>
          </div>

          {selectedChannel && !isCreating && !activeConversation && (
            <div className="panel-tabs">
              <button
                type="button"
                className={`panel-tab ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => handleTabChange('overview')}
              >
                {t('tabOverview')}
              </button>
              <button
                type="button"
                className={`panel-tab ${activeTab === 'conversations' ? 'active' : ''}`}
                onClick={() => handleTabChange('conversations')}
              >
                {t('tabConversations')}
              </button>
            </div>
          )}

          <div className="panel-content">
            {isCreating && (
              <div className="panel-edit-form">
                <div className="panel-section">
                  <p className="panel-section-label">{t('platform')}</p>
                  <div className="panel-platform-grid">
                    {PLATFORMS.map(({ id, label, Icon, enabled }) => (
                      <button
                        key={id}
                        type="button"
                        disabled={!enabled || submitting}
                        className={`panel-platform-option ${createValues.platform === id ? 'active' : ''}`}
                        onClick={() =>
                          setCreateValues(prev => ({ ...prev, platform: id }))
                        }
                      >
                        <Icon />
                        <span className="panel-platform-label">{label}</span>
                        {!enabled && (
                          <span className="panel-platform-soon">
                            {t('platformSoon')}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <UI.Select
                  label={t('languageModel')}
                  name="llmId"
                  value={createValues.llmId}
                  disabled={submitting}
                  helperText={
                    llms.length === 0 ? t('llmHelpEmpty') : t('llmHelp')
                  }
                  options={[
                    {
                      label: t('systemDefault'),
                      value: utils.constants.LLM_SYSTEM_DEFAULT
                    },
                    ...llms.map(llm => ({ label: llm.name, value: llm.id }))
                  ]}
                  onChange={e => {
                    const value = e.target.value as string;
                    setCreateValues(prev => ({ ...prev, llmId: value }));
                  }}
                />

                {createValues.platform ===
                  utils.constants.CHANNEL_PLATFORM_TELEGRAM && (
                  <UI.Input
                    label={t('botToken')}
                    name="botToken"
                    type="password"
                    placeholder="123456:ABC-DEF..."
                    value={createValues.botToken}
                    disabled={submitting}
                    error={!!errors.botToken}
                    helperText={errors.botToken || t('telegramTokenHelp')}
                    onChange={e => {
                      setCreateValues(prev => ({
                        ...prev,
                        botToken: e.target.value
                      }));
                      if (errors.botToken) {
                        setErrors(prev => {
                          const n = { ...prev };
                          delete n.botToken;
                          return n;
                        });
                      }
                    }}
                  />
                )}

                {createValues.platform ===
                  utils.constants.CHANNEL_PLATFORM_SLACK && (
                  <>
                    <UI.Input
                      label={t('botToken')}
                      name="botToken"
                      type="password"
                      placeholder="xoxb-..."
                      value={createValues.botToken}
                      disabled={submitting}
                      error={!!errors.botToken}
                      helperText={errors.botToken || t('slackTokenHelp')}
                      onChange={e => {
                        setCreateValues(prev => ({
                          ...prev,
                          botToken: e.target.value
                        }));
                        if (errors.botToken) {
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n.botToken;
                            return n;
                          });
                        }
                      }}
                    />
                    <UI.Input
                      label={t('signingSecret')}
                      name="signingSecret"
                      type="password"
                      placeholder={t('signingSecretPlaceholder')}
                      value={createValues.signingSecret}
                      disabled={submitting}
                      error={!!errors.signingSecret}
                      helperText={
                        errors.signingSecret || t('signingSecretHelp')
                      }
                      onChange={e => {
                        setCreateValues(prev => ({
                          ...prev,
                          signingSecret: e.target.value
                        }));
                        if (errors.signingSecret) {
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n.signingSecret;
                            return n;
                          });
                        }
                      }}
                    />
                    <SlackRequirements t={t} />
                    <p className="panel-toggle-hint">
                      {t('slackAfterConnect')}
                    </p>
                  </>
                )}

                {createValues.platform ===
                  utils.constants.CHANNEL_PLATFORM_DISCORD && (
                  <>
                    <UI.Input
                      label={t('botToken')}
                      name="botToken"
                      type="password"
                      placeholder={t('discordTokenPlaceholder')}
                      value={createValues.botToken}
                      disabled={submitting}
                      error={!!errors.botToken}
                      helperText={errors.botToken || t('discordTokenHelp')}
                      onChange={e => {
                        setCreateValues(prev => ({
                          ...prev,
                          botToken: e.target.value
                        }));
                        if (errors.botToken) {
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n.botToken;
                            return n;
                          });
                        }
                      }}
                    />
                    <UI.Input
                      label={t('applicationId')}
                      name="applicationId"
                      placeholder={t('applicationIdPlaceholder')}
                      value={createValues.applicationId}
                      disabled={submitting}
                      error={!!errors.applicationId}
                      helperText={
                        errors.applicationId || t('applicationIdHelp')
                      }
                      onChange={e => {
                        setCreateValues(prev => ({
                          ...prev,
                          applicationId: e.target.value
                        }));
                        if (errors.applicationId) {
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n.applicationId;
                            return n;
                          });
                        }
                      }}
                    />
                    <UI.Input
                      label={t('publicKey')}
                      name="publicKey"
                      placeholder={t('publicKeyPlaceholder')}
                      value={createValues.publicKey}
                      disabled={submitting}
                      error={!!errors.publicKey}
                      helperText={errors.publicKey || t('publicKeyHelp')}
                      onChange={e => {
                        setCreateValues(prev => ({
                          ...prev,
                          publicKey: e.target.value
                        }));
                        if (errors.publicKey) {
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n.publicKey;
                            return n;
                          });
                        }
                      }}
                    />
                    <DiscordRequirements t={t} />
                    <p className="panel-toggle-hint">
                      {t('discordAfterConnect')}
                    </p>
                  </>
                )}

                {createValues.platform ===
                  utils.constants.CHANNEL_PLATFORM_WHATSAPP && (
                  <>
                    <UI.Input
                      label={t('accessToken')}
                      name="accessToken"
                      type="password"
                      placeholder={t('accessTokenPlaceholder')}
                      value={createValues.accessToken}
                      disabled={submitting}
                      error={!!errors.accessToken}
                      helperText={errors.accessToken || t('accessTokenHelp')}
                      onChange={e => {
                        setCreateValues(prev => ({
                          ...prev,
                          accessToken: e.target.value
                        }));
                        if (errors.accessToken) {
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n.accessToken;
                            return n;
                          });
                        }
                      }}
                    />
                    <UI.Input
                      label={t('phoneNumberId')}
                      name="phoneNumberId"
                      placeholder={t('phoneNumberIdPlaceholder')}
                      value={createValues.phoneNumberId}
                      disabled={submitting}
                      error={!!errors.phoneNumberId}
                      helperText={
                        errors.phoneNumberId || t('phoneNumberIdHelp')
                      }
                      onChange={e => {
                        setCreateValues(prev => ({
                          ...prev,
                          phoneNumberId: e.target.value
                        }));
                        if (errors.phoneNumberId) {
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n.phoneNumberId;
                            return n;
                          });
                        }
                      }}
                    />
                    <UI.Input
                      label={t('verifyToken')}
                      name="verifyToken"
                      placeholder={t('verifyTokenPlaceholder')}
                      value={createValues.verifyToken}
                      disabled={submitting}
                      error={!!errors.verifyToken}
                      helperText={errors.verifyToken || t('verifyTokenHelp')}
                      onChange={e => {
                        setCreateValues(prev => ({
                          ...prev,
                          verifyToken: e.target.value
                        }));
                        if (errors.verifyToken) {
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n.verifyToken;
                            return n;
                          });
                        }
                      }}
                    />
                    <UI.Input
                      label={t('appSecret')}
                      name="appSecret"
                      type="password"
                      placeholder={t('appSecretPlaceholder')}
                      value={createValues.appSecret}
                      disabled={submitting}
                      error={!!errors.appSecret}
                      helperText={errors.appSecret || t('appSecretHelp')}
                      onChange={e => {
                        setCreateValues(prev => ({
                          ...prev,
                          appSecret: e.target.value
                        }));
                        if (errors.appSecret) {
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n.appSecret;
                            return n;
                          });
                        }
                      }}
                    />
                    <WhatsappRequirements t={t} />
                    <p className="panel-toggle-hint">
                      {t('whatsappAfterConnect')}
                    </p>
                  </>
                )}

                <div className="panel-edit-actions">
                  <UI.Button
                    variant="contained"
                    size="small"
                    disabled={submitting}
                    onClick={handleCreateSubmit}
                  >
                    {submitting ? t('connecting') : t('connect')}
                  </UI.Button>
                  <UI.Button
                    size="small"
                    disabled={submitting}
                    onClick={() => setIsCreating(false)}
                  >
                    {c('cancel')}
                  </UI.Button>
                </div>
              </div>
            )}

            {selectedChannel && !isCreating && activeTab === 'overview' && (
              <div>
                {selectedChannel.platform ===
                  utils.constants.CHANNEL_PLATFORM_TELEGRAM &&
                  selectedChannel.metadata?.telegram?.bot && (
                    <div className="panel-bot-card">
                      <div className="panel-bot-avatar">
                        <Telegram />
                      </div>
                      <div className="panel-bot-text">
                        <p className="panel-bot-name">
                          {selectedChannel.metadata.telegram.bot.firstName}
                        </p>
                        {selectedChannel.metadata.telegram.bot.username && (
                          <p className="panel-bot-handle">
                            @{selectedChannel.metadata.telegram.bot.username}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                {selectedChannel.platform ===
                  utils.constants.CHANNEL_PLATFORM_SLACK &&
                  selectedChannel.metadata?.slack?.bot && (
                    <div className="panel-bot-card">
                      <div className="panel-bot-avatar">
                        <UI.Icons.Slack width={22} height={22} />
                      </div>
                      <div className="panel-bot-text">
                        <p className="panel-bot-name">
                          {selectedChannel.metadata.slack.bot.teamName ||
                            t('fallbackSlackWorkspace')}
                        </p>
                        {selectedChannel.metadata.slack.bot.username && (
                          <p className="panel-bot-handle">
                            @{selectedChannel.metadata.slack.bot.username}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                {selectedChannel.platform ===
                  utils.constants.CHANNEL_PLATFORM_SLACK && (
                  <div className="panel-section">
                    <p className="panel-section-label">{t('slackSetup')}</p>
                    <UI.CopyableBlock
                      label={t('requestUrl')}
                      text={`${process.env.NEXT_PUBLIC_API_URL || ''}/channel/${selectedChannel.id}/webhook/slack`}
                      onCopy={() =>
                        snackbar.success(t('toastRequestUrlCopied'))
                      }
                      onCopyError={() => snackbar.error(t('toastCopyFailed'))}
                    />
                    <p className="panel-toggle-hint">{t('slackSetupHint')}</p>
                    <SlackRequirements t={t} />
                  </div>
                )}

                {selectedChannel.platform ===
                  utils.constants.CHANNEL_PLATFORM_DISCORD &&
                  selectedChannel.metadata?.discord?.bot && (
                    <div className="panel-bot-card">
                      <div className="panel-bot-avatar">
                        <UI.Icons.Discord width={22} height={22} />
                      </div>
                      <div className="panel-bot-text">
                        <p className="panel-bot-name">
                          {selectedChannel.metadata.discord.bot.globalName ||
                            selectedChannel.metadata.discord.bot.username ||
                            t('fallbackDiscordBot')}
                        </p>
                        {selectedChannel.metadata.discord.bot.username && (
                          <p className="panel-bot-handle">
                            @{selectedChannel.metadata.discord.bot.username}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                {selectedChannel.platform ===
                  utils.constants.CHANNEL_PLATFORM_DISCORD && (
                  <div className="panel-section">
                    <p className="panel-section-label">{t('discordSetup')}</p>
                    <UI.CopyableBlock
                      label={t('interactionsUrl')}
                      text={`${process.env.NEXT_PUBLIC_API_URL || ''}/channel/${selectedChannel.id}/webhook/discord`}
                      onCopy={() =>
                        snackbar.success(t('toastInteractionsUrlCopied'))
                      }
                      onCopyError={() => snackbar.error(t('toastCopyFailed'))}
                    />
                    <p className="panel-toggle-hint">{t('discordSetupHint')}</p>
                    <DiscordRequirements t={t} />
                  </div>
                )}

                {selectedChannel.platform ===
                  utils.constants.CHANNEL_PLATFORM_WHATSAPP &&
                  selectedChannel.metadata?.whatsapp?.bot && (
                    <div className="panel-bot-card">
                      <div className="panel-bot-avatar">
                        <WhatsApp />
                      </div>
                      <div className="panel-bot-text">
                        <p className="panel-bot-name">
                          {selectedChannel.metadata.whatsapp.bot.verifiedName ||
                            selectedChannel.metadata.whatsapp.bot
                              .displayPhoneNumber ||
                            t('fallbackWhatsappNumber')}
                        </p>
                        {selectedChannel.metadata.whatsapp.bot
                          .displayPhoneNumber && (
                          <p className="panel-bot-handle">
                            {
                              selectedChannel.metadata.whatsapp.bot
                                .displayPhoneNumber
                            }
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                {selectedChannel.platform ===
                  utils.constants.CHANNEL_PLATFORM_WHATSAPP && (
                  <div className="panel-section">
                    <p className="panel-section-label">{t('whatsappSetup')}</p>
                    <UI.CopyableBlock
                      label={t('callbackUrl')}
                      text={`${process.env.NEXT_PUBLIC_API_URL || ''}/channel/${selectedChannel.id}/webhook/whatsapp`}
                      onCopy={() =>
                        snackbar.success(t('toastCallbackUrlCopied'))
                      }
                      onCopyError={() => snackbar.error(t('toastCopyFailed'))}
                    />
                    <p className="panel-toggle-hint">
                      {t('whatsappSetupHint')}
                    </p>
                    <WhatsappRequirements t={t} />
                  </div>
                )}

                <div className="panel-section">
                  <p className="panel-section-label">{t('statusLabel')}</p>
                  <div className="panel-toggle-row">
                    <div>
                      <p className="panel-toggle-label">
                        {t(isActive ? 'statusReceiving' : 'statusPaused')}
                      </p>
                      <p className="panel-toggle-hint">
                        {t(
                          isActive ? 'statusReceivingHint' : 'statusPausedHint'
                        )}
                      </p>
                    </div>
                    <Switch
                      checked={isActive}
                      disabled={statusUpdating}
                      onChange={handleStatusToggle}
                    />
                  </div>
                </div>

                <div className="panel-section">
                  <p className="panel-section-label">{t('languageModel')}</p>
                  <UI.Select
                    label=""
                    name="channelLlmId"
                    value={
                      selectedChannel.llmId ||
                      utils.constants.LLM_SYSTEM_DEFAULT
                    }
                    disabled={savingLlm && editingLlmId === selectedChannel.id}
                    helperText={
                      llms.length === 0
                        ? t('channelLlmHelpEmpty')
                        : t('channelLlmHelp')
                    }
                    options={[
                      {
                        label: t('systemDefault'),
                        value: utils.constants.LLM_SYSTEM_DEFAULT
                      },
                      ...llms.map(llm => ({
                        label: llm.name,
                        value: llm.id
                      }))
                    ]}
                    onChange={e => {
                      const value = e.target.value as string;
                      const current =
                        selectedChannel.llmId ||
                        utils.constants.LLM_SYSTEM_DEFAULT;
                      if (current === value) return;
                      handleChannelLlmChange(
                        selectedChannel.id,
                        value === utils.constants.LLM_SYSTEM_DEFAULT
                          ? ''
                          : value
                      );
                    }}
                  />
                </div>

                <div className="panel-section">
                  <p className="panel-section-label">{t('replyTiming')}</p>
                  <UI.Select
                    label=""
                    name="channelDebounceMs"
                    value={String(
                      utils.resolveDebounceMs(selectedChannel.config)
                    )}
                    disabled={savingDebounce}
                    helperText={t('replyTimingHelp')}
                    options={[
                      {
                        label: t('replyEveryMessage'),
                        value: String(utils.constants.CHANNEL_DEBOUNCE_DISABLED)
                      },
                      { label: t('replyWait2'), value: '2000' },
                      { label: t('replyWait5'), value: '5000' },
                      { label: t('replyWait10'), value: '10000' },
                      { label: t('replyWait30'), value: '30000' }
                    ]}
                    onChange={e => {
                      const value = e.target.value as string;
                      const current = String(
                        utils.resolveDebounceMs(selectedChannel.config)
                      );
                      if (current === value) return;
                      handleDebounceChange(selectedChannel.id, value);
                    }}
                  />
                </div>

                <div className="panel-section">
                  <p className="panel-section-label">{t('activity')}</p>
                  <div className="panel-stats">
                    <div className="panel-stat">
                      <p className="panel-stat-label">
                        {t('statConversations')}
                      </p>
                      <p className="panel-stat-value">
                        {t.n(selectedChannel.conversationCount)}
                      </p>
                    </div>
                    <div className="panel-stat">
                      <p className="panel-stat-label">{t('statMessages')}</p>
                      <p className="panel-stat-value">
                        {t.n(selectedChannel.messageCount)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="panel-danger-zone">
                  <p className="panel-danger-label">{t('dangerZone')}</p>
                  <UI.Button
                    size="small"
                    variant="outlined"
                    onClick={() => setDeleteAlert(true)}
                  >
                    <DeleteOutlined />
                    <span className="button-text">{t('removeChannel')}</span>
                  </UI.Button>
                </div>
              </div>
            )}

            {selectedChannel &&
              !isCreating &&
              activeTab === 'conversations' &&
              !activeConversation && (
                <div>
                  {conversationsStatus === 'pending' && (
                    <div className="panel-conversation-list">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="panel-conversation-item">
                          <UI.Skeleton variant="text" width="50%" height={18} />
                          <UI.Skeleton variant="text" width="35%" height={12} />
                        </div>
                      ))}
                    </div>
                  )}
                  {conversationsStatus !== 'pending' &&
                    conversations.length === 0 && (
                      <p className="panel-empty">{t('conversationsEmpty')}</p>
                    )}
                  <div className="panel-conversation-list">
                    {conversations.map(conv => (
                      <div
                        key={conv.id}
                        className="panel-conversation-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOpenConversation(conv)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleOpenConversation(conv);
                          }
                        }}
                      >
                        <div className="panel-conversation-row">
                          <p className="panel-conversation-title">
                            {conv.title || t('conversationUntitled')}
                          </p>
                          <span className="panel-conversation-scope">
                            {labelFor(SCOPE_KEY, conv.scope, t)}
                          </span>
                        </div>
                        <p className="panel-conversation-meta">
                          <span>
                            {t.plural('countMessages', conv.messageCount)}
                          </span>
                          <span>
                            {t.relative(conv.lastMessageAt, c('never'))}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {selectedChannel && activeConversation && (
              <div className="panel-messages-thread">
                {messagesStatus === 'pending' && (
                  <p className="panel-empty">{t('loadingMessages')}</p>
                )}
                {messagesStatus !== 'pending' && messages.length === 0 && (
                  <p className="panel-empty">{t('threadEmpty')}</p>
                )}
                {[...messages].reverse().map(msg => {
                  const isUser = msg.role === utils.constants.ROLE_MESSAGE_USER;
                  const attachments = collectResourceAttachments(
                    msg.usages || []
                  );
                  const messageIndex = messages.findIndex(m => m.id === msg.id);
                  let userMessageForTurn: Message | null = null;
                  for (let k = messageIndex + 1; k < messages.length; k++) {
                    if (
                      messages[k].role === utils.constants.ROLE_MESSAGE_USER
                    ) {
                      userMessageForTurn = messages[k];
                      break;
                    }
                  }
                  return (
                    <div
                      key={msg.id}
                      className={`panel-message-bubble ${isUser ? 'is-user' : 'is-assistant'}`}
                    >
                      <div className="panel-message-meta">
                        {isUser && msg.participant?.linkedUser ? (
                          <>
                            <div className="panel-message-linked">
                              {msg.participant.linkedUser.image ? (
                                <img
                                  className="panel-message-linked-avatar"
                                  src={msg.participant.linkedUser.image}
                                  alt={msg.participant.linkedUser.name || ''}
                                />
                              ) : (
                                <span className="panel-message-linked-avatar is-fallback">
                                  {msg.participant.linkedUser.name
                                    .charAt(0)
                                    .toUpperCase()}
                                </span>
                              )}
                              <span>{msg.participant.linkedUser.name}</span>
                            </div>
                            <span>·</span>
                          </>
                        ) : (
                          isUser &&
                          msg.participant?.displayName && (
                            <>
                              <span>{msg.participant.displayName}</span>
                              <span>·</span>
                            </>
                          )
                        )}
                        <span>{labelFor(ROLE_KEY, msg.role, t)}</span>
                        <span>·</span>
                        <span>{t.relative(msg.createdAt)}</span>
                      </div>
                      {msg.content ? (
                        <UI.Markdown
                          className="panel-message-content"
                          content={msg.content}
                        />
                      ) : (
                        <p className="panel-message-content">...</p>
                      )}
                      {attachments.length > 0 && (
                        <div className="panel-message-attachments">
                          {attachments.map(resource => (
                            <button
                              key={resource.id}
                              type="button"
                              className="panel-attachment"
                              onClick={() => handleOpenResource(resource.id)}
                            >
                              <span className="panel-attachment-icon">
                                {resourceAttachmentIcon(resource.mimeType)}
                              </span>
                              <span className="panel-attachment-text">
                                <span className="panel-attachment-title">
                                  {resource.title}
                                </span>
                                <span className="panel-attachment-mime">
                                  {resource.mimeType}
                                </span>
                              </span>
                              <OpenInNew className="panel-attachment-open" />
                            </button>
                          ))}
                        </div>
                      )}
                      {msg.metadata?.sources &&
                        msg.metadata.sources.length > 0 && (
                          <div className="panel-message-sources">
                            <p className="panel-message-sources-label">
                              {t('messageSources')}
                            </p>
                            <div className="panel-source-pills">
                              {msg.metadata.sources.map(
                                (source, sourceIndex) => {
                                  const isFile =
                                    source.sourceType ===
                                    utils.constants.RESOURCE_SOURCE_TYPE_FILE;
                                  const apiUrl =
                                    process.env.NEXT_PUBLIC_API_URL || '';
                                  const href = isFile
                                    ? utils.buildResourceDownloadUrl(
                                        { apiUrl, organizationId, projectId },
                                        source.resourceId,
                                        source.pageNumber
                                      )
                                    : source.uri;
                                  const label = isFile
                                    ? source.fileName || source.title
                                    : source.title;
                                  const domain = !isFile
                                    ? utils.safeHostname(source.uri)
                                    : null;
                                  const tooltip = (
                                    <div className="panel-source-tooltip">
                                      <span className="panel-source-tooltip-title">
                                        {label}
                                      </span>
                                      {isFile && source.pageNumber && (
                                        <span className="panel-source-tooltip-meta">
                                          {t('sourcePage', {
                                            number: source.pageNumber
                                          })}
                                        </span>
                                      )}
                                      {isFile && source.mimeType && (
                                        <span className="panel-source-tooltip-meta">
                                          {source.mimeType}
                                        </span>
                                      )}
                                      {!isFile && domain && (
                                        <span className="panel-source-tooltip-meta">
                                          {domain}
                                        </span>
                                      )}
                                      {source.excerpt && (
                                        <span className="panel-source-tooltip-excerpt">
                                          {source.excerpt}
                                        </span>
                                      )}
                                    </div>
                                  );
                                  return (
                                    <Tooltip
                                      key={`${source.resourceId}-${source.pageNumber ?? ''}-${sourceIndex}`}
                                      title={tooltip}
                                      placement="top"
                                      arrow
                                    >
                                      <a
                                        className="panel-source-pill"
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <span className="panel-source-pill-number">
                                          {sourceIndex + 1}
                                        </span>
                                        <span className="panel-source-pill-icon">
                                          {isFile ? (
                                            resourceAttachmentIcon(
                                              source.mimeType
                                            )
                                          ) : (
                                            <OpenInNew />
                                          )}
                                        </span>
                                        <span className="panel-source-pill-label">
                                          {label}
                                        </span>
                                      </a>
                                    </Tooltip>
                                  );
                                }
                              )}
                            </div>
                          </div>
                        )}
                      {(msg.tokensIn || msg.tokensOut || msg.latencyMs) && (
                        <p className="panel-message-stats">
                          {msg.tokensIn != null && (
                            <span>↓ {t.n(msg.tokensIn)} tok</span>
                          )}
                          {msg.tokensOut != null && (
                            <span>↑ {t.n(msg.tokensOut)} tok</span>
                          )}
                          {msg.latencyMs != null && (
                            <span>{t.n(msg.latencyMs)}ms</span>
                          )}
                        </p>
                      )}
                      {msg.usages && msg.usages.length > 0 && (
                        <div className="panel-message-usages">
                          {msg.usages.map(u => {
                            const open = () =>
                              setViewingUsage({
                                usage: u,
                                message: msg,
                                userMessage: userMessageForTurn
                              });
                            return (
                              <div key={u.id} className="panel-usage-row">
                                <div
                                  className={`panel-usage-item ${u.errorMessage ? 'has-error' : ''} is-clickable`}
                                  role="button"
                                  tabIndex={0}
                                  onClick={open}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      open();
                                    }
                                  }}
                                >
                                  {usageIcon(u.kind)}
                                  <span className="panel-usage-kind">
                                    {labelFor(KIND_KEY, u.kind, t)}
                                  </span>
                                  <span className="panel-usage-name">
                                    {usageLabel(u, t)}
                                  </span>
                                  {u.latencyMs != null && (
                                    <span className="panel-usage-latency">
                                      {t.n(u.latencyMs)}ms
                                    </span>
                                  )}
                                </div>
                                {u.errorMessage && (
                                  <p className="panel-usage-error">
                                    {u.errorMessage}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <UI.Alert
        open={deleteAlert}
        title={t('confirmRemoveTitle')}
        description={t('confirmRemoveText', {
          name: selectedChannel
            ? channelLabel(selectedChannel)
            : t('confirmRemoveFallback')
        })}
        confirmText={t('confirmRemove')}
        cancelText={c('cancel')}
        loadingText={c('deleting')}
        loading={submitting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteAlert(false)}
      />
      {viewingUsage && (
        <UI.Portal>
          <UsageModalOverlay
            role="button"
            tabIndex={0}
            aria-label={t('closeDetails')}
            onClick={() => setViewingUsage(null)}
            onKeyDown={e => {
              if (e.key === 'Escape') setViewingUsage(null);
            }}
          >
            <div
              className="usage-modal"
              role="dialog"
              aria-modal="true"
              onClick={e => e.stopPropagation()}
            >
              <div className="usage-modal-header">
                <div className="usage-modal-header-text">
                  <p className="usage-modal-kind">
                    {labelFor(KIND_KEY, viewingUsage.usage.kind, t)}
                  </p>
                  <h2 className="usage-modal-title">
                    {usageLabel(viewingUsage.usage, t)}
                  </h2>
                  {viewingUsage.usage.latencyMs != null && (
                    <p className="usage-modal-meta">
                      {t.n(viewingUsage.usage.latencyMs)}ms
                    </p>
                  )}
                </div>
                <IconButton size="small" onClick={() => setViewingUsage(null)}>
                  <Close />
                </IconButton>
              </div>
              <div className="usage-modal-body">
                {viewingUsage.userMessage && (
                  <UI.CopyableBlock
                    label={t('usageUserMessage')}
                    text={viewingUsage.userMessage.content || ''}
                    onCopy={() => snackbar.success(t('toastUserMessageCopied'))}
                    onCopyError={() => snackbar.error(t('toastCopyFailed'))}
                    meta={`${viewingUsage.userMessage.participant?.linkedUser?.name || viewingUsage.userMessage.participant?.displayName || t('usageUnknownActor')} · ${t.relative(viewingUsage.userMessage.createdAt)}`}
                  />
                )}
                {(viewingUsage.message.tokensIn != null ||
                  viewingUsage.message.tokensOut != null ||
                  viewingUsage.message.latencyMs != null) && (
                  <div className="usage-modal-section">
                    <p className="usage-modal-label">
                      {t('usageAssistantTurn')}
                    </p>
                    <p className="usage-modal-meta">
                      {viewingUsage.message.tokensIn != null && (
                        <span>↓ {viewingUsage.message.tokensIn} tok</span>
                      )}
                      {viewingUsage.message.tokensOut != null && (
                        <span> · ↑ {viewingUsage.message.tokensOut} tok</span>
                      )}
                      {viewingUsage.message.latencyMs != null && (
                        <span> · {viewingUsage.message.latencyMs}ms total</span>
                      )}
                    </p>
                  </div>
                )}
                {viewingUsage.usage.errorMessage && (
                  <UI.CopyableBlock
                    label={t('usageError')}
                    text={viewingUsage.usage.errorMessage}
                    variant="error"
                    onCopy={() => snackbar.success(t('toastErrorCopied'))}
                    onCopyError={() => snackbar.error(t('toastCopyFailed'))}
                  />
                )}
                {viewingUsage.usage.input &&
                  Object.keys(viewingUsage.usage.input).length > 0 && (
                    <UI.CopyableBlock
                      label={t('usageInput')}
                      text={JSON.stringify(viewingUsage.usage.input, null, 2)}
                      onCopy={() => snackbar.success(t('toastInputCopied'))}
                      onCopyError={() => snackbar.error(t('toastCopyFailed'))}
                    />
                  )}
                {(() => {
                  const raw = extractUsageText(viewingUsage.usage.output);
                  if (!raw) return null;
                  let pretty = raw;
                  try {
                    pretty = JSON.stringify(JSON.parse(raw), null, 2);
                  } catch {
                    pretty = raw;
                  }
                  return (
                    <UI.CopyableBlock
                      label={t('usageOutput')}
                      text={pretty}
                      onCopy={() => snackbar.success(t('toastOutputCopied'))}
                      onCopyError={() => snackbar.error(t('toastCopyFailed'))}
                    />
                  );
                })()}
              </div>
              {(() => {
                const u = viewingUsage.usage;
                const targets: {
                  label: string;
                  Icon: typeof BuildOutlined;
                  onClick: () => void;
                }[] = [];
                if (u.artifactTool?.id) {
                  const id = u.artifactTool.id;
                  targets.push({
                    label: t('usageOpenInTools'),
                    Icon: BuildOutlined,
                    onClick: () => {
                      setViewingUsage(null);
                      handleOpenTool(id);
                    }
                  });
                }
                if (u.artifactResource?.id) {
                  const id = u.artifactResource.id;
                  targets.push({
                    label: t('usageOpenInResources'),
                    Icon: AttachFileOutlined,
                    onClick: () => {
                      setViewingUsage(null);
                      handleOpenResource(id);
                    }
                  });
                }
                if (u.artifactPrompt?.id) {
                  const id = u.artifactPrompt.id;
                  targets.push({
                    label: t('usageOpenInPrompts'),
                    Icon: AutoAwesomeOutlined,
                    onClick: () => {
                      setViewingUsage(null);
                      handleOpenPrompt(id);
                    }
                  });
                }
                if (targets.length === 0) return null;
                return (
                  <div className="usage-modal-footer">
                    {targets.map(({ label, Icon, onClick }) => (
                      <UI.Button
                        key={label}
                        variant="contained"
                        size="small"
                        onClick={onClick}
                      >
                        <Icon />
                        <span className="button-text">{label}</span>
                      </UI.Button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </UsageModalOverlay>
        </UI.Portal>
      )}
    </Wrapper>
  );
};

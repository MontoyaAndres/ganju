import { commandContext } from '../context.js';
import { CliError } from '../errors.js';
import {
  color,
  formatWhen,
  json as printJson,
  note,
  say,
  table
} from '../output.js';

interface ChannelRow {
  id: string;
  platform: string;
  metadata: {
    whatsapp?: {
      bot?: { displayPhoneNumber?: string; verifiedName?: string };
    };
  } | null;
}

interface TemplateRow {
  name: string;
  language: string;
  category: string;
  status: string;
  rejectedReason: string | null;
  variableCount: number;
  sendable: boolean;
  labels: string[];
  syncedAt: string;
}

interface TemplateList {
  businessAccountId: string | null;
  templates: TemplateRow[];
  syncedAt: string | null;
}

const STATUS_COLOR: Record<string, (text: string) => string> = {
  APPROVED: color.green,
  PENDING: color.yellow,
  REJECTED: color.red,
  PAUSED: color.red,
  DISABLED: color.red
};

/**
 * `ganju channel templates` — the WhatsApp message templates of the project's
 * channels, with Meta's status, as Ganju last synced them.
 *
 * Read-only on purpose: creating one is done in the dashboard, where the
 * preview and Meta's rules are checked before it goes for review.
 */
const templates = async (flags: { json?: boolean }): Promise<void> => {
  const { api, projectPath } = await commandContext();
  const channels = (
    await api.request<ChannelRow[]>(`${projectPath}/channel`)
  ).filter(channel => channel.platform === 'whatsapp');

  const lists = await Promise.all(
    channels.map(async channel => ({
      channel,
      list: await api.request<TemplateList>(
        `${projectPath}/channel/${channel.id}/whatsapp/template`
      )
    }))
  );

  if (flags.json) {
    printJson(
      lists.map(({ channel, list }) => ({
        channelId: channel.id,
        businessAccountId: list.businessAccountId,
        syncedAt: list.syncedAt,
        templates: list.templates
      }))
    );
    return;
  }

  if (channels.length === 0) {
    note('This project has no WhatsApp channel.');
    return;
  }

  for (const { channel, list } of lists) {
    const bot = channel.metadata?.whatsapp?.bot;
    say(
      color.bold(
        `WhatsApp · ${bot?.verifiedName || bot?.displayPhoneNumber || channel.id}`
      )
    );
    if (list.templates.length === 0) {
      note(
        color.gray(
          list.businessAccountId
            ? '  no templates yet — create them in the channel’s Message templates'
            : '  not connected to its WhatsApp Business account yet — open Message templates in the dashboard'
        )
      );
      continue;
    }
    table([
      [
        color.gray('NAME'),
        color.gray('LANGUAGE'),
        color.gray('CATEGORY'),
        color.gray('STATUS'),
        color.gray('VARIABLES')
      ],
      ...list.templates.map(template => [
        template.name,
        template.language,
        template.category.toLowerCase(),
        (STATUS_COLOR[template.status] ?? ((t: string) => t))(
          template.status.toLowerCase()
        ) +
          (template.rejectedReason
            ? color.gray(` (${template.rejectedReason})`)
            : '') +
          (template.sendable === false
            ? color.gray(' (Ganju can’t send it)')
            : ''),
        Array.from(
          { length: template.variableCount },
          (_, i) =>
            `{{${i + 1}}}${template.labels[i] ? ` ${template.labels[i]}` : ''}`
        ).join(', ') || color.gray('none')
      ])
    ]);
    if (list.syncedAt) {
      note(color.gray(`  synced ${formatWhen(list.syncedAt)}`));
    }
  }
};

export const channel = async (
  positionals: string[],
  flags: { json?: boolean }
): Promise<void> => {
  const [sub] = positionals;
  if (sub === 'templates') return templates(flags);
  throw new CliError(
    sub ? `Unknown channel command "${sub}"` : 'Which channel command?',
    {
      hint: 'ganju channel templates'
    }
  );
};

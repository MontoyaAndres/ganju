import { and, eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import { loadProxiedPrompts } from '../controllers/channel/proxiedPrompts';

import type { EnvSource } from '@ganju/utils';

interface DiscordApplicationCommand {
  name: string;
  description: string;
  // CHAT_INPUT (slash) command.
  type: 1;
  options?: Array<{
    // STRING option — the free text passed to the prompt.
    type: 3;
    name: string;
    description: string;
    required: boolean;
  }>;
}

// Build the application-command set: a reserved `/link` command plus one slash
// command per prompt (artifact + proxied). Prompt titles are slugified to valid
// Discord command names (lowercase, ≤32 chars); invalid ones are dropped. Each
// prompt command takes a single optional `text` argument carrying the trailing
// text, mirroring how Telegram/Slack pass trailingText to the matched prompt.
const buildCommands = (
  prompts: Array<{ title: string; description: string | null }>
): DiscordApplicationCommand[] => {
  const promptCommands = prompts
    .map(p => ({
      name: utils.slugifyTitle(p.title).slice(0, 32),
      description: (p.description || p.title || 'Run this prompt').slice(0, 100)
    }))
    .filter(
      c =>
        /^[a-z][a-z0-9_-]*$/.test(c.name) &&
        !utils.constants.RESERVED_BOT_COMMANDS.includes(c.name)
    )
    .map<DiscordApplicationCommand>(c => ({
      name: c.name,
      description: c.description,
      type: 1,
      options: [
        {
          type: 3,
          name: 'text',
          description: 'Additional text for the prompt',
          required: false
        }
      ]
    }));

  const linkCommand: DiscordApplicationCommand = {
    name: utils.constants.BOT_COMMAND_LINK,
    description: 'Link this Discord account to your Ganju account',
    type: 1
  };

  // Discord caps global commands at 100; keep `/link` and trim prompts to fit.
  return [linkCommand, ...promptCommands].slice(0, 100);
};

// Overwrite the bot's global application commands (PUT replaces the whole set).
// Best-effort — a failed call must never break the caller (command autocomplete
// is a nicety, not critical). Note Discord uses `Authorization: Bot <token>`.
export const registerDiscordCommands = async (
  botToken: string,
  applicationId: string,
  prompts: Array<{ title: string; description: string | null }>
) => {
  const commands = buildCommands(prompts);
  await fetch(
    `${utils.constants.DISCORD_API_BASE}/applications/${applicationId}/commands`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commands)
    }
  ).catch(() => undefined);
};

// Re-push the slash-command set for every active Discord channel on an artifact.
// The set is otherwise only registered at channel creation, so a prompt
// added/edited/removed later — or a proxied (mcp-proxy) prompt being enabled —
// wouldn't show up until the channel was recreated. Call after any change to the
// artifact's prompt set. Best-effort: a bad/rotated token never fails the write.
export const syncDiscordCommandsForArtifact = async (
  c: EnvSource,
  dbInstance: ReturnType<typeof db.create>,
  artifactId: string
): Promise<void> => {
  const channels = await dbInstance
    .select({ credentials: db.schema.channel.credentials })
    .from(db.schema.channel)
    .where(
      and(
        eq(db.schema.channel.artifactId, artifactId),
        eq(
          db.schema.channel.platform,
          utils.constants.CHANNEL_PLATFORM_DISCORD
        ),
        eq(db.schema.channel.status, utils.constants.STATUS_ACTIVE)
      )
    );
  if (channels.length === 0) return;

  const prompts = await dbInstance
    .select({
      title: db.schema.artifactPrompt.title,
      description: db.schema.artifactPrompt.description
    })
    .from(db.schema.artifactPrompt)
    .where(eq(db.schema.artifactPrompt.artifactId, artifactId));

  const proxiedPrompts = await loadProxiedPrompts(dbInstance, artifactId);
  const commands = [
    ...prompts,
    ...proxiedPrompts.map(p => ({
      title: p.title,
      description: p.description
    }))
  ];

  const encryptionKey = utils.getCredentialEncryptionKey(c);
  await Promise.all(
    channels.map(async channel => {
      try {
        const { botToken, applicationId } = JSON.parse(
          utils.decryptString(channel.credentials, encryptionKey)
        ) as { botToken: string; applicationId: string };
        if (botToken && applicationId) {
          await registerDiscordCommands(botToken, applicationId, commands);
        }
      } catch {
        // A channel with an unreadable/rotated token shouldn't block the rest.
      }
    })
  );
};

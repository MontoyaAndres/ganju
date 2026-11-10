import { and, eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import { loadCommandPrompts } from '../controllers/channel/proxiedPrompts';

import type { EnvSource } from '@ganju/utils';

// Push the bot's slash-command menu (Telegram setMyCommands). Prompt titles are
// slugified to valid command names; reserved/invalid ones are dropped, and the
// list is capped at Telegram's 100-command limit. Best-effort — a failed call
// must never break the caller (command autocomplete is a nicety, not critical).
export const registerTelegramBotCommands = async (
  botToken: string,
  prompts: Array<{ title: string; description: string | null }>
) => {
  const commands = prompts
    .map(p => ({
      command: utils.slugifyTitle(p.title).slice(0, 32),
      description: (p.description || p.title).slice(0, 256)
    }))
    .filter(
      c =>
        /^[a-z][a-z0-9_]*$/.test(c.command) &&
        !utils.constants.RESERVED_BOT_COMMANDS.includes(c.command)
    )
    .slice(0, 100);

  await fetch(
    `${utils.constants.TELEGRAM_API_BASE}/bot${botToken}/setMyCommands`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands })
    }
  ).catch(() => undefined);
};

// Re-push the slash-command menu for every active Telegram channel on an
// artifact. The menu is otherwise only set at channel creation, so a prompt
// added/edited/removed later — or a proxied (mcp-proxy) prompt being enabled —
// wouldn't show up in autocomplete until the channel was recreated. Call after
// any change to the artifact's prompt set (artifact prompts OR mcp-proxy
// installs). Best-effort: a bad/rotated token never fails the caller's write.
export const syncTelegramCommandsForArtifact = async (
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
          utils.constants.CHANNEL_PLATFORM_TELEGRAM
        ),
        eq(db.schema.channel.status, utils.constants.STATUS_ACTIVE)
      )
    );
  if (channels.length === 0) return;

  const commands = await loadCommandPrompts(dbInstance, artifactId);

  const encryptionKey = utils.getCredentialEncryptionKey(c);
  await Promise.all(
    channels.map(async channel => {
      try {
        const { botToken } = JSON.parse(
          utils.decryptString(channel.credentials, encryptionKey)
        ) as { botToken: string };
        await registerTelegramBotCommands(botToken, commands);
      } catch {
        // A channel with an unreadable/rotated token shouldn't block the rest.
      }
    })
  );
};

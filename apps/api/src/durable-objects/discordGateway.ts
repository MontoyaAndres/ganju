import { DurableObject } from 'cloudflare:workers';
import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import type { Bindings } from '../types';

// One DiscordGatewayDO per channel (id derived from channelId). It holds the
// persistent Discord Gateway WebSocket — the only way Discord delivers free-form
// messages / @mentions / DMs (its HTTP interactions endpoint only carries slash
// commands). The DO never sends Discord messages; on a relevant MESSAGE_CREATE
// it forwards a normalized payload to the worker's own `/channel/:id/ingest/
// discord` route (via the SELF service binding), where the existing channel
// runner produces and posts the reply. The DO stays alive via an alarm that both
// heartbeats the socket and reconnects (RESUME) if the instance was evicted.

interface GatewaySession {
  id: string;
  resumeUrl: string;
}

interface DiscordAuthor {
  id: string;
  bot?: boolean;
  username?: string;
  global_name?: string | null;
  discriminator?: string;
}

interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  content?: string;
  author?: DiscordAuthor;
  mentions?: Array<{ id: string }>;
  type?: number;
}

export class DiscordGatewayDO extends DurableObject<Bindings> {
  private ws: WebSocket | null = null;
  private lastSeq: number | null = null;
  private heartbeatMs = utils.constants.DISCORD_GATEWAY_DEFAULT_HEARTBEAT_MS;
  private botToken: string | null = null;
  private botUserId: string | null = null;

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
  }

  // RPC control surface (called from the channel controller)

  // Begin (or restart) the gateway connection for a channel. Idempotent: a
  // second call just reconnects with fresh credentials.
  async start(channelId: string): Promise<void> {
    await this.ctx.storage.put('channelId', channelId);
    await this.ctx.storage.put('stopped', false);
    // An explicit (re)start must re-IDENTIFY from scratch — dropping any prior
    // session + cached bot id ensures we get a fresh READY and the bot id that
    // matches the *current* token (it may have changed since last connect).
    await this.ctx.storage.delete('session');
    await this.ctx.storage.delete('botUserId');
    this.botToken = null;
    this.botUserId = null;
    this.lastSeq = null;
    await this.connectGateway();
    // Alarm drives heartbeats + keepalive/reconnect after eviction.
    await this.ctx.storage.setAlarm(Date.now() + this.heartbeatMs);
  }

  // Permanently stop (channel disabled or deleted). Clears all state so a future
  // alarm can't revive the socket.
  async stop(): Promise<void> {
    await this.ctx.storage.put('stopped', true);
    await this.ctx.storage.delete('session');
    await this.ctx.storage.deleteAlarm();
    this.closeSocket();
  }

  // connection lifecycle

  private closeSocket(): void {
    try {
      this.ws?.close();
    } catch {
      // already closed
    }
    this.ws = null;
  }

  private async loadBotToken(channelId: string): Promise<string | null> {
    if (this.botToken) return this.botToken;
    const dbInstance = db.create({ env: this.env });
    const [channelRow] = await dbInstance
      .select({
        credentials: db.schema.channel.credentials,
        platform: db.schema.channel.platform
      })
      .from(db.schema.channel)
      .where(eq(db.schema.channel.id, channelId))
      .limit(1);
    if (
      !channelRow ||
      channelRow.platform !== utils.constants.CHANNEL_PLATFORM_DISCORD
    ) {
      return null;
    }
    const encryptionKey = utils.getCredentialEncryptionKey({
      env: this.env
    } as unknown as Context);
    const creds = JSON.parse(
      utils.decryptString(channelRow.credentials, encryptionKey)
    ) as { botToken?: string };
    this.botToken = creds.botToken || null;
    return this.botToken;
  }

  private async connectGateway(): Promise<void> {
    const channelId = (await this.ctx.storage.get<string>('channelId')) || null;
    if (!channelId) return;
    if ((await this.ctx.storage.get<boolean>('stopped')) === true) return;

    const token = await this.loadBotToken(channelId);
    if (!token) return;

    const session = await this.ctx.storage.get<GatewaySession>('session');
    // Resume onto the session's gateway url when we have one; otherwise discover
    // a fresh socket url from the REST API.
    let baseUrl: string;
    if (session?.resumeUrl) {
      baseUrl = session.resumeUrl;
    } else {
      const discovered = await this.discoverGatewayUrl(token);
      if (!discovered) return;
      baseUrl = discovered;
    }
    // Cloudflare's fetch-based WebSocket only accepts an http(s) scheme — a
    // ws(s):// URL is rejected ("Fetch API cannot load"). Discord hands back a
    // wss:// gateway/resume url, so swap the scheme before connecting.
    const wsUrl = `${baseUrl}${utils.constants.DISCORD_GATEWAY_QUERY}`.replace(
      /^wss:/,
      'https:'
    );

    let socket: WebSocket | null = null;
    try {
      const resp = await fetch(wsUrl, { headers: { Upgrade: 'websocket' } });
      socket = resp.webSocket;
    } catch {
      socket = null;
    }
    if (!socket) return;

    this.closeSocket();
    socket.accept();
    this.ws = socket;

    socket.addEventListener('message', event => {
      this.ctx.waitUntil(this.onMessage(event.data));
    });
    socket.addEventListener('close', () => {
      if (this.ws === socket) this.ws = null;
    });
    socket.addEventListener('error', () => {
      if (this.ws === socket) this.ws = null;
    });
  }

  private async discoverGatewayUrl(token: string): Promise<string | null> {
    try {
      const resp = await fetch(
        `${utils.constants.DISCORD_API_BASE}/gateway/bot`,
        { headers: { Authorization: `Bot ${token}` } }
      );
      if (!resp.ok) return null;
      const data = (await resp.json()) as { url?: string };
      return data.url || null;
    } catch {
      return null;
    }
  }

  private send(payload: Record<string, unknown>): void {
    try {
      this.ws?.send(JSON.stringify(payload));
    } catch {
      this.closeSocket();
    }
  }

  // gateway protocol

  private async onMessage(raw: string | ArrayBuffer): Promise<void> {
    let event: { op: number; t?: string | null; s?: number | null; d?: any };
    try {
      const text =
        typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      event = JSON.parse(text);
    } catch {
      return;
    }

    if (typeof event.s === 'number') this.lastSeq = event.s;

    const op = utils.constants;
    switch (event.op) {
      case op.DISCORD_GATEWAY_OP_HELLO: {
        const interval = event.d?.heartbeat_interval;
        if (typeof interval === 'number' && interval > 0) {
          this.heartbeatMs = interval;
        }
        await this.identifyOrResume();
        return;
      }
      case op.DISCORD_GATEWAY_OP_HEARTBEAT:
        this.send({ op: op.DISCORD_GATEWAY_OP_HEARTBEAT, d: this.lastSeq });
        return;
      case op.DISCORD_GATEWAY_OP_HEARTBEAT_ACK:
        return;
      case op.DISCORD_GATEWAY_OP_RECONNECT:
        // Discord asked us to reconnect — resume if we can.
        this.closeSocket();
        await this.connectGateway();
        return;
      case op.DISCORD_GATEWAY_OP_INVALID_SESSION:
        // d === true means the session is resumable; otherwise re-identify fresh.
        if (event.d !== true) {
          await this.ctx.storage.delete('session');
        }
        this.closeSocket();
        await this.connectGateway();
        return;
      case op.DISCORD_GATEWAY_OP_DISPATCH:
        await this.onDispatch(event.t || '', event.d);
        return;
      default:
        return;
    }
  }

  private async identifyOrResume(): Promise<void> {
    const token = this.botToken;
    if (!token) return;
    const session = await this.ctx.storage.get<GatewaySession>('session');
    if (session?.id && this.lastSeq !== null) {
      this.send({
        op: utils.constants.DISCORD_GATEWAY_OP_RESUME,
        d: { token, session_id: session.id, seq: this.lastSeq }
      });
      return;
    }
    this.send({
      op: utils.constants.DISCORD_GATEWAY_OP_IDENTIFY,
      d: {
        token,
        intents: utils.constants.DISCORD_INTENTS,
        properties: { os: 'linux', browser: 'ganju', device: 'ganju' }
      }
    });
  }

  private async onDispatch(type: string, data: any): Promise<void> {
    if (type === 'READY') {
      this.botUserId = data?.user?.id || null;
      // Persist the bot id so a resumed/reconnected instance (which never sees a
      // fresh READY) can still recognise @mentions instead of ignoring them all.
      if (this.botUserId) {
        await this.ctx.storage.put('botUserId', this.botUserId);
      }
      const session: GatewaySession = {
        id: data?.session_id || '',
        resumeUrl: data?.resume_gateway_url || ''
      };
      if (session.id) await this.ctx.storage.put('session', session);
      return;
    }
    if (type === 'RESUMED') return;
    if (type === 'MESSAGE_CREATE') {
      await this.onDiscordMessage(data as DiscordMessage);
    }
  }

  private async onDiscordMessage(message: DiscordMessage): Promise<void> {
    if (!message?.id || !message.channel_id || !message.author) return;
    // Never react to bots (including ourselves) — prevents loops.
    if (message.author.bot) return;
    // Recover the bot id from storage if this instance was resumed without a
    // fresh READY — otherwise every channel mention would be ignored.
    if (!this.botUserId) {
      this.botUserId =
        (await this.ctx.storage.get<string>('botUserId')) || null;
    }
    if (this.botUserId && message.author.id === this.botUserId) return;

    const isDm = !message.guild_id;
    const mentionsBot =
      !!this.botUserId &&
      (message.mentions || []).some(m => m.id === this.botUserId);

    // In servers, only act when @mentioned (mirrors Slack's app_mention rule);
    // DMs are always for us.
    if (!isDm && !mentionsBot) return;

    const channelId = await this.ctx.storage.get<string>('channelId');
    if (!channelId) return;
    const secret = utils.getEnv({ env: this.env }, 'MCP_INTERNAL_SECRET');
    if (!secret) return;

    const author = message.author;
    const displayName =
      author.global_name || author.username || `user-${author.id}`;

    const body = {
      message: {
        id: message.id,
        channelId: message.channel_id,
        guildId: message.guild_id || null,
        isDm,
        content: message.content || '',
        botUserId: this.botUserId,
        author: {
          id: author.id,
          displayName,
          username: author.username || null
        }
      }
    };

    try {
      const response = await this.env.API.fetch(
        `https://ganju-discord-gateway/channel/${channelId}/ingest/discord`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [utils.constants.MCP_INTERNAL_HEADER]: secret
          },
          body: JSON.stringify(body)
        }
      );
      // Read the body, or the ingest request stays open until this object
      // shuts down and is logged as canceled.
      await response.arrayBuffer().catch(() => undefined);
    } catch {
      // A failed ingest must not crash the socket loop; the user can retry.
    }
  }

  // alarm: heartbeat + keepalive/reconnect

  async alarm(): Promise<void> {
    if ((await this.ctx.storage.get<boolean>('stopped')) === true) return;

    if (this.ws) {
      this.send({
        op: utils.constants.DISCORD_GATEWAY_OP_HEARTBEAT,
        d: this.lastSeq
      });
    } else {
      // Socket was lost (eviction or disconnect) — reconnect, resuming if we can.
      await this.connectGateway();
    }

    await this.ctx.storage.setAlarm(Date.now() + this.heartbeatMs);
  }
}

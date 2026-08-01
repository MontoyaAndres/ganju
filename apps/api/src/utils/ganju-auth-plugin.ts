import { z } from 'zod';
import {
  createAuthEndpoint,
  sessionMiddleware,
  APIError
} from 'better-auth/api';
import { signJWT } from 'better-auth/plugins/jwt';
import { utils } from '@ganju/utils';
import type { BetterAuthPlugin } from 'better-auth';

const generateLinkCode = (): string => {
  const bytes = new Uint8Array(utils.constants.LINK_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes)
    out +=
      utils.constants.LINK_CODE_ALPHABET[
        b % utils.constants.LINK_CODE_ALPHABET.length
      ];
  return out;
};

const parseBasicCredentials = (
  header: string | null | undefined
): { id: string; secret: string } | null => {
  if (!header) return null;
  const match = /^Basic\s+(.+)$/i.exec(header);
  if (!match) return null;
  try {
    const decoded = atob(match[1].trim());
    const idx = decoded.indexOf(':');
    if (idx === -1) return null;
    return { id: decoded.slice(0, idx), secret: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
};

interface BotClientRow {
  id: string;
  clientId: string;
  clientSecret: string | null;
  disabled: boolean;
  type: string;
}

interface LinkPayload {
  provider: string;
  externalId: string;
  displayName: string | null;
  botClientId: string;
  channelId: string;
}

interface ExternalIdentityRow {
  id: string;
  userId: string;
  channelId: string;
  provider: string;
  externalId: string;
  displayName: string | null;
}

const authenticateBotClient = async (
  ctx: {
    headers?: Headers;
    context: { adapter: { findOne: (args: unknown) => Promise<unknown> } };
  },
  trustedClientId: string | undefined,
  bodyClientId?: string,
  bodyClientSecret?: string
): Promise<BotClientRow> => {
  const fromBasic = parseBasicCredentials(ctx.headers?.get('authorization'));
  const clientId = fromBasic?.id ?? bodyClientId;
  const clientSecret = fromBasic?.secret ?? bodyClientSecret;

  if (!clientId || !clientSecret) {
    throw new APIError('UNAUTHORIZED', {
      error: 'invalid_client',
      error_description: 'Missing client credentials'
    });
  }

  // The bot-on-behalf-of grant mints tokens carrying a linked user's `sub`, so
  // it must be restricted to the single bot client provisioned out-of-band via
  // env. Without this pin, any self-service dynamically-registered OAuth client
  // could call this grant and impersonate any linked user.
  if (!trustedClientId || clientId !== trustedClientId) {
    throw new APIError('UNAUTHORIZED', {
      error: 'invalid_client',
      error_description: 'Client is not authorized for this grant'
    });
  }

  const row = (await ctx.context.adapter.findOne({
    model: 'oauthClient',
    where: [{ field: 'clientId', value: clientId }]
  })) as BotClientRow | null;

  if (!row || row.disabled || !row.clientSecret) {
    throw new APIError('UNAUTHORIZED', {
      error: 'invalid_client',
      error_description: 'Unknown client'
    });
  }

  // `@better-auth/oauth-provider` stores client secrets hashed, so the stored
  // value is compared against a hash of what the caller presented — matching
  // the plugin's own default (SHA-256, unpadded base64url).
  const ok = utils.timingSafeEqual(
    row.clientSecret,
    await utils.sha256Base64Url(clientSecret)
  );
  if (!ok) {
    throw new APIError('UNAUTHORIZED', {
      error: 'invalid_client',
      error_description: 'Bad client secret'
    });
  }

  return row;
};

export const ganjuAuthPlugin = (
  trustedBotClientId?: string
): BetterAuthPlugin => ({
  id: 'ganju-auth',
  endpoints: {
    startExternalLink: createAuthEndpoint(
      '/external/start',
      {
        method: 'POST',
        body: z.object({
          provider: z.enum(utils.constants.CHANNEL_PLATFORMS),
          externalId: z.string().min(1),
          channelId: z.string().min(1),
          displayName: z.string().optional(),
          client_id: z.string().optional(),
          client_secret: z.string().optional()
        })
      },
      async ctx => {
        const client = await authenticateBotClient(
          ctx as never,
          trustedBotClientId,
          ctx.body.client_id,
          ctx.body.client_secret
        );

        const code = generateLinkCode();
        const expiresAt = new Date(
          Date.now() + utils.constants.EXTERNAL_LINK_TTL_SECONDS * 1000
        );

        const payload: LinkPayload = {
          provider: ctx.body.provider,
          externalId: ctx.body.externalId,
          channelId: ctx.body.channelId,
          displayName: ctx.body.displayName ?? null,
          botClientId: client.clientId
        };

        await ctx.context.adapter.create({
          model: 'verification',
          data: {
            identifier: `${utils.constants.EXTERNAL_LINK_VERIFICATION_PREFIX}${code}`,
            value: JSON.stringify(payload),
            expiresAt,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });

        return ctx.json({
          code,
          expiresIn: utils.constants.EXTERNAL_LINK_TTL_SECONDS,
          expiresAt: expiresAt.toISOString()
        });
      }
    ),

    confirmExternalLink: createAuthEndpoint(
      '/external/confirm',
      {
        method: 'POST',
        body: z.object({ code: z.string().min(1) }),
        use: [sessionMiddleware]
      },
      async ctx => {
        const userId = ctx.context.session.user.id;
        const verification =
          await ctx.context.internalAdapter.findVerificationValue(
            `${utils.constants.EXTERNAL_LINK_VERIFICATION_PREFIX}${ctx.body.code}`
          );

        if (!verification) {
          throw new APIError('NOT_FOUND', {
            error: 'invalid_or_expired_code'
          });
        }
        if (verification.expiresAt < new Date()) {
          await ctx.context.adapter.delete({
            model: 'verification',
            where: [{ field: 'id', value: verification.id }]
          });
          throw new APIError('GONE', { error: 'expired_code' });
        }

        const payload = JSON.parse(verification.value) as LinkPayload;

        const existing = (await ctx.context.adapter.findOne({
          model: 'externalIdentity',
          where: [
            { field: 'channelId', value: payload.channelId },
            { field: 'provider', value: payload.provider },
            { field: 'externalId', value: payload.externalId }
          ]
        })) as ExternalIdentityRow | null;

        if (existing && existing.userId !== userId) {
          throw new APIError('CONFLICT', {
            error: 'already_linked_to_other_user'
          });
        }

        const identity =
          existing ??
          ((await ctx.context.adapter.create({
            model: 'externalIdentity',
            data: {
              userId,
              channelId: payload.channelId,
              provider: payload.provider,
              externalId: payload.externalId,
              displayName: payload.displayName,
              linkedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date()
            }
          })) as ExternalIdentityRow);

        await ctx.context.adapter.delete({
          model: 'verification',
          where: [{ field: 'id', value: verification.id }]
        });

        return ctx.json(identity);
      }
    ),

    listExternalIdentities: createAuthEndpoint(
      '/external',
      { method: 'GET', use: [sessionMiddleware] },
      async ctx => {
        const userId = ctx.context.session.user.id;
        const rows = await ctx.context.adapter.findMany({
          model: 'externalIdentity',
          where: [{ field: 'userId', value: userId }]
        });
        return ctx.json(rows);
      }
    ),

    unlinkExternalIdentity: createAuthEndpoint(
      '/external/:id',
      { method: 'DELETE', use: [sessionMiddleware] },
      async ctx => {
        const userId = ctx.context.session.user.id;
        const id = (ctx.params as { id: string }).id;

        const row = (await ctx.context.adapter.findOne({
          model: 'externalIdentity',
          where: [{ field: 'id', value: id }]
        })) as ExternalIdentityRow | null;

        if (!row || row.userId !== userId) {
          throw new APIError('NOT_FOUND', { error: 'identity_not_found' });
        }

        await ctx.context.adapter.delete({
          model: 'externalIdentity',
          where: [{ field: 'id', value: id }]
        });

        return ctx.json({ ok: true });
      }
    ),

    botToken: createAuthEndpoint(
      '/oauth/bot/token',
      {
        method: 'POST',
        body: z.object({
          grant_type: z.literal(utils.constants.BOT_GRANT_TYPE),
          provider: z.enum(utils.constants.CHANNEL_PLATFORMS),
          external_id: z.string().min(1),
          channel_id: z.string().min(1),
          audience: z.string().min(1),
          scope: z.string().optional(),
          client_id: z.string().optional(),
          client_secret: z.string().optional()
        })
      },
      async ctx => {
        const client = await authenticateBotClient(
          ctx as never,
          trustedBotClientId,
          ctx.body.client_id,
          ctx.body.client_secret
        );

        const identity = (await ctx.context.adapter.findOne({
          model: 'externalIdentity',
          where: [
            { field: 'channelId', value: ctx.body.channel_id },
            { field: 'provider', value: ctx.body.provider },
            { field: 'externalId', value: ctx.body.external_id }
          ]
        })) as ExternalIdentityRow | null;

        if (!identity) {
          throw new APIError('NOT_FOUND', {
            error: 'external_identity_not_linked'
          });
        }

        const scope = ctx.body.scope ?? utils.constants.MCP_SCOPE_READ;
        const ttl = utils.constants.BOT_ACCESS_TOKEN_TTL_SECONDS;
        const now = Math.floor(Date.now() / 1000);

        const token = await signJWT(ctx, {
          payload: {
            sub: identity.userId,
            aud: ctx.body.audience,
            scope,
            client_id: client.clientId,
            external_provider: ctx.body.provider,
            external_id: ctx.body.external_id,
            iat: now,
            exp: now + ttl
          }
        });

        return ctx.json({
          access_token: token,
          token_type: 'Bearer',
          expires_in: ttl,
          scope
        });
      }
    )
  },
  // Registers the `external_identity` table with better-auth's adapter so the
  // endpoints above can read/write it. The table itself is owned by the Drizzle
  // schema + migrations — these field defs only map the model for the adapter.
  schema: {
    externalIdentity: {
      modelName: 'externalIdentity',
      fields: {
        userId: {
          type: 'string',
          references: {
            model: 'user',
            field: 'id',
            onDelete: 'cascade'
          },
          index: true
        },
        channelId: {
          type: 'string',
          references: {
            model: 'channel',
            field: 'id',
            onDelete: 'cascade'
          },
          index: true
        },
        provider: { type: 'string' },
        externalId: { type: 'string' },
        displayName: {
          type: 'string',
          required: false
        },
        linkedAt: { type: 'date' },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' }
      }
    }
  }
});

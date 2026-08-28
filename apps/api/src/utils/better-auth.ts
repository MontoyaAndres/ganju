import { Context } from 'hono';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins/jwt';
import { oauthProvider } from '@better-auth/oauth-provider';
import { v7 as uuid } from 'uuid';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

import { ganjuAuthPlugin } from './ganju-auth-plugin';
import { consentActorFromRequest, recordConsent } from './consent';

// types
import type { AppEnv } from '../types';

export const createAuth = (
  c: Context,
  // An MCP resource indicator already checked against our own MCP origin — see
  // `requestedMcpAudience`. Admitted as a valid token audience for this request.
  mcpAudience?: string | null
) => {
  const dbInstance = db.create(c);
  const isProduction = utils.getEnv(c, 'NODE_ENV') === 'production';
  const domain = utils.getEnv(c, 'NEXT_PUBLIC_DOMAIN');
  const apiUrl = utils.getEnv(c, 'NEXT_PUBLIC_API_URL')!;
  const webUrl = utils.getEnv(c, 'NEXT_PUBLIC_WEB_URL')!;

  return betterAuth({
    appName: 'ganju',
    database: drizzleAdapter(dbInstance, {
      provider: 'pg',
      schema: db.schema
    }),
    baseURL: apiUrl,
    basePath: '/auth',
    secret: utils.getEnv(c, 'JWT_SECRET')!,
    socialProviders: {
      google: {
        clientId: utils.getEnv(c, 'GOOGLE_CLIENT_ID')!,
        clientSecret: utils.getEnv(c, 'GOOGLE_CLIENT_SECRET')!
      },
      github: {
        clientId: utils.getEnv(c, 'GITHUB_CLIENT_ID')!,
        clientSecret: utils.getEnv(c, 'GITHUB_CLIENT_SECRET')!
      }
    },
    trustedOrigins: [webUrl, apiUrl],
    account: {
      storeStateStrategy: 'database',
      skipStateCookieCheck: true
    },
    advanced: {
      crossSubDomainCookies: domain
        ? { enabled: true, domain: `.${domain}` }
        : { enabled: false },
      database: {
        generateId: () => uuid()
      },
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for']
      },
      useSecureCookies: isProduction
    },
    databaseHooks: {
      user: {
        create: {
          // Capture the acceptance the moment the account exists, with the IP
          // and user agent of the request that created it. Decreto 1377 art. 5
          // requires proof the authorization was given, and sign-in is the only
          // point where the user is shown the documents.
          after: async newUser => {
            try {
              await recordConsent(
                dbInstance,
                newUser.id,
                utils.constants.CONSENT_SOURCE_SIGNUP,
                consentActorFromRequest(c as Context<AppEnv>)
              );
            } catch (error) {
              console.error('failed to record signup consent', error);
            }
          }
        }
      }
    },
    plugins: [
      jwt({
        jwt: {
          issuer: apiUrl,
          expirationTime: '1h'
        }
      }),
      oauthProvider({
        loginPage: `${webUrl}/login`,
        // The plugin redirects here with the signed authorization query; the
        // page posts it back to `/auth/oauth2/consent`. It lives on the API
        // origin so that post is same-origin and carries the session cookie.
        consentPage: `${apiUrl}/oauth/consent`,
        allowDynamicClientRegistration: true,
        // MCP clients register themselves (RFC 7591) before any user has signed
        // in, so registration has to stay open — the new plugin defaults it
        // closed. The upstream option is expected to go away once MCP settles
        // on Client ID Metadata Documents or signed software statements.
        allowUnauthenticatedClientRegistration: true,
        // The scopes a client is allowed to ask for. The plugin's default is the
        // four standard OIDC ones, and a scope missing from this list is refused
        // with `invalid_scope` — so `ganju:manage` has to be named here for the
        // CLI to request it at all.
        //
        // Allowlisted is not the same as advertised. Discovery is written by
        // WellKnownController from OAUTH_SCOPES_SUPPORTED, which does not carry
        // this one, so an MCP client reading that document asks for the standard
        // four and gets a token the control plane will not accept.
        scopes: [
          ...utils.constants.OAUTH_SCOPES_SUPPORTED,
          utils.constants.CONTROL_PLANE_SCOPE
        ],
        // The granted scopes, echoed back to whoever holds the token. Both
        // bearer-token middlewares — the control plane's and the MCP server's —
        // introspect through `/oauth2/userinfo`, and what a token is allowed to
        // do cannot be checked from a response that only says whose it is.
        // (Nothing is disclosed here that the holder did not itself request.)
        customUserInfoClaims: ({ scopes }: { scopes: string[] }) => ({
          scope: scopes.join(' ')
        }),
        // Audiences a token may be minted for. The plugin's default is the
        // base URL alone, which rejects the per-artifact MCP resource an MCP
        // client asks for; `mcpAudience` is that resource, already verified to
        // be one of ours.
        validAudiences: [
          apiUrl,
          `${apiUrl}/auth`,
          ...(mcpAudience ? [mcpAudience] : [])
        ],
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 60 * 60 * 24 * 30,
        // Discovery is served from the origin root by WellKnownController with
        // a self-consistent issuer, because strict MCP clients reject the
        // basePath-relative document the plugin would have us publish.
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true
        }
      }),
      ganjuAuthPlugin(utils.getEnv(c, 'BOT_OAUTH_CLIENT_ID'))
    ]
  });
};

export type Auth = ReturnType<typeof createAuth>;

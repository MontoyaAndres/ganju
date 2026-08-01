import { Context } from 'hono';
import { utils } from '@ganju/utils';

import type { AppEnv } from '../../types';

// OAuth 2.0 Authorization Server Metadata (RFC 8414), also serving as a
// compatible subset of OpenID Connect Discovery.
//
// The real OAuth endpoints are served by the @better-auth/oauth-provider plugin
// under `/auth/oauth2/*`. better-auth only exposes its discovery document at
// `/auth/.well-known/openid-configuration`, whose declared `issuer` is the
// API root — a mismatch that strict MCP clients reject. This handler advertises
// the same endpoints at the origin root with a self-consistent `issuer`, which
// is the location MCP clients (Claude Code, MCP Inspector) probe.
const authorizationServerMetadata = (c: Context<AppEnv>) => {
  const apiUrl = utils.getEnv(c, 'NEXT_PUBLIC_API_URL')!;

  return c.json({
    issuer: apiUrl,
    authorization_endpoint: `${apiUrl}/auth/oauth2/authorize`,
    token_endpoint: `${apiUrl}/auth/oauth2/token`,
    userinfo_endpoint: `${apiUrl}/auth/oauth2/userinfo`,
    registration_endpoint: `${apiUrl}/auth/oauth2/register`,
    jwks_uri: `${apiUrl}/auth/jwks`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256', 'EdDSA'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'none'
    ],
    scopes_supported: utils.constants.OAUTH_SCOPES_SUPPORTED
  });
};

export const WellKnownController = {
  authorizationServerMetadata
};

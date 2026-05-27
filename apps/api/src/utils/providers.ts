import { utils } from '@anju/utils';

export interface OAuthProviderConfig {
  authUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  defaultScopes: string[];
  // Slack distinguishes the bot scope bucket (`scope=`) from the user scope
  // bucket (`user_scope=`). Default is 'scope'; the slack-user provider sets
  // this to 'user_scope' so its scopes are requested in the user bucket.
  scopeParam?: 'scope' | 'user_scope';
  // For providers (Slack user flow) whose token-exchange response carries
  // the credential under `authed_user` instead of at top level. Default is
  // 'top'.
  tokenSource?: 'top' | 'authed_user';
  // Slack's oauth.v2.access endpoint returns `internal_error` when the
  // standard OAuth2 `grant_type=authorization_code` body param is included
  // on the code-exchange call. Set true to omit it. Refresh-token requests
  // still send `grant_type=refresh_token` (Slack does document that one).
  omitGrantType?: boolean;
}

export const providers: Record<string, OAuthProviderConfig> = {
  [utils.constants.OAUTH_PROVIDER_GOOGLE_GMAIL]: {
    authUrl: utils.constants.GOOGLE_OAUTH_AUTH_URL,
    tokenUrl: utils.constants.GOOGLE_OAUTH_TOKEN_URL,
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    defaultScopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.labels'
    ]
  },
  [utils.constants.OAUTH_PROVIDER_GOOGLE_DRIVE]: {
    authUrl: utils.constants.GOOGLE_OAUTH_AUTH_URL,
    tokenUrl: utils.constants.GOOGLE_OAUTH_TOKEN_URL,
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    defaultScopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ]
  },
  [utils.constants.OAUTH_PROVIDER_MICROSOFT_OUTLOOK]: {
    authUrl: utils.constants.MICROSOFT_OAUTH_AUTH_URL,
    tokenUrl: utils.constants.MICROSOFT_OAUTH_TOKEN_URL,
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_CLIENT_SECRET',
    defaultScopes: [
      'https://graph.microsoft.com/Mail.ReadWrite',
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/User.Read',
      'offline_access'
    ]
  },
  [utils.constants.OAUTH_PROVIDER_ONE_DRIVE]: {
    authUrl: utils.constants.MICROSOFT_OAUTH_AUTH_URL,
    tokenUrl: utils.constants.MICROSOFT_OAUTH_TOKEN_URL,
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_CLIENT_SECRET',
    defaultScopes: [
      'https://graph.microsoft.com/Files.Read',
      'https://graph.microsoft.com/Files.Read.All',
      'offline_access'
    ]
  },
  [utils.constants.OAUTH_PROVIDER_SLACK]: {
    authUrl: utils.constants.SLACK_OAUTH_AUTH_URL,
    tokenUrl: utils.constants.SLACK_OAUTH_TOKEN_URL,
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET',
    defaultScopes: [
      'chat:write',
      'channels:read',
      'groups:read',
      'mpim:read',
      'im:read',
      'users:read',
      'users:read.email',
      'files:write'
    ],
    omitGrantType: true
  },
  [utils.constants.OAUTH_PROVIDER_SLACK_USER]: {
    authUrl: utils.constants.SLACK_OAUTH_AUTH_URL,
    tokenUrl: utils.constants.SLACK_OAUTH_TOKEN_URL,
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET',
    // search.messages is the only Slack endpoint that needs a user (xoxp)
    // token. Kept as its own provider so the OAuth flow stays generic —
    // scopes are requested in the user_scope bucket, and the access_token
    // is read from authed_user on callback.
    defaultScopes: ['search:read'],
    scopeParam: 'user_scope',
    tokenSource: 'authed_user',
    omitGrantType: true
  }
};

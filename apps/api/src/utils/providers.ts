import { utils } from '@anju/utils';

export interface OAuthProviderConfig {
  authUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  defaultScopes: string[];
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
    defaultScopes: ['chat:write', 'channels:read']
  }
};

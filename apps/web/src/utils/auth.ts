import { createAuthClient } from 'better-auth/react';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL!,
  basePath: '/auth',
  fetchOptions: {
    credentials: 'include'
  },
  // On `/login`, the OAuth provider puts the signed authorization query in the
  // page URL. This forwards it on sign-in so the provider can pick the flow
  // back up and redirect to the client — without it, sign-in succeeds and the
  // waiting client never gets its callback.
  plugins: [oauthProviderClient()]
});

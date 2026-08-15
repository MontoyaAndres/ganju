import { utils } from '@ganju/utils';
import type { OAuthProviderConfig } from '@ganju/utils';

// The managed OAuth app table moved to @ganju/utils when apps/tool-broker began
// minting connection tokens for custom-code scripts — it needs the same client
// env names and token URLs, and two copies would drift the first time a provider
// is added. Re-exported here so every existing `./providers` import still works.
export const providers = utils.oauthProviders;

export type { OAuthProviderConfig };

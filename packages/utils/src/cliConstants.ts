// The handful of constants that get bundled into the published `ganju` CLI,
// split out of the main constants module for exactly that reason.
//
// The same problem `sdkConstants.ts` solves, with a sharper edge. `constants.ts`
// is one large object literal, so a bundler cannot drop the keys a consumer
// doesn't touch — and the CLI ships to npm, where those keys would be plan
// limits, pricing, vendor scopes and internal URLs sitting readable inside a
// public package. Eight values live here instead, and the main module
// re-exports them so there is still one definition of each.
//
// The rule for this file: nothing lands here unless the CLI reads it, and it
// imports nothing.

// How `ganju login` identifies itself, and where it listens for the redirect.
//
// A fixed port would fail whenever something else already held it, so the CLI
// binds the first one here that is free. All of them are registered up front
// rather than only the one that gets used: the provider does implement RFC 8252
// loopback matching, where the port is ignored for a 127.0.0.0/8 redirect, but
// that is one library's behaviour and this is a login that has already opened
// someone's browser by the time it would fail.
export const CLI_OAUTH_CLIENT_NAME = 'Ganju CLI';
export const CLI_OAUTH_REDIRECT_PATH = '/callback';
export const CLI_OAUTH_REDIRECT_PORTS = [8976, 8977, 8978, 8979, 8980];

// What the API requires before a bearer token may act on the control plane —
// publish code, read and rotate secrets, change billing. Lives here because the
// CLI is the client that asks for it; the API's own copy is the re-export in
// `constants.ts`, so the string the CLI requests and the string the middleware
// demands cannot drift apart.
export const CONTROL_PLANE_SCOPE = 'ganju:manage';

// `offline_access` is what mints the refresh token; without it a CLI session
// would end an hour after login.
//
// An MCP client reads the discovery document to decide what to ask for, and
// that document does not list `ganju:manage` — so a token minted for someone's
// MCP server can reach that server and nothing else, while this one can deploy.
// The consent screen names the scope, which is the point: deploying code as
// someone is worth showing them.
export const CLI_OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  CONTROL_PLANE_SCOPE
];

// Refresh this far before the access token actually expires, so a long command
// can't have its token die mid-request.
export const CLI_TOKEN_REFRESH_SKEW_SECONDS = 60;

// What `ganju build` rewrites the SDK import to. The deployed script imports the
// sibling module the publish pipeline attaches, whatever the author typed.
export const CUSTOM_CODE_SDK_SPECIFIER = './ganju-sdk.js';

// Set well below Cloudflare's own script-size ceiling so a rejection happens
// with a legible error rather than at deploy time.
export const CUSTOM_CODE_MAX_BUNDLE_BYTES = 3 * 1024 * 1024;

// The provider `ganju secret` writes under. custom-code secrets are the
// `ctx.secret(name)` values a user script reads at runtime, addressed by the
// label in each row's metadata.
export const CREDENTIAL_PROVIDER_CUSTOM_CODE = 'custom-code' as 'custom-code';

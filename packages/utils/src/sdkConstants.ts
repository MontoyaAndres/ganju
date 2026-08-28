// The handful of constants that get bundled into every customer's deployed
// script, split out from the main constants module for exactly that reason.
//
// `@ganju/utils/constants` is one large object literal, so a bundler cannot drop
// the keys a consumer doesn't touch — importing it from the SDK pulled ~70KB of
// plan limits, MIME tables and vendor scopes into every uploaded Worker to reach
// fourteen strings. These live here instead, and the main module re-exports them
// so there is still one definition of each.
//
// The rule for this file: nothing lands here unless the SDK reads it at runtime,
// and it imports nothing.

// Bindings injected into every user script at upload time. The token is a
// secret_text binding rotated on each publish; the broker is a service binding.
// Names are part of the SDK's contract with the script, so they can't be
// renamed without breaking already-deployed code.
export const CUSTOM_CODE_BINDING_TOKEN = 'GANJU_TOOL_TOKEN';
export const CUSTOM_CODE_BINDING_BROKER = 'GANJU_BROKER';

// Broker routes, called by user code through the service binding above with
// `Authorization: Bearer <GANJU_TOOL_TOKEN>`. The origin is arbitrary — a
// service binding ignores the hostname.
export const CUSTOM_CODE_BROKER_ORIGIN = 'https://broker.ganju.internal';
export const CUSTOM_CODE_BROKER_PATH_CONNECTION = '/connection';
export const CUSTOM_CODE_BROKER_PATH_SECRET = '/secret';
export const CUSTOM_CODE_BROKER_PATH_RESOURCES_SEARCH = '/resources/search';
export const CUSTOM_CODE_BROKER_PATH_RESOURCES_READ = '/resources/read';
export const CUSTOM_CODE_BROKER_PATH_RESOURCES_LIST = '/resources/list';
export const CUSTOM_CODE_BROKER_PATH_RESOURCES_CREATE = '/resources/create';
export const CUSTOM_CODE_BROKER_PATH_RESOURCES_DELETE = '/resources/delete';
export const CUSTOM_CODE_BROKER_PATH_SEND_FILE = '/send-file';

// Injected at upload time and echoed back by the health probe below. Uploading a
// script into the dispatch namespace is not read-your-writes: dispatching to the
// name immediately afterwards can still reach the previous edition. Tool names
// alone cannot tell the two apart when a deploy does not rename anything, so the
// script carries the digest of the bytes it was uploaded from and the publish
// pipeline waits until the edition answering is the one it just wrote.
//
// The bytes rather than the version id: a draft is re-uploaded in place, so its
// id is the same string across every edit and could never separate this upload
// from the one before it.
export const CUSTOM_CODE_BINDING_VERSION = 'GANJU_SCRIPT_VERSION';

// The reserved tool name the publish pipeline calls against a freshly uploaded
// script to ask which tools it actually exports — which is what turns "the
// manifest declares lookup-order but the code exports lookupOrder" from a
// call-time mystery into a publish-time error. Underscore-prefixed so it can
// never collide with a declared name.
export const CUSTOM_CODE_HEALTH_TOOL = '__ganju_health';

// How many ctx.log() lines travel back with a result. Logs are buffered inside
// the isolate and returned in the response rather than sent to the broker line
// by line — a log call shouldn't cost a network round trip.
export const CUSTOM_CODE_MAX_LOGS = 50;
export const CUSTOM_CODE_MAX_LOG_LENGTH = 2_000;

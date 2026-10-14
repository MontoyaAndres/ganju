// When an organization turns on "confirm sensitive actions", a channel bot that
// wants to run a sensitive tool asks first, and the call runs only if the
// participant's next message is a plain yes. These are the pieces of that rule
// that aren't the runner's own bookkeeping.

// A call waiting on the participant's answer, stored on the conversation. The
// exact calls the model made are kept, so what runs after a yes is what the
// question described — the model never gets to re-derive the arguments.
export interface PendingToolConfirmation {
  // Claimed by id, so a re-sent batch can't run the same calls twice.
  id: string;
  // Only the participant who was asked can answer — in a group, anyone else's
  // message leaves the question open.
  participantId: string;
  createdAt: string;
  calls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

// What a conversation holds: one open question per participant, keyed by
// participant id, so in a group one person's question never replaces
// another's.
export type PendingToolConfirmations = Record<string, PendingToolConfirmation>;

// What an owner says a tool they wrote does, in the words the dashboard asks
// it in, and the MCP annotations each answer stands for: `read` only looks
// things up, `write` changes things that can be undone, `sensitive` sends,
// deletes, charges or can't be undone — the kind a confirming channel asks
// about.
export const TOOL_EFFECTS = ['read', 'write', 'sensitive'] as const;

export type ToolEffect = (typeof TOOL_EFFECTS)[number];

export const annotationsForEffect = (
  effect: ToolEffect
): { readOnlyHint: boolean; destructiveHint: boolean } =>
  effect === 'read'
    ? { readOnlyHint: true, destructiveHint: false }
    : effect === 'write'
      ? { readOnlyHint: false, destructiveHint: false }
      : { readOnlyHint: false, destructiveHint: true };

// Whole replies that mean yes, lowercased with accents and punctuation
// removed. English, Spanish and Portuguese, the languages bots here answer in.
const AFFIRMATIVE = new Set([
  'y',
  'yes',
  'yeah',
  'yep',
  'yup',
  'sure',
  'ok',
  'okay',
  'confirm',
  'confirmed',
  'approve',
  'approved',
  'go',
  'go ahead',
  'do it',
  'send',
  'send it',
  'proceed',
  'yes please',
  'yes send it',
  'yes do it',
  'yes go ahead',
  'yes confirm',
  'sure thing',
  'go for it',
  'sounds good',
  'looks good',
  'all good',
  'correct',
  'si hazlo',
  'si adelante',
  'si envialo ya',
  'perfecto',
  'correcto',
  'esta bien',
  'ok dale',
  'ok envialo',
  'si',
  'sip',
  'claro',
  'dale',
  'va',
  'vale',
  'listo',
  'confirmo',
  'confirmado',
  'confirmar',
  'adelante',
  'hazlo',
  'envialo',
  'enviar',
  'de acuerdo',
  'si por favor',
  'si claro',
  'si dale',
  'si envialo',
  'si confirmo',
  'sim',
  'pode',
  'pode enviar'
]);

const AFFIRMATIVE_EMOJI = new Set(['👍', '✅', '👌', '🆗']);

// The Yes/No buttons offered under a confirmation question, in the
// participant's language when the platform reports it. The labels are also
// what a tap sends where a button is just a canned reply (Telegram's reply
// keyboard), so "yes" must read as a yes to isConfirmationReply — and it does,
// in every language here.
const BUTTON_LABELS: Record<string, { yes: string; no: string }> = {
  en: { yes: '✅ Yes', no: '❌ No' },
  es: { yes: '✅ Sí', no: '❌ No' },
  pt: { yes: '✅ Sim', no: '❌ Não' }
};

// WhatsApp reports no locale, so a button's language comes from the calling
// code of the participant's number: the Spanish- and Portuguese-speaking
// countries, English otherwise. Longest prefix wins.
const CALLING_CODE_LANGUAGE: Record<string, string> = {
  '34': 'es',
  '51': 'es',
  '52': 'es',
  '53': 'es',
  '54': 'es',
  '56': 'es',
  '57': 'es',
  '58': 'es',
  '240': 'es',
  '502': 'es',
  '503': 'es',
  '504': 'es',
  '505': 'es',
  '506': 'es',
  '507': 'es',
  '591': 'es',
  '593': 'es',
  '595': 'es',
  '598': 'es',
  '1787': 'es',
  '1809': 'es',
  '1829': 'es',
  '1849': 'es',
  '55': 'pt',
  '238': 'pt',
  '244': 'pt',
  '245': 'pt',
  '258': 'pt',
  '351': 'pt'
};

export const languageFromPhoneNumber = (phone: string): string | null => {
  const digits = phone.replace(/\D/g, '');
  for (let length = 4; length >= 2; length--) {
    const language = CALLING_CODE_LANGUAGE[digits.slice(0, length)];
    if (language) return language;
  }
  return null;
};

export const confirmationButtonLabels = (
  locale?: string | null
): { yes: string; no: string } => {
  const language = (locale || '').toLowerCase().split(/[-_]/)[0];
  return BUTTON_LABELS[language] ?? BUTTON_LABELS.en;
};

// Where the platform sends back a button's id rather than its label (Discord,
// WhatsApp), the id says which answer it is and who was asked: in a shared
// channel everyone sees the buttons, and only that participant's tap counts.
// The runner never sees the id — a tap reaches it as the text "yes" or "no".
const CONFIRMATION_BUTTON_PREFIX = 'ganju-confirm';

export const confirmationButtonId = (
  answer: 'yes' | 'no',
  externalParticipantId: string
): string => `${CONFIRMATION_BUTTON_PREFIX}:${answer}:${externalParticipantId}`;

export const parseConfirmationButton = (
  id: string
): { text: 'yes' | 'no'; externalParticipantId: string } | null => {
  const [prefix, answer, ...rest] = id.split(':');
  const externalParticipantId = rest.join(':');
  if (prefix !== CONFIRMATION_BUTTON_PREFIX || !externalParticipantId) {
    return null;
  }
  if (answer !== 'yes' && answer !== 'no') return null;
  return { text: answer, externalParticipantId };
};

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Whether a reply confirms the pending action. Deliberately narrow: the whole
 * message has to be a yes. "Yes, but send it to Ana instead" is not one — it
 * asks for a different action, and running the original would do exactly
 * what the person just said not to. Anything that isn't a clear yes cancels,
 * so the worst a misread costs is asking again.
 */
export const isConfirmationReply = (text: string): boolean => {
  const trimmed = text.trim();
  if (AFFIRMATIVE_EMOJI.has(trimmed)) return true;
  return AFFIRMATIVE.has(normalize(trimmed));
};

// How much of each argument the summary shows, and how many arguments.
const SUMMARY_VALUE_MAX = 200;
const SUMMARY_ARGUMENTS_MAX = 10;

const summaryValue = (value: unknown): string => {
  const text =
    typeof value === 'string'
      ? value
      : (JSON.stringify(value) ?? String(value));
  // One line, and no backticks, so a value can neither fake another line of
  // the summary nor break out of its code span into formatting or links.
  const flat = text.replace(/\s+/g, ' ').replace(/`/g, "'").trim();
  return flat.length > SUMMARY_VALUE_MAX
    ? `${flat.slice(0, SUMMARY_VALUE_MAX)}…`
    : flat;
};

/**
 * What the held calls will do, written from the calls themselves and appended
 * under the model's question. The model words the question, but a yes runs the
 * stored calls — so the participant has to see those, not only the model's
 * account of them, which a prompt injection earlier in the turn could have
 * bent.
 */
export const formatConfirmationSummary = (
  calls: Array<{ name: string; arguments: Record<string, unknown> }>,
  titleOf: (name: string) => string
): string =>
  calls
    .map(call => {
      const entries = Object.entries(call.arguments ?? {}).filter(
        ([, value]) => value !== undefined && value !== null && value !== ''
      );
      const lines = entries
        .slice(0, SUMMARY_ARGUMENTS_MAX)
        .map(([key, value]) => `- ${key}: \`${summaryValue(value)}\``);
      if (entries.length > SUMMARY_ARGUMENTS_MAX) lines.push('- …');
      // The hourglass says "not done yet" in every language, whatever the
      // model's own words above it claim.
      return [`⏳ **${titleOf(call.name)}**`, ...lines].join('\n');
    })
    .join('\n\n');

/**
 * Whether a tool needs a yes before it runs, by the MCP defaults: read-only
 * only if it says so, and a tool that changes things is destructive unless it
 * says it isn't. So an unannotated custom or proxied tool is confirmed — the
 * safe reading for an organization that asked to be asked.
 */
export const isSensitiveTool = (
  annotations:
    | { readOnlyHint?: boolean; destructiveHint?: boolean }
    | null
    | undefined
): boolean =>
  annotations?.readOnlyHint !== true && annotations?.destructiveHint !== false;

// How far a proxied tool's own hints are believed, from its install's config:
// the remote's read-only / destructive hints only when the owner chose to
// trust that server, and the owner's own "only reads" mark on a tool always.
export interface ProxiedToolTrust {
  trustHints: boolean;
  readOnly: boolean;
}

export const proxiedToolTrust = (
  config:
    | { trustAnnotations?: unknown; readOnlyTools?: unknown }
    | null
    | undefined,
  remoteToolName: string
): ProxiedToolTrust => ({
  trustHints: config?.trustAnnotations === true,
  readOnly:
    Array.isArray(config?.readOnlyTools) &&
    config.readOnlyTools.includes(remoteToolName)
});

/**
 * The annotations a proxied tool is registered with. A remote server's hints
 * are its own claim about itself, and one that marks a delete read-only would
 * skip every confirmation — so unless the organization chose to trust that
 * server, the read-only and destructive hints are dropped and the tool reads
 * as sensitive by the defaults above. A tool the owner marked as only reading
 * is read-only whatever the remote says, trusted or not. Clients see the
 * same, so they ask about the same tools. The harmless parts (title,
 * openWorldHint, idempotentHint) pass through.
 */
export const proxiedToolAnnotations = <
  T extends { readOnlyHint?: boolean; destructiveHint?: boolean }
>(
  annotations: T | null | undefined,
  trust: ProxiedToolTrust
): Partial<T> | undefined => {
  const result = { ...annotations } as Partial<T>;
  if (trust.readOnly) {
    delete result.destructiveHint;
    return { ...result, readOnlyHint: true };
  }
  if (!trust.trustHints) {
    delete result.readOnlyHint;
    delete result.destructiveHint;
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

// The install-config keys that hold the owner's trust marks above.
const PROXIED_TOOL_MARK_KEYS = ['trustAnnotations', 'readOnlyTools'] as const;

/**
 * An install's new config with the owner's trust marks carried over from the
 * stored one wherever the new one doesn't say. A save that only knew about
 * the allow-lists (an older dashboard, a script) must not quietly turn the
 * marks off; one that sends them, even as false or empty, decides.
 */
export const keepProxiedToolMarks = (
  stored: unknown,
  incoming: unknown
): unknown => {
  if (
    !stored ||
    typeof stored !== 'object' ||
    !incoming ||
    typeof incoming !== 'object'
  ) {
    return incoming;
  }
  const merged = { ...(incoming as Record<string, unknown>) };
  for (const key of PROXIED_TOOL_MARK_KEYS) {
    if (merged[key] === undefined && key in stored) {
      merged[key] = (stored as Record<string, unknown>)[key];
    }
  }
  return merged;
};

/** Whether a proxied tool is confirmed, decided as its registration is. */
export const isSensitiveProxiedTool = (
  annotations:
    | { readOnlyHint?: boolean; destructiveHint?: boolean }
    | null
    | undefined,
  trust: ProxiedToolTrust
): boolean => isSensitiveTool(proxiedToolAnnotations(annotations, trust));

// JSON with keys sorted at every depth, so two argument objects that say the
// same thing serialize the same whatever order the model emitted them in.
export const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        key =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

export type ToolApprovalStatus =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'used'
  | 'expired';

/**
 * Where an approval stands. Spent and refused come first, since an answer
 * stays the answer after the window closes; past its time, one never answered
 * or never used can no longer be.
 */
export const toolApprovalStatus = (
  approval: {
    expiresAt: Date;
    approvedAt: Date | null;
    deniedAt: Date | null;
    usedAt: Date | null;
  },
  now: number = Date.now()
): ToolApprovalStatus => {
  if (approval.usedAt) return 'used';
  if (approval.deniedAt) return 'denied';
  if (approval.expiresAt.getTime() <= now) return 'expired';
  return approval.approvedAt ? 'approved' : 'pending';
};

/** The dashboard page where the user answers one approval. */
export const toolApprovalUrl = (
  webUrl: string,
  path: string,
  approvalId: string
): string =>
  `${webUrl.replace(/\/+$/, '')}${path}/${encodeURIComponent(approvalId)}`;

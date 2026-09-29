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

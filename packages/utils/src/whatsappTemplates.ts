// WhatsApp message templates: the shape Meta's Graph API takes and returns,
// and the rules it rejects templates for most often, checked before one is
// sent for review. Imports nothing, so the dashboard runs the same checks.

export const WHATSAPP_TEMPLATE_CATEGORIES = ['UTILITY', 'MARKETING'] as const;
export type WhatsappTemplateCategory =
  (typeof WHATSAPP_TEMPLATE_CATEGORIES)[number];

// What Meta reports. Only APPROVED templates can be sent.
export const WHATSAPP_TEMPLATE_STATUS_APPROVED = 'APPROVED';
// Still in Meta's hands: the hourly sync looks at these again.
export const WHATSAPP_TEMPLATE_STATUSES_WAITING = [
  'PENDING',
  'IN_APPEAL',
  'PENDING_DELETION'
];
// An approved template Meta stopped: its owners are told.
export const WHATSAPP_TEMPLATE_STATUSES_STOPPED = ['PAUSED', 'DISABLED'];

export const WHATSAPP_TEMPLATE_NAME_MAX = 512;
export const WHATSAPP_TEMPLATE_BODY_MAX = 1024;
export const WHATSAPP_TEMPLATE_HEADER_MAX = 60;
export const WHATSAPP_TEMPLATE_FOOTER_MAX = 60;
export const WHATSAPP_TEMPLATE_BUTTON_MAX = 25;
export const WHATSAPP_TEMPLATE_BUTTONS_MAX = 10;
export const WHATSAPP_TEMPLATE_VARIABLES_MAX = 20;
export const WHATSAPP_TEMPLATE_LABEL_MAX = 40;
export const WHATSAPP_TEMPLATE_EXAMPLE_MAX = 200;
const NAME_PATTERN = /^[a-z0-9_]+$/;

// Meta's template languages. The first ones are the ones most owners use.
export const WHATSAPP_TEMPLATE_LANGUAGES: { code: string; name: string }[] = [
  { code: 'es', name: 'Spanish' },
  { code: 'es_MX', name: 'Spanish (Mexico)' },
  { code: 'es_AR', name: 'Spanish (Argentina)' },
  { code: 'es_ES', name: 'Spanish (Spain)' },
  { code: 'en', name: 'English' },
  { code: 'en_US', name: 'English (US)' },
  { code: 'en_GB', name: 'English (UK)' },
  { code: 'pt_BR', name: 'Portuguese (Brazil)' },
  { code: 'pt_PT', name: 'Portuguese (Portugal)' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'sq', name: 'Albanian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'bn', name: 'Bengali' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'ca', name: 'Catalan' },
  { code: 'zh_CN', name: 'Chinese (China)' },
  { code: 'zh_HK', name: 'Chinese (Hong Kong)' },
  { code: 'zh_TW', name: 'Chinese (Taiwan)' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'et', name: 'Estonian' },
  { code: 'fil', name: 'Filipino' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'ka', name: 'Georgian' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'ha', name: 'Hausa' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ga', name: 'Irish' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'kn', name: 'Kannada' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'rw_RW', name: 'Kinyarwanda' },
  { code: 'ko', name: 'Korean' },
  { code: 'ky_KG', name: 'Kyrgyz' },
  { code: 'lo', name: 'Lao' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'ms', name: 'Malay' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mr', name: 'Marathi' },
  { code: 'nb', name: 'Norwegian' },
  { code: 'fa', name: 'Persian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'sw', name: 'Swahili' },
  { code: 'sv', name: 'Swedish' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'zu', name: 'Zulu' }
];

/** A template as the owner writes it. `examples[i]` and `labels[i]` are {{i+1}}'s. */
export interface WhatsappTemplateDraft {
  name: string;
  language: string;
  category: WhatsappTemplateCategory;
  header?: string | null;
  body: string;
  footer?: string | null;
  buttons?: string[];
  examples?: string[];
  labels?: string[];
}

/** A template's text, read back from Meta's components. */
export interface WhatsappTemplateContent {
  header: string | null;
  body: string;
  footer: string | null;
  buttons: string[];
  examples: string[];
}

export type WhatsappTemplateIssueCode =
  | 'name_format'
  | 'name_long'
  | 'language'
  | 'category'
  | 'body_empty'
  | 'body_long'
  | 'header_long'
  | 'header_variables'
  | 'header_lines'
  | 'footer_long'
  | 'footer_variables'
  | 'button_empty'
  | 'button_long'
  | 'button_variables'
  | 'buttons_many'
  | 'buttons_repeated'
  | 'variables_many'
  | 'variables_order'
  | 'variable_at_start'
  | 'variable_at_end'
  | 'variables_adjacent'
  | 'variables_dense'
  | 'example_missing';

export interface WhatsappTemplateIssue {
  code: WhatsappTemplateIssueCode;
  // The {{n}} it is about, when one is.
  n?: number;
}

const VARIABLE = /\{\{\s*(\d+)\s*\}\}/g;

/** Each {{n}} in the text, in the order they appear. */
export const whatsappTemplateVariables = (text: string): number[] =>
  Array.from(text.matchAll(VARIABLE), match => Number(match[1]));

/** How many variables the body has: its highest {{n}}. */
export const whatsappTemplateVariableCount = (body: string): number =>
  Math.max(0, ...whatsappTemplateVariables(body));

const words = (text: string) =>
  text
    .replace(VARIABLE, ' ')
    .split(/\s+/)
    .filter(word => /[\p{L}\p{N}]/u.test(word)).length;

/**
 * The rules Meta rejects templates for most often, checked before sending
 * one for review. Meta's review has the last word; this only catches the
 * common mistakes early.
 */
export const checkWhatsappTemplate = (
  draft: WhatsappTemplateDraft
): WhatsappTemplateIssue[] => {
  const issues: WhatsappTemplateIssue[] = [];
  const add = (code: WhatsappTemplateIssueCode, n?: number) =>
    issues.push(n === undefined ? { code } : { code, n });

  if (!NAME_PATTERN.test(draft.name)) add('name_format');
  if (draft.name.length > WHATSAPP_TEMPLATE_NAME_MAX) add('name_long');
  if (!WHATSAPP_TEMPLATE_LANGUAGES.some(l => l.code === draft.language)) {
    add('language');
  }
  if (!WHATSAPP_TEMPLATE_CATEGORIES.includes(draft.category)) add('category');

  const header = draft.header?.trim() ?? '';
  if (header.length > WHATSAPP_TEMPLATE_HEADER_MAX) add('header_long');
  if (whatsappTemplateVariables(header).length > 0) add('header_variables');
  if (/[\n\r]/.test(header)) add('header_lines');
  const footer = draft.footer?.trim() ?? '';
  if (footer.length > WHATSAPP_TEMPLATE_FOOTER_MAX) add('footer_long');
  if (whatsappTemplateVariables(footer).length > 0) add('footer_variables');

  const buttons = draft.buttons ?? [];
  if (buttons.length > WHATSAPP_TEMPLATE_BUTTONS_MAX) add('buttons_many');
  if (buttons.some(button => !button.trim())) add('button_empty');
  if (
    buttons.some(button => button.trim().length > WHATSAPP_TEMPLATE_BUTTON_MAX)
  ) {
    add('button_long');
  }
  if (buttons.some(button => whatsappTemplateVariables(button).length > 0)) {
    add('button_variables');
  }
  const unique = new Set(buttons.map(button => button.trim().toLowerCase()));
  if (unique.size < buttons.length) add('buttons_repeated');

  const body = draft.body.trim();
  if (!body) {
    add('body_empty');
    return issues;
  }
  if (body.length > WHATSAPP_TEMPLATE_BODY_MAX) add('body_long');

  const found = whatsappTemplateVariables(body);
  if (found.length === 0) return issues;
  const count = Math.max(...found);
  if (count > WHATSAPP_TEMPLATE_VARIABLES_MAX) add('variables_many');
  // {{1}}, {{2}}, … with no gaps, each first used after the one before.
  const firsts = [...new Set(found)];
  if (firsts.some((n, i) => n !== i + 1)) add('variables_order');
  if (/^\{\{\s*\d+\s*\}\}/.test(body)) add('variable_at_start');
  if (/\{\{\s*\d+\s*\}\}[\s.!?…]*$/.test(body)) add('variable_at_end');
  if (/\}\}\s*\{\{/.test(body)) add('variables_adjacent');
  // Meta wants more words than variables; this is about the ratio it accepts.
  if (words(body) < 2 * firsts.length + 1) add('variables_dense');
  const examples = draft.examples ?? [];
  for (let n = 1; n <= count; n++) {
    if (!examples[n - 1]?.trim()) add('example_missing', n);
  }
  return issues;
};

const ISSUE_TEXT: Record<WhatsappTemplateIssueCode, string> = {
  name_format: 'The name takes lowercase letters, digits and underscores only.',
  name_long: `The name is at most ${WHATSAPP_TEMPLATE_NAME_MAX} characters.`,
  language: "The language isn't one Meta supports.",
  category: 'The category is Utility or Marketing.',
  body_empty: 'The message needs a body.',
  body_long: `The body is at most ${WHATSAPP_TEMPLATE_BODY_MAX} characters.`,
  header_long: `The header is at most ${WHATSAPP_TEMPLATE_HEADER_MAX} characters.`,
  header_variables: "The header can't have variables.",
  header_lines: 'The header is one line.',
  footer_long: `The footer is at most ${WHATSAPP_TEMPLATE_FOOTER_MAX} characters.`,
  footer_variables: "The footer can't have variables.",
  button_empty: 'A quick reply needs a text.',
  button_long: `A quick reply is at most ${WHATSAPP_TEMPLATE_BUTTON_MAX} characters.`,
  button_variables: "A quick reply can't have variables.",
  buttons_many: `At most ${WHATSAPP_TEMPLATE_BUTTONS_MAX} quick replies.`,
  buttons_repeated: 'Two quick replies say the same.',
  variables_many: `At most ${WHATSAPP_TEMPLATE_VARIABLES_MAX} variables.`,
  variables_order:
    'Variables are numbered {{1}}, {{2}}, … in the order they first appear, with no gaps.',
  variable_at_start: 'Meta rejects a body that starts with a variable.',
  variable_at_end: 'Meta rejects a body that ends with a variable.',
  variables_adjacent:
    'Meta rejects two variables side by side; put words between them.',
  variables_dense:
    'Too many variables for the length of the text; add words or remove variables.',
  example_missing: 'Each variable needs an example value for Meta to review.'
};

export const whatsappTemplateIssueText = (issue: WhatsappTemplateIssue) =>
  issue.n === undefined
    ? ISSUE_TEXT[issue.code]
    : `{{${issue.n}}}: ${ISSUE_TEXT[issue.code]}`;

/** The components Meta's create and edit calls take. */
export const whatsappTemplateComponents = (
  draft: WhatsappTemplateDraft
): Record<string, unknown>[] => {
  const components: Record<string, unknown>[] = [];
  const header = draft.header?.trim();
  if (header) components.push({ type: 'HEADER', format: 'TEXT', text: header });
  const body = draft.body.trim();
  const count = whatsappTemplateVariableCount(body);
  components.push({
    type: 'BODY',
    text: body,
    ...(count > 0
      ? {
          example: {
            body_text: [
              Array.from({ length: count }, (_, i) =>
                (draft.examples?.[i] ?? '').trim()
              )
            ]
          }
        }
      : {})
  });
  const footer = draft.footer?.trim();
  if (footer) components.push({ type: 'FOOTER', text: footer });
  const buttons = (draft.buttons ?? []).map(b => b.trim()).filter(Boolean);
  if (buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map(text => ({ type: 'QUICK_REPLY', text }))
    });
  }
  return components;
};

/** A template's text, from the components Meta returns. */
export const whatsappTemplateContent = (
  components: unknown
): WhatsappTemplateContent => {
  const content: WhatsappTemplateContent = {
    header: null,
    body: '',
    footer: null,
    buttons: [],
    examples: []
  };
  if (!Array.isArray(components)) return content;
  for (const component of components as Record<string, unknown>[]) {
    const type = String(component?.type ?? '').toUpperCase();
    const text = typeof component?.text === 'string' ? component.text : null;
    if (type === 'HEADER' && component.format === 'TEXT') content.header = text;
    if (type === 'BODY') {
      content.body = text ?? '';
      const example = component.example as
        | { body_text?: unknown[][] }
        | undefined;
      const first = example?.body_text?.[0];
      if (Array.isArray(first)) content.examples = first.map(v => String(v));
    }
    if (type === 'FOOTER') content.footer = text;
    if (type === 'BUTTONS' && Array.isArray(component.buttons)) {
      content.buttons = (component.buttons as Record<string, unknown>[])
        .filter(b => b?.type === 'QUICK_REPLY' && typeof b.text === 'string')
        .map(b => b.text as string);
    }
  }
  return content;
};

/**
 * Whether Ganju can send it: it fills the body's variables only. A media
 * header, a header variable, or a button that takes a value (a URL with a
 * variable, a code, a flow) needs more, and Meta refuses the send.
 */
export const whatsappTemplateSendable = (components: unknown): boolean => {
  if (!Array.isArray(components)) return false;
  return (components as Record<string, unknown>[]).every(component => {
    const type = String(component?.type ?? '').toUpperCase();
    if (type === 'BODY' || type === 'FOOTER') return true;
    if (type === 'HEADER') {
      return (
        component.format === 'TEXT' &&
        whatsappTemplateVariables(String(component.text ?? '')).length === 0
      );
    }
    if (type === 'BUTTONS') {
      const buttons = Array.isArray(component.buttons)
        ? (component.buttons as Record<string, unknown>[])
        : [];
      return buttons.every(button => {
        const kind = String(button?.type ?? '').toUpperCase();
        if (kind === 'QUICK_REPLY' || kind === 'PHONE_NUMBER') return true;
        if (kind === 'URL') {
          return (
            whatsappTemplateVariables(String(button.url ?? '')).length === 0
          );
        }
        return false;
      });
    }
    return false;
  });
};

/** The body with each {{n}} replaced, for previews and the message record. */
export const fillWhatsappTemplate = (body: string, values: string[]): string =>
  body.replace(VARIABLE, (whole, n) => values[Number(n) - 1] ?? whole);

/**
 * A value for a {{n}} as Meta accepts it: no line breaks or tabs, no long
 * runs of spaces, and never empty.
 */
export const cleanWhatsappTemplateParam = (value: unknown): string => {
  const text = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, 1024);
  return text || '-';
};

// Meta's error codes for a message that didn't go out, in words an owner can
// act on. `retry`: the same message may go through later.
const SEND_ERRORS: Record<number, { text: string; retry?: true }> = {
  1: { text: 'WhatsApp had a temporary problem.', retry: true },
  2: { text: 'WhatsApp had a temporary problem.', retry: true },
  10: { text: "The channel's access token isn't allowed to send messages." },
  190: {
    text: "The channel's access token expired or was revoked; connect a new one in the channel's settings."
  },
  200: { text: "The channel's access token isn't allowed to send messages." },
  368: {
    text: 'Meta has temporarily blocked this WhatsApp Business account for policy violations.'
  },
  130429: {
    text: "The number's sending rate was reached; it will be tried again.",
    retry: true
  },
  131000: { text: 'WhatsApp had a temporary problem.', retry: true },
  131016: { text: 'WhatsApp is temporarily unavailable.', retry: true },
  131026: {
    text: "WhatsApp couldn't deliver it: the customer may have blocked the business, left WhatsApp, or not accepted its latest terms."
  },
  131031: { text: 'Meta locked this WhatsApp Business account.' },
  131042: {
    text: "Meta refused it over a payment problem on the WhatsApp Business account; check its payment method in Meta's Business settings."
  },
  131047: {
    text: "Outside WhatsApp's 24-hour window: the customer last wrote more than 24 hours ago, so only an approved template reaches them."
  },
  131048: {
    text: "Meta limited this number's sending because of its quality: too many customers blocked or reported its messages."
  },
  131049: {
    text: 'Meta chose not to deliver this marketing message, to limit how many each customer gets.'
  },
  131050: {
    text: 'The customer turned off marketing messages from this business.'
  },
  131056: {
    text: 'Too many messages to this customer in a short time; it will be tried again.',
    retry: true
  },
  132000: {
    text: "The number of values doesn't match the template's variables."
  },
  132001: {
    text: 'Meta has no approved template with that name in that language.'
  },
  132005: { text: "The template's text is too long with the values put in." },
  132007: { text: "The template's text breaks WhatsApp's commerce policy." },
  132012: { text: "A value doesn't match what the template expects." },
  132015: { text: 'Meta paused this template because of its quality.' },
  132016: { text: 'Meta disabled this template because of its quality.' },
  132018: { text: 'A value has line breaks, tabs or too many spaces.' }
};

/** A Meta send error as an owner reads it, and whether a retry may help. */
export const whatsappSendError = (
  code: number | undefined,
  detail: string | undefined
): { text: string; retry: boolean } => {
  const known = code !== undefined ? SEND_ERRORS[code] : undefined;
  if (known) return { text: known.text, retry: !!known.retry };
  return {
    text: detail ? detail.slice(0, 300) : 'WhatsApp refused the message.',
    retry: true
  };
};

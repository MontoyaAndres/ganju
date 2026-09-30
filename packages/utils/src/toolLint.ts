// Checks on how a tool presents itself to a model: the things that make a
// model pick the wrong tool, pass the wrong arguments, or pay for tools it never
// uses. Every finding is a warning — a tool that fails one still works, it is
// just harder for a model to use well.
//
// One rule set, run in three places: `ganju build` (with `--strict` to fail on
// any finding), the API when a custom-code version is created (returned beside
// the version, with the artifact's other tools as context), and the dashboard's
// function dialog while it is being filled in.
//
// The rule for this file: it imports nothing. The published CLI bundles it, and
// anything it imported would ship inside the CLI with it (see cliConstants.ts).

// The shape all three callers can produce: a manifest entry, an http-endpoint's
// config, a proxied tool from discovery, a catalog tool.
export interface LintableTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export const TOOL_LINT_RULES = [
  'missing-description',
  'short-description',
  'no-usage-guidance',
  'missing-annotations',
  'undescribed-input',
  'overlapping-tools',
  'too-many-tools'
] as const;

export type ToolLintRule = (typeof TOOL_LINT_RULES)[number];

export interface ToolLintFinding {
  rule: ToolLintRule;
  // The tool the finding is about. Absent only for `too-many-tools`, which is
  // about the server as a whole.
  tool?: string;
  // `overlapping-tools`: the tools it may be confused with. Each look-alike
  // pair is reported once, on the first of the two.
  alike?: string[];
  // `undescribed-input`: the properties with no description, as dotted paths.
  paths?: string[];
  // `too-many-tools`: how many are enabled, and the number past which it warns.
  count?: number;
  limit?: number;
  // The same finding in English, for the CLI and the API. The dashboard builds
  // its own from the fields above, in the reader's language.
  message: string;
}

export interface ToolLintOptions {
  // The other tools on the same server — natives, http endpoints, proxied
  // tools. They are checked against for overlap and counted, but never
  // reported on themselves: the author of these tools can't change them.
  others?: LintableTool[];
  // How many tools the server exposes beside `tools`, when `others` doesn't
  // list them all. Defaults to `others.length`.
  otherCount?: number;
}

// Shorter than this and a description rarely says both what a tool does and
// when to call it.
export const TOOL_LINT_MIN_DESCRIPTION_LENGTH = 40;

// Past this many tools every call carries a long list of schemas, and models
// start choosing among them badly. A channel turn hard-caps its list at 40
// (CHANNEL_MAX_TOOLS); this warns well before that.
export const TOOL_LINT_MAX_TOOLS = 25;

// Two descriptions sharing at least this much of their vocabulary read as the
// same tool to a model. Words are weighted by how rare they are among the
// server's tools (see descriptionWeights), so tools written from one template
// — "Use when someone asks about X" — are told apart by their X.
const DESCRIPTION_OVERLAP = 0.6;
// Too few content words and two unrelated descriptions can share most of them.
const MIN_OVERLAP_WORDS = 5;

// Lowercased, accents off, so "Úsala cuando" and "usala cuando" are one text.
const fold = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

// Wording that tells a model WHEN to call a tool rather than only what it does
// — English, Spanish and Portuguese, the languages descriptions here are
// written in. Loose on purpose: a false "says when" costs nothing, a false
// "doesn't" nags someone whose description is fine. But not so loose that
// words about how a tool works count: "uses the Stripe API" and "makes an API
// call" say nothing about when to reach for it, so "call" counts only as an
// instruction ("call this…", "call it…").
const USAGE_GUIDANCE =
  /\b(use|call (?:this|it)|when|whenever|before|after|instead|only if|if the user|if you|for questions|usa|usala|usalo|usar|llama|llamala|llamar|cuando|antes de|despues de|en lugar de|si el usuario|quando|use-a|utilize|chame)\b/;

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'into',
  'your',
  'you',
  'use',
  'when',
  'call',
  'tool',
  'returns',
  'return',
  'given',
  'user',
  'about',
  'una',
  'uno',
  'los',
  'las',
  'del',
  'con',
  'por',
  'para',
  'que',
  'este',
  'esta',
  'como',
  'cuando',
  'usa',
  'herramienta',
  'devuelve',
  'usuario'
]);

const contentWords = (text: string): Set<string> =>
  new Set(
    fold(text)
      .split(/[^a-z0-9]+/)
      .filter(word => word.length >= 3 && !STOPWORDS.has(word))
  );

// A proxied tool is named `<server prefix>__<remote name>`. The prefix says
// which connection it came from, not what it does, so `search_repositories`
// and `github__search_repositories` are the same tool to a model. Kept here
// rather than imported from constants (MCP_PROXY_TOOL_NAME_SEP), since this
// file imports nothing.
const PROXY_NAME_SEP = '__';

const withoutProxyPrefix = (name: string): string => {
  const at = name.lastIndexOf(PROXY_NAME_SEP);
  const bare = at === -1 ? name : name.slice(at + PROXY_NAME_SEP.length);
  return bare || name;
};

// `lookupOrder`, `lookup-order` and `order_lookup` name the same thing.
const nameTokens = (name: string): string =>
  withoutProxyPrefix(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join(' ');

// How much each word says about which tool a description belongs to: a word
// in every description (the template, the domain) next to nothing, a word in
// one of them a lot. Smoothed, so with two tools a shared word still counts.
const descriptionWeights = (
  descriptions: Set<string>[]
): ((word: string) => number) => {
  const frequency = new Map<string, number>();
  for (const words of descriptions) {
    for (const word of words) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }
  const total = descriptions.length;
  return word => Math.log(1 + total / (frequency.get(word) ?? 1));
};

// Jaccard, with each word counted by its weight.
const weightedJaccard = (
  a: Set<string>,
  b: Set<string>,
  weight: (word: string) => number
): number => {
  let shared = 0;
  let union = 0;
  for (const word of a) {
    union += weight(word);
    if (b.has(word)) shared += weight(word);
  }
  for (const word of b) if (!a.has(word)) union += weight(word);
  return union === 0 ? 0 : shared / union;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Every property the model may fill in that doesn't say what it is for, down
// through nested objects and arrays of objects.
const undescribedPaths = (schema: unknown, prefix = ''): string[] => {
  if (!isObject(schema)) return [];
  const paths: string[] = [];
  if (isObject(schema.properties)) {
    for (const [key, property] of Object.entries(schema.properties)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (!isObject(property)) continue;
      const description = property.description;
      if (typeof description !== 'string' || !description.trim()) {
        paths.push(path);
      }
      paths.push(...undescribedPaths(property, path));
    }
  }
  if (isObject(schema.items)) {
    paths.push(...undescribedPaths(schema.items, `${prefix}[]`));
  }
  return paths;
};

const quoted = (name: string) => `"${name}"`;

/**
 * Check a set of tools for what makes them hard for a model to use. Findings
 * come back in the order of `tools`, then the server-wide one.
 */
export const lintTools = (
  tools: LintableTool[],
  options: ToolLintOptions = {}
): ToolLintFinding[] => {
  const others = options.others ?? [];
  const findings: ToolLintFinding[] = [];

  const everyTool = [...tools, ...others];
  const wordsOf = new Map(
    everyTool.map(tool => [tool, contentWords(tool.description ?? '')])
  );
  const weight = descriptionWeights([...wordsOf.values()]);
  const overlaps = (a: LintableTool, b: LintableTool): boolean => {
    if (nameTokens(a.name) === nameTokens(b.name)) return true;
    const aWords = wordsOf.get(a)!;
    const bWords = wordsOf.get(b)!;
    if (aWords.size < MIN_OVERLAP_WORDS || bWords.size < MIN_OVERLAP_WORDS) {
      return false;
    }
    return weightedJaccard(aWords, bWords, weight) >= DESCRIPTION_OVERLAP;
  };

  tools.forEach((tool, index) => {
    const description = (tool.description ?? '').trim();

    if (!description) {
      findings.push({
        rule: 'missing-description',
        tool: tool.name,
        message: `${quoted(tool.name)} has no description, so a model sees only its name when deciding whether to call it.`
      });
    } else if (description.length < TOOL_LINT_MIN_DESCRIPTION_LENGTH) {
      findings.push({
        rule: 'short-description',
        tool: tool.name,
        message: `${quoted(tool.name)} has a very short description. Say what it does and when to call it, in at least ${TOOL_LINT_MIN_DESCRIPTION_LENGTH} characters.`
      });
    } else if (!USAGE_GUIDANCE.test(fold(description))) {
      findings.push({
        rule: 'no-usage-guidance',
        tool: tool.name,
        message: `${quoted(tool.name)}'s description says what it does but not when to use it (e.g. "Use when the user asks about…").`
      });
    }

    // Undeclared means "may change things" by the MCP defaults, so with the
    // organization confirming sensitive actions every call asks first — a
    // lookup included.
    const hints = tool.annotations;
    if (
      hints?.readOnlyHint === undefined &&
      hints?.destructiveHint === undefined
    ) {
      findings.push({
        rule: 'missing-annotations',
        tool: tool.name,
        message: `${quoted(tool.name)} declares no annotations, so it is treated as one that may change things and is confirmed before every call when the organization confirms sensitive actions. Set readOnlyHint: true if it only reads, or destructiveHint: false if its changes can be undone.`
      });
    }

    const paths = undescribedPaths(tool.inputSchema);
    if (paths.length > 0) {
      findings.push({
        rule: 'undescribed-input',
        tool: tool.name,
        paths,
        message: `${quoted(tool.name)} has input properties with no description: ${paths.join(', ')}. A model has to guess what to pass.`
      });
    }

    // Each pair once — against the tools after this one, then the rest of the
    // server — and one finding per tool, so twenty look-alikes are nineteen
    // lines rather than a hundred and ninety.
    const alike = [...tools.slice(index + 1), ...others]
      .filter(other => other.name !== tool.name && overlaps(tool, other))
      .map(other => other.name);
    if (alike.length > 0) {
      findings.push({
        rule: 'overlapping-tools',
        tool: tool.name,
        alike,
        message: `${quoted(tool.name)} looks like ${alike.map(quoted).join(', ')} in name or description, so a model may call one for another. Make each description say what sets it apart.`
      });
    }
  });

  const count = tools.length + (options.otherCount ?? others.length);
  if (count > TOOL_LINT_MAX_TOOLS) {
    findings.push({
      rule: 'too-many-tools',
      count,
      limit: TOOL_LINT_MAX_TOOLS,
      message: `${count} tools are enabled on this server. Every one's schema is sent to the model on every call, and models choose worse past a few dozen — turn off the ones it doesn't need (more than ${TOOL_LINT_MAX_TOOLS} is where this warns).`
    });
  }

  return findings;
};

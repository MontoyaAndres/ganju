import { utils } from '@ganju/utils';

import { untrustedResult } from '../../utils';
import { ToolContext, ToolDefinition } from '../types';

const TAVILY_API_BASE = utils.constants.TAVILY_API_BASE;

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

const text = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value }]
});

// artifact_tool.config is untyped JSON, so every read is defensive.
const cfgString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

const cfgNumber = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const cfgStringArray = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && !!x.trim());
  return out.length > 0 ? out : undefined;
};

// The Tavily API key is stored like any other credential — the MCP server
// filters credentials to this tool group's provider, so credentials[0] is it.
const getApiKey = (
  context: ToolContext
): { ok: true; key: string } | { ok: false; response: ToolResult } => {
  const credential = context.credentials[0];
  if (!credential) {
    return {
      ok: false,
      response: text(
        'Error: Web search is not connected. Add your Tavily API key on the Tools page.'
      )
    };
  }
  return { ok: true, key: credential.accessToken };
};

const tavilyFetch = async (
  apiKey: string,
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: true; data: any } | { ok: false; error: string }> => {
  let response: Response;
  try {
    response = await fetch(`${TAVILY_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
  if (!response.ok) {
    return { ok: false, error: await utils.parseHttpErrorMessage(response) };
  }
  return { ok: true, data: await response.json().catch(() => ({})) };
};

const resolveMaxResults = (
  args: Record<string, unknown>,
  context: ToolContext
): number => {
  const requested =
    cfgNumber(args.maxResults) ??
    cfgNumber(context.config?.defaultMaxResults) ??
    utils.constants.TAVILY_DEFAULT_MAX_RESULTS;
  return Math.min(
    Math.max(1, Math.trunc(requested)),
    utils.constants.TAVILY_MAX_RESULTS_LIMIT
  );
};

const resolveSearchDepth = (
  args: Record<string, unknown>,
  context: ToolContext
): string => {
  const requested =
    cfgString(args.searchDepth) ||
    cfgString(context.config?.defaultSearchDepth) ||
    utils.constants.TAVILY_SEARCH_DEPTH_BASIC;
  return (utils.constants.TAVILY_SEARCH_DEPTHS as readonly string[]).includes(
    requested
  )
    ? requested
    : utils.constants.TAVILY_SEARCH_DEPTH_BASIC;
};

const resolveTopic = (
  args: Record<string, unknown>,
  context: ToolContext
): string => {
  const requested =
    cfgString(args.topic) ||
    cfgString(context.config?.defaultTopic) ||
    utils.constants.TAVILY_TOPIC_GENERAL;
  return (utils.constants.TAVILY_TOPICS as readonly string[]).includes(
    requested
  )
    ? requested
    : utils.constants.TAVILY_TOPIC_GENERAL;
};

export const webSearch: ToolDefinition = {
  title: 'Web Search',
  description:
    'Search the live web for up-to-date information and return the top results (title, URL, and a content snippet) so you can cite them. Use this when the answer is not in the artifact resources, when you need current facts (news, prices, releases), or to verify something. Set topic to "news" with an optional days window for recent events. Returns a synthesized answer when available followed by the source results — always cite the URLs you rely on.',
  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query in natural language.'
      },
      maxResults: {
        type: 'number',
        description:
          "Maximum number of results to return (1-20). Defaults to the integration's configured value."
      },
      searchDepth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        description:
          'Search depth. "advanced" digs deeper (slower, costs more); "basic" is the default.'
      },
      topic: {
        type: 'string',
        enum: ['general', 'news'],
        description:
          'Search category. Use "news" for recent current-events queries; otherwise "general".'
      },
      days: {
        type: 'number',
        description:
          'For topic="news": only include results from the last N days.'
      },
      includeDomains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional allowlist — restrict results to these domains.'
      },
      excludeDomains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional blocklist — drop results from these domains.'
      }
    },
    required: ['query']
  },
  handler: async (args, context) => {
    const auth = getApiKey(context);
    if (!auth.ok) return auth.response;

    const query = cfgString(args.query);
    if (!query) return text('Error: query is required.');

    const topic = resolveTopic(args, context);
    const body: Record<string, unknown> = {
      query,
      max_results: resolveMaxResults(args, context),
      search_depth: resolveSearchDepth(args, context),
      topic,
      include_answer: true
    };
    const days = cfgNumber(args.days);
    if (topic === utils.constants.TAVILY_TOPIC_NEWS && days !== undefined) {
      body.days = Math.max(1, Math.trunc(days));
    }
    const includeDomains = cfgStringArray(args.includeDomains);
    if (includeDomains) body.include_domains = includeDomains;
    const excludeDomains = cfgStringArray(args.excludeDomains);
    if (excludeDomains) body.exclude_domains = excludeDomains;

    const result = await tavilyFetch(auth.key, '/search', body);
    if (!result.ok) {
      return text(`Error searching the web: ${result.error}`);
    }

    const data = (result.data || {}) as {
      answer?: string;
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        score?: number;
        published_date?: string;
      }>;
    };
    const results = Array.isArray(data.results) ? data.results : [];
    if (results.length === 0) {
      return text(`No web results found for "${query}".`);
    }

    const lines = results.map((r, i) => {
      const published = r.published_date ? ` (${r.published_date})` : '';
      const snippet = r.content ? `\n  ${r.content.trim()}` : '';
      return `${i + 1}. ${r.title || '(untitled)'}${published}\n  ${
        r.url || ''
      }${snippet}`;
    });

    const answerBlock = data.answer?.trim()
      ? `Answer: ${data.answer.trim()}\n\n`
      : '';
    return untrustedResult(
      'web-search',
      `${answerBlock}Found ${results.length} result(s) for "${query}":\n\n${lines.join(
        '\n\n'
      )}`
    );
  }
};

export const webExtract: ToolDefinition = {
  title: 'Web Extract',
  description:
    'Fetch the full cleaned text content of one or more specific web pages by URL. Use this after web-search (or when the user gives a URL) to read a page in depth rather than relying on the short search snippet. Pass the exact URL(s). Returns the extracted page text; pages that could not be fetched are reported separately.',
  schema: {
    type: 'object',
    properties: {
      urls: {
        type: 'array',
        items: { type: 'string' },
        description:
          'The page URL(s) to extract. Pass the exact URLs (e.g. from web-search results).'
      },
      extractDepth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        description:
          '"advanced" extracts more content (tables, embedded data) at higher cost; "basic" is the default.'
      }
    },
    required: ['urls']
  },
  handler: async (args, context) => {
    const auth = getApiKey(context);
    if (!auth.ok) return auth.response;

    const urls =
      cfgStringArray(args.urls) ??
      (cfgString(args.urls) ? [String(args.urls)] : undefined);
    if (!urls) return text('Error: at least one url is required.');

    const requestedDepth = cfgString(args.extractDepth);
    const extractDepth = (
      utils.constants.TAVILY_SEARCH_DEPTHS as readonly string[]
    ).includes(requestedDepth || '')
      ? requestedDepth
      : utils.constants.TAVILY_SEARCH_DEPTH_BASIC;

    const result = await tavilyFetch(auth.key, '/extract', {
      urls,
      extract_depth: extractDepth
    });
    if (!result.ok) {
      return text(`Error extracting page content: ${result.error}`);
    }

    const data = (result.data || {}) as {
      results?: Array<{ url?: string; raw_content?: string }>;
      failed_results?: Array<{ url?: string; error?: string }>;
    };
    const extracted = Array.isArray(data.results) ? data.results : [];
    const failed = Array.isArray(data.failed_results)
      ? data.failed_results
      : [];

    if (extracted.length === 0 && failed.length === 0) {
      return text('No content could be extracted from the given URL(s).');
    }

    const blocks = extracted.map(r => {
      const content = r.raw_content?.trim() || '(no content extracted)';
      return `## ${r.url || ''}\n\n${content}`;
    });
    if (failed.length > 0) {
      const failedLines = failed
        .map(f => `- ${f.url || '(unknown)'}: ${f.error || 'failed'}`)
        .join('\n');
      blocks.push(`## Failed to extract\n\n${failedLines}`);
    }

    return untrustedResult('web-extract', blocks.join('\n\n---\n\n'));
  }
};

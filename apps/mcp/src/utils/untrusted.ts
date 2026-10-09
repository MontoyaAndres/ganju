import { utils } from '@ganju/utils';

export type UntrustedToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  _meta?: Record<string, unknown>;
};

/**
 * A tool result whose text came from outside: wrapped in the marks the server
 * instructions explain, and flagged so that a sensitive call made after it
 * asks first (see confirmSensitiveTools and the channel runner). `flag: false`
 * labels without flagging — for the organization's own knowledge base, where
 * reading a clean document shouldn't make every later action ask.
 */
export const untrustedResult = (
  source: string,
  text: string,
  options: { flag?: boolean } = {}
): UntrustedToolResult => ({
  content: [{ type: 'text', text: utils.wrapUntrustedContent(source, text) }],
  ...(options.flag === false
    ? {}
    : { _meta: { [utils.UNTRUSTED_CONTENT_META_KEY]: true } })
});

/**
 * Label what one of the organization's own integrations (an HTTP endpoint, a
 * custom tool) brought back. The integration is the owner's, but the data it
 * returns may not be — a support ticket, a product review — so its text is
 * wrapped like any other. Flagged only when that text reads like instructions:
 * a menu lookup before an order is the ordinary case, and flagging it would
 * make the order ask every time. Errors pass through as they are.
 */
export const labelOwnResult = <
  T extends {
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }
>(
  result: T,
  source: string
): T & { _meta?: Record<string, unknown> } => {
  if (result.isError) return result;
  let flagged = false;
  const content = result.content.map(block => {
    if (block.type !== 'text' || typeof block.text !== 'string') return block;
    if (utils.findInstructionLikeText(block.text).length > 0) flagged = true;
    return { ...block, text: utils.wrapUntrustedContent(source, block.text) };
  });
  return {
    ...result,
    content,
    ...(flagged ? { _meta: { [utils.UNTRUSTED_CONTENT_META_KEY]: true } } : {})
  };
};

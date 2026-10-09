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
 * A result that is mostly the user's own writing but can quote someone
 * else's — a draft carrying the email it replies to. Labelled always, flagged
 * only when it reads like instructions, so "show my drafts, then send that
 * one" doesn't ask every time.
 */
export const ownWritingResult = (
  source: string,
  text: string
): UntrustedToolResult =>
  untrustedResult(source, text, {
    flag: utils.findInstructionLikeText(text).length > 0
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
  // A declared output schema makes the structured copy required, so it stays
  // and can't carry the label — but it is read for instructions all the same,
  // so the flag doesn't depend on which copy the client shows the model.
  const structured = (result as { structuredContent?: unknown })
    .structuredContent;
  let flagged =
    structured !== undefined &&
    utils.findInstructionLikeText(JSON.stringify(structured)).length > 0;
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

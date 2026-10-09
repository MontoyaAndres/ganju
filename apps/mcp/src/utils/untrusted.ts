import { utils } from '@ganju/utils';

// The labelling rules live in @ganju/utils (untrustedContent.ts), where they
// are tested; these are the names the tools call them by.

export type UntrustedToolResult = ReturnType<typeof utils.untrustedToolResult>;

/** Outside text, labelled and flagged (`flag: false` to label only). */
export const untrustedResult = utils.untrustedToolResult;

/** A draft or other own writing: labelled, flagged only on instructions. */
export const ownWritingResult = utils.ownWritingToolResult;

/** An HTTP endpoint's or custom tool's result: see labelOwnToolResult. */
export const labelOwnResult = utils.labelOwnToolResult;

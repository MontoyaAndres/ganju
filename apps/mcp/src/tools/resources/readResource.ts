import { utils } from '@ganju/utils';

import { readResourceContent, withResourceContent } from '../../utils';

import { ToolDefinition } from '../types';

export const readResource: ToolDefinition = {
  title: 'Read Resource',
  description:
    'Fetch the textual contents of a resource by URI so you can quote, summarize, or reason about it inline. Returns plain text or stringified JSON. Use after list-resources or search-resources to load a specific document. Do NOT use this when the user wants the resource delivered to them as a file/attachment — use send-resource for that. Binary resources (PDFs, images, audio, video, archives) are NOT inlined here — call send-resource to deliver them, or rely on search-resources excerpts for inline reasoning.',
  schema: {
    type: 'object',
    properties: {
      uri: {
        type: 'string',
        description: 'The URI of the resource to read'
      }
    },
    required: ['uri']
  },
  handler: async (args, context) => {
    const uri = String(args.uri);
    const listed = context.resources.find(r => r.uri === uri);

    if (!listed) {
      return {
        content: [{ type: 'text', text: `Resource not found: ${uri}` }]
      };
    }

    const resource = await withResourceContent(context.db, listed);

    // Binary resources can't be inlined in a tool response on Cloudflare
    // Workers — base64 + JSON re-serialization holds 4-5 simultaneous copies
    // of the payload and trips the 128MB per-request memory cap on files even
    // a few MB large. Short-circuit before loading the blob and tell the
    // model to use send-resource instead.
    const hasInlineText = !!resource.content;
    const isTextMime = utils.constants.TEXT_MIME_TYPES.includes(
      resource.mimeType as (typeof utils.constants.TEXT_MIME_TYPES)[0]
    );
    if (!hasInlineText && !isTextMime) {
      return {
        content: [
          {
            type: 'text',
            text: `"${resource.title}" is a ${resource.mimeType} resource and cannot be inlined here. Use send-resource (uri: ${uri}) to deliver it to the user, or call search-resources to get text excerpts you can reason about.`
          }
        ]
      };
    }

    const result = await readResourceContent(
      resource,
      new URL(uri),
      context.bucket
    );

    const text = result.contents
      .map(c => ('text' in c && c.text ? c.text : ''))
      .filter(Boolean)
      .join('\n');

    return {
      content: [{ type: 'text', text: text || '(empty resource)' }]
    };
  }
};

import { ToolDefinition } from '../types';

export const sendResource: ToolDefinition = {
  usesResources: true,
  title: 'Send Resource',
  description:
    'Deliver a resource (image, document, audio, video, etc.) to the user as an attachment in the channel — they will see a preview / player / download link, not the raw text. Use when the user asks to see, receive, download, or be sent a specific resource. Pair with list-resources or search-resources to find the URI. Optional `caption` adds a short message alongside the attachment. Do NOT use for inline quoting or summarization — use read-resource for that.',
  schema: {
    type: 'object',
    properties: {
      uri: {
        type: 'string',
        description: 'The URI of the resource to send'
      },
      caption: {
        type: 'string',
        description: 'Optional short caption shown with the attachment'
      }
    },
    required: ['uri']
  },
  handler: async (args, context) => {
    const uri = String(args.uri);
    const resource = context.resources.find(r => r.uri === uri);

    if (!resource) {
      return {
        content: [{ type: 'text', text: `Resource not found: ${uri}` }]
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Queued for delivery: ${resource.title} (${resource.mimeType})`
        }
      ]
    };
  }
};

import { utils } from '@ganju/utils';

import { ToolDefinition } from '../types';

export const listResources: ToolDefinition = {
  title: 'List Resources',
  description: `Enumerate the resources attached to this MCP server, a page at a time. Returns JSON {resources: [{uri, title, description, mimeType}], total, nextCursor?} so you can pick a URI for read-resource (to load contents) or send-resource (to deliver to the user). When nextCursor is present there are more: call again with cursor set to it. Use when you need an inventory; prefer search-resources when you are looking for content matching a query rather than browsing the full list.`,
  schema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description:
          'The nextCursor from the previous page, exactly as returned. Leave out for the first page.'
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: utils.constants.LIST_RESOURCES_MAX_LIMIT,
        description: `How many resources per page (default ${utils.constants.LIST_RESOURCES_DEFAULT_LIMIT}).`
      }
    }
  },
  handler: async (args, context) => {
    try {
      const page = utils.listResourcesPage(context.resources, args, {
        defaultLimit: utils.constants.LIST_RESOURCES_DEFAULT_LIMIT,
        maxLimit: utils.constants.LIST_RESOURCES_MAX_LIMIT
      });
      return { content: [{ type: 'text', text: page }] };
    } catch (error) {
      if (error instanceof utils.InvalidCursorError) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
      throw error;
    }
  }
};

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { utils } from '@ganju/utils';
import { utils as dbUtils } from '@ganju/db';

import {
  UserController,
  ArtifactController,
  InvitationController,
  MemberController,
  OrganizationController,
  OrganizationLlmController,
  ProjectController,
  OAuthController,
  CatalogController,
  ChannelController,
  GoogleDriveController,
  GoogleCalendarController,
  CalcomController,
  OneDriveController,
  WellKnownController,
  ContactController
} from './controllers';
import { UserMiddleware } from './middleware';
import { createAuth } from './utils';
import {
  handleIndexBatch,
  handleCrawlDiscoverBatch,
  handleCrawlPageBatch,
  handleGdriveDiscoverBatch,
  handleGdriveFileBatch,
  handleOnedriveDiscoverBatch,
  handleOnedriveFileBatch
} from './queue';

// types
import type { AppEnv, Bindings } from './types';
import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import type {
  IndexJob,
  CrawlDiscoverJob,
  PageJob,
  GdriveDiscoverJob,
  GdriveFileJob,
  OnedriveDiscoverJob,
  OnedriveFileJob
} from './queue';

const app = new Hono<AppEnv>();

app
  .use(
    '*',
    cors({
      origin: (origin, c) => {
        // OAuth discovery + protocol endpoints are reached by any MCP client,
        // including browser-based ones (e.g. the MCP Inspector).
        const path = c.req.path;
        if (
          path.startsWith('/.well-known/') ||
          path.startsWith('/auth/oauth2/') ||
          // Public contact form lives on the marketing site (a different origin
          // from the app), so it can't use the NEXT_PUBLIC_WEB_URL check below.
          path === '/contact'
        ) {
          return origin ?? '*';
        }
        return origin === utils.getEnv(c, 'NEXT_PUBLIC_WEB_URL')
          ? origin
          : null;
      },
      credentials: true,
      allowHeaders: [
        'Content-Type',
        'User-Agent',
        'x-file-name',
        'Authorization',
        'mcp-protocol-version'
      ],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    })
  )
  .onError(async (error, c) => {
    const { status, body } = await dbUtils.handleError(c, error, {
      service: utils.constants.SERVICE_NAME_API
    });
    return c.json(body, status);
  })

  // OAuth discovery — advertises the better-auth oidcProvider endpoints at the
  // origin root so MCP clients (Claude Code, MCP Inspector) can discover them.
  .get(
    '/.well-known/oauth-authorization-server',
    WellKnownController.authorizationServerMetadata
  )
  .get(
    '/.well-known/openid-configuration',
    WellKnownController.authorizationServerMetadata
  )

  // Auth controller
  .on(['GET', 'POST'], '/auth/*', c => {
    const auth = createAuth(c);
    return auth.handler(c.req.raw);
  })
  .get('/me', UserMiddleware.verify, c => {
    const user = c.get('user');
    return c.json({ user });
  })

  // Invitation controller — invitee-facing (matched to the caller by email)
  .get('/invitation', UserMiddleware.verify, InvitationController.listMine)
  .post(
    '/invitation/:invitationId/respond',
    UserMiddleware.verify,
    InvitationController.respond
  )
  // Public — the email landing page resolves an invitation by its token
  .get('/invitation/token/:token', InvitationController.getByToken)

  // Public — marketing-site contact form posts here; emails the team inbox
  .post('/contact', ContactController.create)

  // User controller
  .post('/user/avatar', UserMiddleware.verify, UserController.uploadAvatar)
  .get('/user/:userId/avatar/:filename', UserController.downloadAvatar)

  // Organization controller
  .get('/organization', UserMiddleware.verify, OrganizationController.list)
  .post('/organization', UserMiddleware.verify, OrganizationController.create)
  .put(
    '/organization/:organizationId',
    UserMiddleware.verify,
    OrganizationController.update
  )
  .get(
    '/organization/:organizationId',
    UserMiddleware.verify,
    OrganizationController.get
  )
  .delete(
    '/organization/:organizationId',
    UserMiddleware.verify,
    OrganizationController.remove
  )

  // Organization invitation controller
  .get(
    '/organization/:organizationId/invitation',
    UserMiddleware.verify,
    InvitationController.listForOrganization
  )
  .post(
    '/organization/:organizationId/invitation',
    UserMiddleware.verify,
    InvitationController.createForOrganization
  )
  .delete(
    '/organization/:organizationId/invitation/:invitationId',
    UserMiddleware.verify,
    InvitationController.removeForOrganization
  )

  // Organization member controller
  .get(
    '/organization/:organizationId/member',
    UserMiddleware.verify,
    MemberController.listForOrganization
  )
  .delete(
    '/organization/:organizationId/member/:memberUserId',
    UserMiddleware.verify,
    MemberController.removeForOrganization
  )

  // Project controller
  .post(
    '/organization/:organizationId/project',
    UserMiddleware.verify,
    ProjectController.create
  )
  .put(
    '/organization/:organizationId/project/:projectId',
    UserMiddleware.verify,
    ProjectController.update
  )
  .get(
    '/organization/:organizationId/project/:projectId',
    UserMiddleware.verify,
    ProjectController.get
  )
  .get(
    '/organization/:organizationId/project/:projectId/overview',
    UserMiddleware.verify,
    ProjectController.getOverview
  )
  .delete(
    '/organization/:organizationId/project/:projectId',
    UserMiddleware.verify,
    ProjectController.remove
  )

  // Project invitation controller
  .get(
    '/organization/:organizationId/project/:projectId/invitation',
    UserMiddleware.verify,
    InvitationController.listForProject
  )
  .post(
    '/organization/:organizationId/project/:projectId/invitation',
    UserMiddleware.verify,
    InvitationController.createForProject
  )
  .delete(
    '/organization/:organizationId/project/:projectId/invitation/:invitationId',
    UserMiddleware.verify,
    InvitationController.removeForProject
  )

  // Project member controller
  .get(
    '/organization/:organizationId/project/:projectId/member',
    UserMiddleware.verify,
    MemberController.listForProject
  )
  .delete(
    '/organization/:organizationId/project/:projectId/member/:memberUserId',
    UserMiddleware.verify,
    MemberController.removeForProject
  )

  // Artifact controller
  .get(
    '/organization/:organizationId/project/:projectId/artifact',
    UserMiddleware.verify,
    ArtifactController.get
  )
  .put(
    '/organization/:organizationId/project/:projectId/artifact/slug',
    UserMiddleware.verify,
    ArtifactController.updateSlug
  )

  // Artifact Prompt controller
  .get(
    '/organization/:organizationId/project/:projectId/artifact/prompt',
    UserMiddleware.verify,
    ArtifactController.listPrompts
  )
  .post(
    '/organization/:organizationId/project/:projectId/artifact/prompt',
    UserMiddleware.verify,
    ArtifactController.createPrompt
  )
  .put(
    '/organization/:organizationId/project/:projectId/artifact/prompt/:promptId',
    UserMiddleware.verify,
    ArtifactController.updatePrompt
  )
  .delete(
    '/organization/:organizationId/project/:projectId/artifact/prompt/:promptId',
    UserMiddleware.verify,
    ArtifactController.removePrompt
  )

  // Artifact Resource controller
  .get(
    '/organization/:organizationId/project/:projectId/artifact/resource',
    UserMiddleware.verify,
    ArtifactController.listResources
  )
  .post(
    '/organization/:organizationId/project/:projectId/artifact/resource',
    UserMiddleware.verify,
    ArtifactController.createResource
  )
  .get(
    '/organization/:organizationId/project/:projectId/artifact/resource/:resourceId',
    UserMiddleware.verify,
    ArtifactController.getResource
  )
  .put(
    '/organization/:organizationId/project/:projectId/artifact/resource/:resourceId',
    UserMiddleware.verify,
    ArtifactController.updateResource
  )
  .delete(
    '/organization/:organizationId/project/:projectId/artifact/resource/:resourceId',
    UserMiddleware.verify,
    ArtifactController.removeResource
  )
  .post(
    '/organization/:organizationId/project/:projectId/artifact/resource/:resourceId/upload',
    UserMiddleware.verify,
    ArtifactController.uploadResourceFile
  )
  .get(
    '/organization/:organizationId/project/:projectId/artifact/resource/:resourceId/download',
    UserMiddleware.verify,
    ArtifactController.downloadResourceFile
  )
  .put(
    '/organization/:organizationId/project/:projectId/artifact/resource/:resourceId/show-source',
    UserMiddleware.verify,
    ArtifactController.updateResourceShowSource
  )

  // Google Drive artifact controller
  .get(
    '/organization/:organizationId/project/:projectId/artifact/google-drive/token',
    UserMiddleware.verify,
    GoogleDriveController.token
  )
  .post(
    '/organization/:organizationId/project/:projectId/artifact/google-drive',
    UserMiddleware.verify,
    GoogleDriveController.create
  )
  .post(
    '/organization/:organizationId/project/:projectId/artifact/google-drive/:resourceId/sync',
    UserMiddleware.verify,
    GoogleDriveController.sync
  )

  // Google Calendar artifact controller
  .get(
    '/organization/:organizationId/project/:projectId/artifact/google-calendar/calendars',
    UserMiddleware.verify,
    GoogleCalendarController.calendars
  )

  // Cal.com artifact controller
  .get(
    '/organization/:organizationId/project/:projectId/artifact/calcom/event-types',
    UserMiddleware.verify,
    CalcomController.eventTypes
  )

  // OneDrive artifact controller
  .get(
    '/organization/:organizationId/project/:projectId/artifact/one-drive/token',
    UserMiddleware.verify,
    OneDriveController.token
  )
  .post(
    '/organization/:organizationId/project/:projectId/artifact/one-drive',
    UserMiddleware.verify,
    OneDriveController.create
  )
  .post(
    '/organization/:organizationId/project/:projectId/artifact/one-drive/:resourceId/sync',
    UserMiddleware.verify,
    OneDriveController.sync
  )

  // Artifact Tool controller
  .get(
    '/organization/:organizationId/project/:projectId/artifact/tool',
    UserMiddleware.verify,
    ArtifactController.listTools
  )
  .post(
    '/organization/:organizationId/project/:projectId/artifact/tool',
    UserMiddleware.verify,
    ArtifactController.createTool
  )
  .post(
    '/organization/:organizationId/project/:projectId/artifact/mcp-proxy/discover',
    UserMiddleware.verify,
    ArtifactController.previewMcpProxy
  )
  .post(
    '/organization/:organizationId/project/:projectId/artifact/mcp-proxy/oauth/start',
    UserMiddleware.verify,
    ArtifactController.startMcpProxyOauth
  )
  .put(
    '/organization/:organizationId/project/:projectId/artifact/tool/:toolId',
    UserMiddleware.verify,
    ArtifactController.updateTool
  )
  .delete(
    '/organization/:organizationId/project/:projectId/artifact/tool/:toolId',
    UserMiddleware.verify,
    ArtifactController.removeTool
  )

  // Artifact Credential controller
  .get(
    '/organization/:organizationId/project/:projectId/artifact/credential',
    UserMiddleware.verify,
    ArtifactController.listCredentials
  )
  .post(
    '/organization/:organizationId/project/:projectId/artifact/credential',
    UserMiddleware.verify,
    ArtifactController.createCredential
  )
  .delete(
    '/organization/:organizationId/project/:projectId/artifact/credential/:credentialId',
    UserMiddleware.verify,
    ArtifactController.removeCredential
  )

  // Tool catalog controller
  .get('/catalog/tools', UserMiddleware.verify, CatalogController.listGroups)
  .get(
    '/catalog/mcp-servers',
    UserMiddleware.verify,
    CatalogController.listMcpServers
  )

  // Organization LLM controller
  .get(
    '/organization/:organizationId/llm',
    UserMiddleware.verify,
    OrganizationLlmController.list
  )
  .post(
    '/organization/:organizationId/llm',
    UserMiddleware.verify,
    OrganizationLlmController.create
  )
  .put(
    '/organization/:organizationId/llm/:llmId',
    UserMiddleware.verify,
    OrganizationLlmController.update
  )
  .delete(
    '/organization/:organizationId/llm/:llmId',
    UserMiddleware.verify,
    OrganizationLlmController.remove
  )

  // Channel controller
  .get(
    '/organization/:organizationId/project/:projectId/channel',
    UserMiddleware.verify,
    ChannelController.list
  )
  .post(
    '/organization/:organizationId/project/:projectId/channel',
    UserMiddleware.verify,
    ChannelController.create
  )
  .put(
    '/organization/:organizationId/project/:projectId/channel/:channelId',
    UserMiddleware.verify,
    ChannelController.update
  )
  .delete(
    '/organization/:organizationId/project/:projectId/channel/:channelId',
    UserMiddleware.verify,
    ChannelController.remove
  )
  .get(
    '/organization/:organizationId/project/:projectId/channel/:channelId/conversation',
    UserMiddleware.verify,
    ChannelController.listConversations
  )
  .get(
    '/organization/:organizationId/project/:projectId/channel/:channelId/conversation/:conversationId/message',
    UserMiddleware.verify,
    ChannelController.listMessages
  )

  // Channel webhook (public, signed by platform secret)
  .post('/channel/:channelId/webhook/:platform', ChannelController.webhook)
  // GET handshake on the same URL — WhatsApp's hub.challenge verification.
  .get('/channel/:channelId/webhook/:platform', ChannelController.webhookVerify)

  // Internal: Discord Gateway DO → worker ingest (guarded by internal secret)
  .post('/channel/:channelId/ingest/discord', ChannelController.discordIngest)

  // OAuth controller
  .get('/oauth/mcp-proxy/callback', OAuthController.mcpProxyCallback)
  .get(
    '/oauth/:provider/authorize',
    UserMiddleware.verify,
    OAuthController.authorize
  )
  .get('/oauth/:provider/callback', OAuthController.callback);

export { ResourceHandler } from '@ganju/containers';
export { DiscordGatewayDO } from './durable-objects/discordGateway';

export default {
  fetch: app.fetch,
  queue: (
    batch: MessageBatch<
      | IndexJob
      | CrawlDiscoverJob
      | PageJob
      | GdriveDiscoverJob
      | GdriveFileJob
      | OnedriveDiscoverJob
      | OnedriveFileJob
    >,
    env: Bindings,
    ctx: ExecutionContext
  ) => {
    if (batch.queue.startsWith('ganju-crawl-discover')) {
      return handleCrawlDiscoverBatch(
        batch as MessageBatch<CrawlDiscoverJob>,
        env,
        ctx
      );
    }
    if (batch.queue.startsWith('ganju-crawl-page')) {
      return handleCrawlPageBatch(batch as MessageBatch<PageJob>, env, ctx);
    }
    if (batch.queue.startsWith('ganju-gdrive-discover')) {
      return handleGdriveDiscoverBatch(
        batch as MessageBatch<GdriveDiscoverJob>,
        env,
        ctx
      );
    }
    if (batch.queue.startsWith('ganju-gdrive-file')) {
      return handleGdriveFileBatch(
        batch as MessageBatch<GdriveFileJob>,
        env,
        ctx
      );
    }
    if (batch.queue.startsWith('ganju-onedrive-discover')) {
      return handleOnedriveDiscoverBatch(
        batch as MessageBatch<OnedriveDiscoverJob>,
        env,
        ctx
      );
    }
    if (batch.queue.startsWith('ganju-onedrive-file')) {
      return handleOnedriveFileBatch(
        batch as MessageBatch<OnedriveFileJob>,
        env,
        ctx
      );
    }
    return handleIndexBatch(batch as MessageBatch<IndexJob>, env, ctx);
  }
};

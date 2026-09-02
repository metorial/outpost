import { BaseOutpostAdapter } from '@metorial-outpost/adapter';
import {
  corsPreflightResponse,
  withCorsHeaders,
  type CorsOriginOption
} from '@metorial-outpost/cors';
import {
  middlewareName,
  type McpMessageDirection,
  type McpMiddleware
} from '@metorial-outpost/mcp';
import {
  createOutpostManifestResolver,
  guardNestedOutpostAccess,
  resolveProxyContext,
  type OutpostProxyAdapter
} from '@metorial-outpost/proxy';
import {
  DEFAULT_BASE_PATH,
  OUTPOST_PROTOCOL_SERVICE,
  OutpostServerError,
  type AuthenticatedOutpostRequest
} from '@metorial-outpost/server';
import {
  appendToOutpostChain,
  type OutpostChain,
  type OutpostProxyContext
} from '@metorial-outpost/signature';
import { Hono, type Context } from 'hono';
import { resolveConnectionId } from './connection-id';
import { forwardableHeaders, headersToRecord } from './headers';
import { handleMcpGet } from './mcp-get';
import { handleMcpPost } from './mcp-post';
import { classifyRequest } from './route-classification';
import { buildUpstreamUrl } from './upstream-url';

export type OutpostMcpAdapterConfig = {
  middleware?: McpMiddleware[];
  middlewareTimeoutMs?: number;
  corsOrigins?: CorsOriginOption;
};

let CONNECT_PATHS = [
  '/connect/mcp',
  '/connect/magic',
  '/connect/portal',
  '/connect/plugin',
  '/.well-known',
  '/oauth'
];

export class OutpostMcpAdapter extends BaseOutpostAdapter<OutpostMcpAdapterConfig> {
  readonly name = 'mcp_connection_proxy';
  readonly version = '1.0.0';

  get capabilities(): Record<string, unknown> {
    let middleware = this.config?.middleware ?? [];
    return { middleware: middleware.map((m, i) => middlewareName(m, i)) };
  }

  startProxy(): OutpostProxyAdapter[] {
    let target = this.upstreamUrl;
    let middleware = this.config?.middleware ?? [];
    let middlewareTimeoutMs = this.config?.middlewareTimeoutMs;
    let corsOrigins = this.config?.corsOrigins;
    let serviceName = this.name;
    let baseUrl = this.baseUrl;
    let trustProxy = this.context.trustProxy;

    let buildProxyContext = (c: Context): OutpostProxyContext => {
      let authed = c.get('outpostAuth' as never) as AuthenticatedOutpostRequest | undefined;
      if (authed?.proxyContext) return authed.proxyContext;

      return {
        ...resolveProxyContext(c, trustProxy),
        base_url: baseUrl
      };
    };

    let buildOutpostChain = (c: Context): OutpostChain | undefined => {
      let authed = c.get('outpostAuth' as never) as AuthenticatedOutpostRequest | undefined;
      return authed
        ? appendToOutpostChain(authed.outpostChain, authed.outpostId, authed.instanceId)
        : undefined;
    };

    let app = new Hono();
    app.onError((error, c) => {
      if (error instanceof OutpostServerError) {
        return c.json(
          { error: error.code, error_message: error.message },
          { status: error.status as any }
        );
      }
      throw error;
    });

    let manifestResolver: ReturnType<typeof createOutpostManifestResolver> | undefined;
    app.use(
      '/*',
      guardNestedOutpostAccess({
        tokens: this.context.tokens,
        service: serviceName,
        selfOutpostId: this.context.auth.getSnapshot().outpostId,
        selfManifest: this.context.manifest,
        resolveOutpostManifest: outpostId => {
          manifestResolver ??= createOutpostManifestResolver({
            endpoint: target,
            basePath: this.context.basePath ?? DEFAULT_BASE_PATH,
            service: OUTPOST_PROTOCOL_SERVICE,
            fetch: this.fetch,
            cache: this.cache
          });
          return manifestResolver(outpostId);
        }
      })
    );

    app.all('/*', async c => {
      let origin = c.req.header('origin');

      if (c.req.method === 'OPTIONS') {
        return corsPreflightResponse(origin, corsOrigins);
      }

      let classification = await classifyRequest(c);
      let response: Response;
      let proxyContext = buildProxyContext(c);
      let outpostChain = buildOutpostChain(c);

      if (classification.kind === 'passthrough') {
        let method = c.req.method;
        let body =
          method == 'GET' || method == 'HEAD'
            ? undefined
            : new Uint8Array(await c.req.raw.arrayBuffer());
        response = await this.fetch(buildUpstreamUrl(target, c.req.url), {
          method,
          headers: forwardableHeaders(c.req.raw.headers),
          body,
          service: serviceName,
          proxyContext,
          outpostChain
        });
      } else {
        let connectionId = resolveConnectionId(c);
        let direction: McpMessageDirection =
          classification.kind === 'mcp_get' ? 'from_server' : 'to_server';
        let ctx = {
          direction,
          connectionId,
          auth: Object.freeze(headersToRecord(c.req.raw.headers)),
          logger: this.logger.child({ connectionId })
        };
        let targetUrl = buildUpstreamUrl(target, c.req.url);

        response =
          classification.kind === 'mcp_get'
            ? await handleMcpGet(c, {
                fetch: this.fetch,
                targetUrl,
                middleware,
                middlewareTimeoutMs,
                ctx,
                serviceName,
                proxyContext,
                outpostChain
              })
            : await handleMcpPost(c, classification.message, {
                fetch: this.fetch,
                targetUrl,
                middleware,
                middlewareTimeoutMs,
                ctx,
                serviceName,
                proxyContext,
                outpostChain
              });
      }

      return withCorsHeaders(response, origin, corsOrigins);
    });

    return CONNECT_PATHS.map(path => ({ path, app }));
  }
}

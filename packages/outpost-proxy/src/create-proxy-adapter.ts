import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import type { AuthenticatedOutpostRequest } from '@metorial-outpost/server';
import {
  appendToOutpostChain,
  OUTPOST_SIGNATURE_HEADER_NAMES,
  type OutpostProxyContext
} from '@metorial-outpost/signature';
import { Hono, type Context } from 'hono';
import type { OutpostProxyAdapter } from './adapter';
import { resolveProxyContext, type TrustProxyOptions } from './trust-proxy';

export type ProxyAdapterVariables = { outpostAuth?: AuthenticatedOutpostRequest };

export type CreateProxyAdapterOptions = {
  path: string;
  fetch: OutpostFetchFunction;
  target: string | ((c: Context) => string);
  upstreamUrl?: string;
  service?: string;
  rewritePath?: (path: string, c: Context) => string;
  trustProxy?: boolean | TrustProxyOptions;
  proxyContext?: (c: Context) => OutpostProxyContext;
};

let HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  ...OUTPOST_SIGNATURE_HEADER_NAMES
]);

let filterHeaders = (headers: Headers): Record<string, string> => {
  let record: Record<string, string> = {};
  headers.forEach((value, name) => {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) record[name] = value;
  });
  return record;
};

let defaultRewritePath = (adapterPath: string, path: string): string => {
  if (adapterPath == '' || adapterPath == '/') return path;
  if (path == adapterPath) return '/';
  if (path.startsWith(adapterPath + '/')) return path.slice(adapterPath.length);
  return path;
};

export let createProxyAdapter = (options: CreateProxyAdapterOptions): OutpostProxyAdapter => {
  let app = new Hono<{ Variables: ProxyAdapterVariables }>();

  app.use(async (c, next) => {
    c.res.headers.set('Server', 'Metorial Outpost');
    await next();
  });

  app.notFound(c => c.text('Not Found', 404));

  app.all('/*', async c => {
    let request = c.req.raw;
    let url = new URL(request.url);
    let target =
      options.upstreamUrl ??
      (typeof options.target == 'function' ? options.target(c) : options.target);
    let rewritePath =
      options.rewritePath ?? ((path: string) => defaultRewritePath(options.path, path));
    let targetUrl = new URL(rewritePath(url.pathname, c) + url.search, target);

    let authed = c.get('outpostAuth');

    let proxyContext =
      authed?.proxyContext ??
      (options.proxyContext
        ? options.proxyContext(c)
        : resolveProxyContext(c, options.trustProxy));
    let outpostChain = authed
      ? appendToOutpostChain(authed.outpostChain, authed.outpostId, authed.instanceId)
      : undefined;

    let method = request.method;
    let body =
      method == 'GET' || method == 'HEAD'
        ? undefined
        : new Uint8Array(await request.arrayBuffer());

    return options.fetch(targetUrl, {
      method,
      headers: filterHeaders(request.headers),
      body,
      service: options.service,
      proxyContext,
      outpostChain
    });
  });

  return { path: options.path, app };
};

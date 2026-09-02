# `@metorial/outpost-proxy`

An adapter-based proxy runtime for Outpost instances, exposed as a single [Hono](https://hono.dev)
app. Every adapter runs on the same port; each is either a plain Hono app (a nested service) or a
proxy adapter that forwards requests upstream via [`@metorial/outpost-fetch`](../outpost-fetch),
signed per the [Metorial Outpost Signature Protocol](../../spec.md).

## Installation

```bash
npm install @metorial/outpost-proxy
yarn add @metorial/outpost-proxy
bun add @metorial/outpost-proxy
pnpm add @metorial/outpost-proxy
```

## Usage

```typescript
import { OutpostAuth } from '@metorial-outpost/auth';
import { createOutpostFetch } from '@metorial-outpost/fetch';
import { createOutpostProxy, createProxyAdapter } from '@metorial-outpost/proxy';
import { Hono } from 'hono';

let auth = new OutpostAuth({ credential: myOutpostCredential, defaultService: 'metorial.proxy' });
let outpostFetch = createOutpostFetch({ auth });

let testApp = new Hono();
testApp.get('/hello', c => c.text('handled locally'));

let proxy = createOutpostProxy({
  adapters: [
    { path: '/test', app: testApp },
    createProxyAdapter({ path: '/abc', fetch: outpostFetch, target: 'https://parent.example.com' }),
    createProxyAdapter({ path: '/', fetch: outpostFetch, target: 'https://parent.example.com' })
  ]
});

export default { fetch: proxy.fetch, port: 8080 };
```

`createOutpostProxy` mounts every adapter's `app` onto one shared Hono instance with `.route()`,
sorted from most to least specific path -- a `/` adapter, if present, always matches last so it
can act as a catch-all fallback.

## Health checks

Every proxy always answers `GET /ping` (`pong`, `text/plain`) and `GET /healthz`
(`{"status":"ok"}`), regardless of which adapters are mounted -- the common paths load balancers,
orchestrators, and uptime checks probe by convention. These are exact routes, so they always win
over a `/` adapter's own catch-all, no matter the registration order.

## Adapters

An `OutpostProxyAdapter` is just `{ path, app }`. Since a Hono app's `.fetch` is already a
WinterCG-compatible `(Request) => Promise<Response>`, a **nested Hono service** needs no special
treatment -- hand in your own `Hono` instance directly, as `testApp` above does.

For a **proxy adapter**, use `createProxyAdapter`:

```typescript
createProxyAdapter({
  path: '/abc',
  fetch: outpostFetch,
  target: 'https://parent.example.com',
  service: 'metorial.proxy',
  rewritePath: (path, c) => path,
  trustProxy: false,
  proxyContext: c => ({ ip: '...', user_agent: '...' })
});
```

Request bodies are buffered in full before forwarding -- signing a request means hashing its
whole body, so true streaming pass-through isn't supported, matching `outpost-fetch`'s own body
contract. Hop-by-hop headers (`Host`, `Connection`, `Content-Length`, `Transfer-Encoding`) are
stripped; everything else, including `Authorization`, is forwarded and signed as-is.

## Client IP (`trustProxy`)

Every proxied request signs a `proxy_context` (see
[`@metorial/outpost-signature`](../outpost-signature)) carrying the caller's IP and User-Agent.

By default (`trustProxy` unset or `false`), the IP is **not** read from `X-Forwarded-For` or
similar headers -- those are trivially spoofable by the caller. Instead it's read from the actual
TCP socket, via whichever runtime is serving the app:

- **Bun** -- [`server.requestIP()`](https://bun.com/reference/bun/Server/requestIP), which needs
  the app served with `Bun.serve({ fetch: app.fetch })` (Bun passes its `Server` as the 2nd
  argument to `fetch`, which Hono forwards as `c.env`).
- **Node** -- the raw
  [`http.IncomingMessage`'s socket](https://hono.dev/docs/getting-started/nodejs#access-the-raw-node-js-apis),
  which needs the app served with `@hono/node-server`'s `serve(app)` (it passes
  `{ incoming, outgoing }` as `c.env`).

If neither is detected, the IP is simply omitted rather than trusting an unverified header. (This
duck-types `c.env` locally instead of importing `hono/bun`/`@hono/node-server` -- `hono/bun`'s
barrel eagerly touches the global `Bun` at import time via an unrelated SSG helper, which breaks
under non-Bun test runners such as vitest-under-Node.)

Set `trustProxy: true` (or `{ ipHeader: '...' }`, default header `X-Forwarded-For`) only when
requests genuinely pass through a trusted upstream proxy that sets or strips that header itself
-- otherwise a client can claim any IP it likes.

## Nested Outposts (`guardNestedOutpostAccess`)

An Outpost placed behind another (spec §59) is a fully stand-alone Outpost with its own
credentials and Instances -- nesting is a network-routing fact, not a distinct signing mechanism.
`guardNestedOutpostAccess` gates a proxy adapter's traffic: it verifies an incoming request exactly
as any other Outpost request (`@metorial/outpost-server`'s `verifyOutpostRequest`, spec §42), and
if the signed `outpost_id` differs from this Outpost's own, checks that the nested Outpost's
capability manifest access is equal to or narrower than this Outpost's own (spec §61.2) before
letting it through. A request with no `Metorial-Outpost-Signature` header at all (a plain client,
not a relayed one) is left untouched -- there is nothing nested to check.

```typescript
import { decodeCredentialEnvelope } from '@metorial-outpost/credential-envelope';
import {
  createOutpostManifestResolver,
  createProxyAdapter,
  guardNestedOutpostAccess
} from '@metorial-outpost/proxy';

let credential = decodeCredentialEnvelope(myOutpostCredential);

let resolveOutpostManifest = createOutpostManifestResolver({
  endpoint: credential.endpoint,
  basePath: '/outpost',
  service: 'metorial.outpost',
  fetch: context.fetch,
  cache: context.cache
});

let app = new Hono();
app.use(
  '/*',
  guardNestedOutpostAccess({
    tokens: context.tokens,
    service: 'metorial.proxy',
    selfOutpostId: credential.outpost_id,
    selfManifest: context.manifest,
    resolveOutpostManifest
  })
);
app.route(
  '/',
  createProxyAdapter({ path: '/', fetch: outpostFetch, target: 'https://parent.example.com' }).app
);
```

Wire it ahead of a proxy adapter's own route, on whichever adapter handles ordinary application
traffic that a nested Outpost's Instances might send. `guardNestedOutpostAccess` also populates
`c.set('outpostAuth', ...)` once it authenticates a request, which `createProxyAdapter` then reads
to carry the *original* client's `proxy_context` and this request's `outpost_chain` through to the
next hop, instead of re-deriving `proxy_context` from this hop's immediate TCP peer (which for a
relayed request is just the previous Outpost, not the real original client).

## What this package does not do

- **Resolve manifests or check authorization state against a real database.** `resolveOutpostManifest`
  and the optional `resolver` passed to `guardNestedOutpostAccess` are exactly
  `@metorial/outpost-server`'s own hooks -- see that package for what they resolve against.

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>

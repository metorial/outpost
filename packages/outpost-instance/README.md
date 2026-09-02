# `@metorial/outpost-instance`

Top-level runtime bootstrapping for an Outpost process, built on the other `@metorial/outpost-*`
packages: registers (or loads persisted credentials for) an Instance, constructs the shared
`OutpostAdapterContext`, resolves and starts every configured `OutpostAdapter`, and combines their
proxy surfaces (if any) into one listening server.

## Installation

```bash
npm install @metorial/outpost-instance
yarn add @metorial/outpost-instance
bun add @metorial/outpost-instance
pnpm add @metorial/outpost-instance
```

## Usage

```typescript
import { OutpostInstance } from '@metorial-outpost/instance';
import { OutpostParentAdapter } from '@metorial-outpost/parent-adapter';

let instance = await OutpostInstance.start({
  credential: myOutpostCredential, // an encoded "metorial_op_..." OutpostCredentialEnvelope
  baseUrl: 'https://abc.outpost.example', // the public URL clients use to reach this outpost
  adapters: [
    [OutpostParentAdapter, { parentEndpoint: 'https://parent.example.com' }]
  ],
  proxy: { port: 8080 }
});

await instance.stop();
```

## What `start()` does

1. Registers the Instance (or loads persisted credentials, if a `store` already has them).
2. Builds a **verify-only** `OutpostTokens` (spec §62) -- this Outpost holds no issuer private
   key, so it can only ever verify Instance Tokens, resolving the issuer's public key by `kid`
   from its own configured endpoint (`GET {endpoint}{basePath}/issuer-key/:kid`), caching
   successful lookups. This is what lets an adapter (e.g. `guardNestedOutpostAccess` from
   `@metorial/outpost-proxy`) check a nested Outpost's Instance Token, without needing DB access
   or an issuer private key of its own.
3. Fetches this Outpost's own capability manifest (spec §61) from
   `GET {endpoint}{basePath}/manifest/:outpostId`, and refreshes it on an interval (`manifestRefreshIntervalMs`,
   default 60s) -- a failed refresh logs and keeps the last known good value.
4. Constructs the shared `OutpostAdapterContext` (`auth`, `fetch`, `logger`, `cache`, `manifest`,
   `tokens`) and resolves every entry in `adapters` (a bare class, a `[class, config]` tuple, or a
   factory function) against it.
5. Calls `startProxy()` on every adapter that defines one, and mounts all of their returned
   `{path, app}` pairs behind a single combined server (`@metorial/outpost-proxy`'s
   `createOutpostProxy`) via `Bun.serve`.
6. Calls `start()` on every adapter, in registration order, after every adapter is constructed and
   every proxy is mounted.

`stop()` reverses this: stops the combined proxy server, stops the manifest refresh, then calls
`stop()` on every adapter in reverse order.

## Options

- `credential` -- the encoded `OutpostCredentialEnvelope` (`@metorial/outpost-credential-envelope`)
  returned once at Outpost credential creation.
- `baseUrl` -- **required.** The public URL clients use to reach this outpost, e.g.
  `https://abc.outpost.example`. Shared by every adapter via `OutpostAdapterContext.baseUrl` --
  Metorial rewrites the connect/discovery URLs it hands back to clients (SSE endpoints, OAuth
  issuer/authorization/token URLs, etc.) to this base instead of its own public host, so clients
  keep talking to the outpost. `start()` throws if it's missing or not an absolute `http(s)` URL.
- `trustProxy` -- how to resolve the original client IP if this outpost itself sits behind its
  own reverse proxy (e.g. `{ ipHeader: 'x-forwarded-for' }`). Shared by every adapter via
  `OutpostAdapterContext.trustProxy`.
- `adapters` -- the `OutpostAdapter`s to construct and run.
- `store` -- persists Instance credentials across restarts (defaults to an in-memory store, so a
  fresh registration happens on every restart unless you supply one).
- `basePath` -- must match the protocol base path this Outpost's own upstream endpoint exposes.
  Defaults to `@metorial/outpost-server`'s own default (`/outpost`).
- `manifestRefreshIntervalMs` -- how often the manifest is refreshed. Defaults to 60s.
- `cache`, `fetch`, `logger`, `proxy` (`{hostname, port}`), `stdout` -- as you'd expect.

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>

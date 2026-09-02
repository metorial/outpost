# `@metorial/outpost-trust-proxy`

Resolves the originating client IP and user agent for a Hono request, for building an Outpost
`proxy_context` (see `@metorial/outpost-signature`).

## Installation

```bash
npm install @metorial/outpost-trust-proxy
yarn add @metorial/outpost-trust-proxy
bun add @metorial/outpost-trust-proxy
pnpm add @metorial/outpost-trust-proxy
```

## Usage

`resolveProxyContext` builds a `proxy_context` from the current hop's own connection -- only the
Outpost that first receives a request directly from the client should call it; every hop after
that must relay the value it received instead of re-deriving one from its own connection (which is
just the previous hop, not the original client):

```typescript
import { resolveProxyContext } from '@metorial-outpost/trust-proxy';

// `trustProxy: true` (or `{ ipHeader: '...' }`) trusts `X-Forwarded-For` (or a custom header);
// omit it to read the raw connection IP instead (Bun's `server.requestIP()`, or a Node
// `http.IncomingMessage`'s socket).
let proxyContext = resolveProxyContext(honoContext, trustProxy);
```

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>

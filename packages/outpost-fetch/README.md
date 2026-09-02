# `@metorial/outpost-fetch`

A `fetch`-compatible client that signs every outgoing request with an
[`OutpostAuth`](../outpost-auth) instance, per the [Metorial Outpost Signature
Protocol](../../spec.md). It exists so callers don't have to manually call `auth.sign()` and
merge the resulting headers into every request themselves.

## Installation

```bash
npm install @metorial/outpost-fetch
yarn add @metorial/outpost-fetch
bun add @metorial/outpost-fetch
pnpm add @metorial/outpost-fetch
```

## Usage

```typescript
import { OutpostAuth } from '@metorial-outpost/auth';
import { createOutpostFetch } from '@metorial-outpost/fetch';

let auth = new OutpostAuth({
  credential: {
    version: 1,
    endpoint: 'https://outpost.metorial.com',
    outpost_id: 'otp_123',
    credential_id: 'otc_456',
    private_key: '<base64url PKCS#8 Ed25519 private key>'
  },
  defaultService: 'metorial.proxy'
});

let outpostFetch = createOutpostFetch({ auth });

let response = await outpostFetch('https://api.metorial.com/v1/foo', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ hello: 'world' })
});
```

`createOutpostFetch` returns a plain function with the same signature as the global `fetch`,
so it can be dropped in anywhere a custom `fetch` implementation is accepted (e.g. an SDK
client's `fetch` option). Use the `OutpostFetch` class directly if you'd rather hold onto the
instance:

```typescript
import { OutpostFetch } from '@metorial-outpost/fetch';

let client = new OutpostFetch({ auth, service: 'metorial.proxy' });
await client.fetch('https://api.metorial.com/v1/foo');
```

Every header on the request — the ones you pass plus anything already on a `Request` object —
is signed, matching `OutpostAuth.sign()`'s "hand it the exact headers you're about to send"
contract.

### Options

- `auth` — the `OutpostAuth` instance to sign requests with.
- `service` — default `service` label for requests made through this client. Overridable per
  call via `init.service`; falls back to the `OutpostAuth` instance's own `defaultService` if
  neither is set.
- `fetch` — the underlying `fetch` implementation to call once signing is done. Defaults to
  the global `fetch`.
- `init.proxyContext` / `init.outpostChain` — per-call, forwarded straight into the signed
  metadata (spec §59.2). Set these when re-signing a relayed request as this Outpost, to carry
  the original client's `proxy_context` and the request's `outpost_chain` through unchanged
  rather than losing them at this hop -- see `@metorial/outpost-proxy`'s `createProxyAdapter`.

### Body support

Request bodies are hashed as part of the signature, so only body types that can be read
synchronously into bytes are supported: `string`, `Uint8Array`, `ArrayBuffer`,
`ArrayBufferView`, and `URLSearchParams`. Pre-serialize `FormData`, `Blob`, and
`ReadableStream` bodies before calling `fetch()` — passing one throws immediately instead of
silently sending an unsigned or partially-signed request.

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>

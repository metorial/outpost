# `@metorial/outpost-auth`

Client-side implementation of Outpost instance registration and request signing from the
[Metorial Outpost Signature Protocol](../../spec.md), built on top of `@metorial/outpost-crypto`,
`@metorial/outpost-credential-envelope`, and `@metorial/outpost-signature`.

Given an encoded [Outpost Credential Envelope](../outpost-credential-envelope/README.md)
(wrapping the [spec's credential envelope](../../spec.md#7-credential-envelope)), `OutpostAuth`:

- generates and persists an [Instance Credential](../../spec.md#33-instance) the first time it's needed
- runs the [challenge/response registration flow](../../spec.md#9-instance-registration) (spec §9-13) lazily, at most once
- signs outgoing requests (spec §17-41) with the resulting instance key

## Installation

```bash
npm install @metorial/outpost-auth
yarn add @metorial/outpost-auth
bun add @metorial/outpost-auth
pnpm add @metorial/outpost-auth
```

## Usage

```typescript
import { OutpostAuth, FsInstanceCredentialStore } from '@metorial-outpost/auth';

let credential = 'metorial_op_...';

let auth = new OutpostAuth({
  credential,
  store: new FsInstanceCredentialStore('/var/lib/metorial-outpost/credentials.json'),
  defaultService: 'metorial.proxy'
});

let headers = await auth.sign({
  method: 'POST',
  url: 'https://api.metorial.com/v1/foo',
  headers: { authorization: 'Bearer abc', 'content-type': 'application/json' },
  body: JSON.stringify({ hello: 'world' })
});

await fetch('https://api.metorial.com/v1/foo', {
  method: 'POST',
  headers: {
    authorization: 'Bearer abc',
    'content-type': 'application/json',
    ...headers
  },
  body: JSON.stringify({ hello: 'world' })
});
```

Every header passed to `sign()` is included in `signed_headers` — hand it the exact headers
you're about to send so they're all integrity-protected.

`sign()` also accepts `proxyContext` and `outpostChain` (spec §59.2), included in the signed
metadata unchanged — used when re-signing a relayed request as this Outpost, to carry the
original client's proxy context and the request's outpost chain through rather than losing them
at this hop.

## Instance credential storage

`InstanceCredentialStore` is a small interface with two built-in implementations:

- `MemoryInstanceCredentialStore` — in-process only, lost on restart. The default when no `store` is given.
- `FsInstanceCredentialStore` — a single JSON file on disk, written with owner-only (`0600`) permissions.

Implement `InstanceCredentialStore` yourself to use OS keychains/secret managers instead.

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>

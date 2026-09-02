# `@metorial/outpost-parent-adapter`

An [`OutpostAdapter`](../../packages/outpost-adapter) that puts this Outpost behind a parent
Outpost, per the ["Nested Outposts"](../../spec.md#59-nested-outposts-outpost-chains) section of
the Metorial Outpost Signature Protocol.

It declares itself as the `outpost_registration_proxy` service, which is the name the parent grants
or denies during the registration handshake.

It mounts the protocol's own routes (`@metorial/outpost-server`'s surface) locally and forwards
each to the parent:

- `POST /register/challenge`, `POST /register` -- both forwarded signed by this Outpost's own
  Instance, carrying a `proxy_context` (spec §59.2). This isn't about authenticating the
  registering instance -- that's still the enrollment-credential challenge/response itself (spec
  §9-13), unaffected -- it's so the true root authority records the original client's IP instead of
  the last relaying Outpost's, and so the relay itself is authenticated the same way as any other
  Outpost-to-Outpost traffic. The first Outpost to see the raw client request captures that IP
  itself (via `trustProxy`, spec §31); every Outpost downstream of it detects the incoming request
  already carries a signature, verifies it, and relays the same `proxy_context` unchanged rather
  than re-deriving it from its own connection (which would just be the previous Outpost).
- `GET /public-key/:outpostId/:credentialId`, `GET /manifest/:outpostId` -- resolved against the
  parent as authenticated requests, signed by this Outpost's own Instance (spec §60, §61) -- the
  parent's own routes require authentication. Successful lookups are cached (`cacheTtlMs`,
  defaulting to 5 minutes); failures never are, so a revocation or access change is visible on the
  very next lookup.
- `GET /issuer-key/:kid` -- resolved against the parent, unsigned. Public and unauthenticated by
  design (spec §62), same as on the parent: verifying an Instance Token depends on this key.

## Installation

```bash
npm install @metorial/outpost-parent-adapter
yarn add @metorial/outpost-parent-adapter
bun add @metorial/outpost-parent-adapter
pnpm add @metorial/outpost-parent-adapter
```

## Usage

```typescript
import { OutpostParentAdapter } from '@metorial-outpost/parent-adapter';
import { OutpostInstance } from '@metorial-outpost/instance';

await OutpostInstance.start({
  credential: myOutpostCredential,
  adapters: [
    [OutpostParentAdapter, { parentEndpoint: 'https://parent.example.com' }]
  ]
});
```

`basePath` defaults to `@metorial/outpost-server`'s own default (`/outposts`) and must match
whatever base path the parent Outpost exposes its protocol routes under -- it's used both to mount
this adapter's routes locally and to address the same routes on the parent.

This adapter only concerns itself with the protocol's own routes. Ordinary application traffic
that should also be relayed to the parent (verified and re-signed as described in spec §59) is a
separate adapter's job -- built on `@metorial/outpost-proxy`'s `createProxyAdapter` and
`guardNestedOutpostAccess`, and `@metorial/outpost-signature`'s `outpost_chain` support.

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>

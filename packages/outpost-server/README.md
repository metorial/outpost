# `@metorial/outpost-server`

Server-side implementation of the [Instance Registration protocol](../../spec.md#9-instance-registration)
(spec §9-13) from the Metorial Outpost Signature Protocol, exposed as a [Hono](https://hono.dev)
app.

This package implements the **wire protocol only** — request parsing, canonical registration
signature verification (via `@metorial/outpost-signature`), challenge lifecycle, and error
mapping. It has no knowledge of any concrete database. Whether a given Outpost/credential exists,
is revoked, or currently permits registration — and what "create the instance record" means — is
delegated entirely to a caller-supplied `resolver`.

## Installation

```bash
npm install @metorial/outpost-server
yarn add @metorial/outpost-server
bun add @metorial/outpost-server
pnpm add @metorial/outpost-server
```

## Usage

```typescript
import { createOutpostServer, InMemoryChallengeStore } from '@metorial-outpost/server';
import { OutpostTokens } from '@metorial-outpost/tokens';

let outpostServer = createOutpostServer({
  tokens: new OutpostTokens({
    signing: {
      kid: 'mik_2026_01',
      privateKey: () => loadInstanceTokenSigningKey(),
      publicKey: () => loadInstanceTokenPublicKey()
    }
  }),
  challengeStore: new InMemoryChallengeStore(60_000),
  resolver: {
    async resolveEnrollmentCredential({ outpostId, credentialId }) {
      let cred = await db.outpostEnrollmentCredential.findFirst({
        where: { id: credentialId, outpostId }
      });
      if (!cred) return { status: 'unknown' };
      if (cred.revokedAt) return { status: 'revoked' };

      let outpost = await db.outpost.findUnique({ where: { id: outpostId } });
      if (!outpost?.allowsRegistration) return { status: 'registration_disabled' };

      return { status: 'ok', publicKey: cred.publicKeyBytes };
    },
    async onInstanceRegistered({
      outpostId,
      credentialId,
      instanceId,
      instancePublicKey,
      requestedServices
    }) {
      let expiresAt = new Date(Date.now() + 5 * 60_000);

      await db.outpostInstance.upsert({
        where: { id: instanceId },
        create: {
          id: instanceId,
          outpostId,
          credentialId,
          publicKey: Buffer.from(instancePublicKey),
          status: 'active',
          expiresAt
        },
        update: { status: 'active', expiresAt }
      });

      let allowed = await allowedServicesFor(outpostId);

      return {
        services: requestedServices.map(service => ({
          id: service.id,
          granted: allowed.has(service.id)
        })),
        instanceTokenExpiresAt: expiresAt
      };
    },
    async resolveManifest({ outpostId, requestedBy }) {
      let outpost = await db.outpost.findUnique({ where: { id: outpostId } });
      if (!outpost) return { status: 'unknown' };
      if (requestedBy && !(await canSee(requestedBy.outpostId, outpost))) {
        return { status: 'unknown' };
      }

      return { status: 'ok', manifest: await buildManifestFor(outpost) };
    },
    async resolveInstanceAuthorization({ outpostId, instanceId, credentialId }) {
      let instance = await db.outpostInstance.findFirst({
        where: { id: instanceId, outpostId, credentialId }
      });
      if (!instance) return { status: 'unknown' };
      if (instance.status != 'active') return { status: 'instance_disabled' };

      let outpost = await db.outpost.findUnique({ where: { id: outpostId } });
      if (outpost?.status != 'active') return { status: 'outpost_disabled' };

      return { status: 'active' };
    }
  }
});

mainApp.route('/outpost', outpostServer);
```

This is a drop-in server counterpart to the client flow implemented by
[`@metorial/outpost-auth`](../outpost-auth)'s `registerInstance()` — the request/response shapes
match exactly, with no changes needed on the client side.

### Capability handshake

An Outpost may declare the services it runs on the challenge request, each with an optional
version and free-form capability object:

```json
{
  "services": [
    { "id": "outpost_registration_proxy", "version": "1.2.0", "capabilities": { "nested": true } }
  ]
}
```

`onInstanceRegistered` receives those as `requestedServices` and decides which are granted. The
`/register` response returns every declared service with its decision, so the client knows exactly
which ones to skip, and the granted ids are signed into the Instance Token — where
`verifyOutpostRequest` surfaces them as `grantedServices` on the authenticated request, letting
service handlers authorize without a database round trip.

### Instance Token expiry

Instance Tokens issued by `/register` expire 5 minutes after issuance by default — `OutpostAuth`
(`@metorial/outpost-auth`) tracks the `expires_at` returned alongside `instance_token` and
refreshes proactively (spec §45: re-registering under the same instance id/key, not a key
rotation) about a minute before expiry.

When `onInstanceRegistered` returns an `instanceTokenExpiresAt`, that wins — the resolver already
persisted an expiry, and the token must not disagree with it. Otherwise `instanceTokenExpiresAt`
on the server options decides, or return `undefined` from it to opt back into the spec's default
of long-lived, non-expiring tokens (§15):

```typescript
createOutpostServer({
  // ...
  instanceTokenExpiresAt: challenge => new Date(Date.now() + 15 * 60_000)
});
```

### Per-registration signing keys

`tokens` verifies inbound Instance Tokens and serves `/issuer-key/:kid`. Hosts that sign with more
than one key — for example one keypair per account — pass a `signer` that resolves the right one
for each registration:

```typescript
createOutpostServer({
  // ...
  signer: async ({ outpostId }) => loadSigningTokensFor(outpostId)
});
```

### Account scoping

`resolveManifest` and `resolveEnrollmentCredential` receive `requestedBy` — the authenticated
request — on the `GET /manifest/:outpostId` and `GET /public-key/:outpostId/:credentialId` routes.
Return `{ status: 'unknown' }` for targets the caller shouldn't reach, so the response can't be
used to probe for outposts belonging to someone else. The unauthenticated registration routes pass
no requester.

### Error reporting

Uncaught errors (anything other than `OutpostServerError`, which represents an expected
protocol-level rejection) are logged via `console.error` and answered with a generic
`internal_server_error` response. Pass `onError` to also forward them to your own error-collection
service:

```typescript
createOutpostServer({
  // ...
  onError: error => Sentry.captureException(error)
});
```

## Challenge storage

`ChallengeStore` is a small interface with two built-in implementations:

- `InMemoryChallengeStore` — process-local, lost on restart. The default when no `challengeStore`
  is given. Fine for a single-instance deployment.
- `RedisChallengeStore` — shares challenges across processes via Redis. Atomic single-use
  consumption comes from a `SET ... NX` marker key rather than deleting the data key. It's typed
  against a minimal `RedisChallengeStoreClient` interface (`set`/`setIfNotExists`/`get`) instead of
  a concrete client, so this package doesn't force a dependency on `ioredis` or `redis` — adapt
  whichever client you already use with a one-line wrapper:

  ```typescript
  import { RedisChallengeStore } from '@metorial-outpost/server';

  // ioredis
  let challengeStore = new RedisChallengeStore({
    client: {
      set: (key, value, ttlMs) => redis.set(key, value, 'PX', ttlMs).then(() => {}),
      setIfNotExists: (key, value, ttlMs) =>
        redis.set(key, value, 'PX', ttlMs, 'NX').then(r => r === 'OK'),
      get: key => redis.get(key)
    }
  });
  ```

Implement `ChallengeStore` yourself for another backend.

## Authenticated routes

`createOutpostServer` also mounts, both requiring an ordinary authenticated Outpost request
(spec §42 -- the same Instance Token verification any Instance's request goes through, whether it
originates from this Outpost's own Instance or a nested Outpost, spec §59):

```text
GET /outpost/public-key/:outpostId/:credentialId   -- an Enrollment Credential's public key (spec §60)
GET /outpost/manifest/:outpostId                   -- an Outpost's capability manifest (spec §61)
```

Both resolve via the same `resolver`. Instance registration itself (`/register/challenge`,
`/register`) authenticates independently (spec §9-13) and never requires an Outpost signature — a
direct client has none yet. When one is present, though (a relaying Outpost forwarding the call,
spec §59), it's still verified the same way, so the relaying Outpost's `proxy_context` can be
trusted for the registering client's IP instead of the connecting peer's.

The underlying authentication primitive is exported for reuse by other consumers (e.g. an Outpost
proxying ordinary application traffic upward, gating nested access — see
`@metorial/outpost-proxy`'s `guardNestedOutpostAccess`):

```typescript
import { authenticateOutpostRequest, verifyOutpostRequest } from '@metorial-outpost/server';

// As Hono middleware:
app.get('/my-route', authenticateOutpostRequest({ tokens, service: 'my.service', resolver }), c => {
  let authed = c.get('outpostAuth'); // { outpostId, instanceId, credentialId, service, outpostChain, proxyContext, ... }
  // ...
});

// Or called directly, without a route:
let authed = await verifyOutpostRequest({ tokens, service: 'my.service', resolver }, honoContext);
```

`resolver` is optional. When supplied, cryptographic validity of the Instance Token is not enough
on its own (spec §42 Step 5): `resolver.resolveInstanceAuthorization` is also checked, rejecting
with `instance_disabled`/`outpost_disabled` if either has since been disabled, or
`invalid_instance_token` if the instance/credential/outpost combination in the token doesn't
correspond to any real, currently-matching registration. This is how a disabled or revoked
Instance/Outpost is locked out immediately, without waiting for its (potentially long-lived)
Instance Token to expire. Omit `resolver` where none is available (e.g. an intermediate Outpost
relaying nested traffic with no local database) — the check is then left to whichever authority
further up the chain does hold one.

## Issuer key distribution

`createOutpostServer` also mounts, deliberately **not** behind authentication (spec §62 --
verifying an Instance Token depends on this key, so gating it behind Instance Token verification
would be circular):

```text
GET /outpost/issuer-key/:kid
```

It resolves an Instance Token issuer public key from `tokens` (via `OutpostTokens.publicKeyFor`),
letting any Outpost -- not just the true root authority -- construct a verify-only `OutpostTokens`
and check Instance Tokens itself. See `@metorial/outpost-tokens`'s README for the signing vs.
verify-only split, and `@metorial/outpost-instance`'s `createIssuerKeyResolver` for the
fetch+cache implementation an Outpost instance uses against this endpoint.

## What this package does not do

- **Resolve registrations, manifests, or credentials.** Whether an Outpost or credential exists,
  is revoked, or currently allows registration, and what an Outpost's manifest is, is entirely up
  to the `resolver` you provide.
- **Check nested-access capabilities.** Comparing a nested Outpost's manifest against its
  parent's and rejecting overreaching access is `@metorial/outpost-proxy`'s
  `guardNestedOutpostAccess`, built on this package's `verifyOutpostRequest` and
  `isManifestAccessAllowed`.

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>

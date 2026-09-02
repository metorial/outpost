# Outpost registration process

An Outpost credential envelope identifies an Outpost, enrollment credential, upstream endpoint,
and enrollment private key. An **instance** is a running installation of that Outpost. Each
instance owns its own Ed25519 key pair and receives an Instance Token after registration.

## Handshake

`@metorial-outpost/auth` implements this flow through `registerInstance()`:

1. Generate an `oti_…` instance ID and instance key pair (or reuse persisted ones).
2. `POST /outpost/register/challenge` with the protocol version, Outpost/credential/instance IDs,
   base64url instance public key, and the services the instance proposes to run.
3. Receive a single-use, expiring challenge.
4. Sign the challenge binding with both the enrollment private key and the instance private key;
   sign the stable instance binding with the enrollment key as well.
5. `POST /outpost/register` with those three signatures.
6. Persist the returned token, expiry, instance ID, and instance key material. The response also
   contains service grant decisions.

The registration endpoints are intentionally not authenticated by an existing Instance Token:
there is no instance token on first enrollment. The challenge and two possession proofs are the
authentication mechanism.

## Use `OutpostAuth` in applications

`OutpostAuth` lazily loads or registers on the first `ensureRegistered()` or `sign()` call. Give
it a persistent store in real deployments so restarts retain the instance identity.

```ts
import { OutpostAuth, FsInstanceCredentialStore } from '@metorial-outpost/auth';

let auth = new OutpostAuth({
  credential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
  store: new FsInstanceCredentialStore('/var/lib/metorial-outpost/instance.json'),
  defaultService: 'my-outpost-service'
});

let credentials = await auth.ensureRegistered({
  services: [{ id: 'my-outpost-service', version: '1.0.0', capabilities: { audit: true } }]
});

let headers = await auth.sign({
  method: 'POST',
  url: 'https://api.metorial.com/v1/example',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ hello: 'world' })
});
```

Built-in stores are `MemoryInstanceCredentialStore` (the default; discarded at restart) and
`FsInstanceCredentialStore` (one owner-only JSON file). Implement `InstanceCredentialStore` for
a keychain, KMS, or secret manager. Protect the store like a private key: it contains the instance
private key and token.

## Service grants and token refresh

An instance declares its adapter services during the challenge request. The registration authority
returns `{ id, granted }` for each; `OutpostInstance.start()` does not start adapters explicitly
denied by that response. An authority should store the instance public key and authorization state,
then include allowed services in the token it issues.

When a token has an expiry, `OutpostAuth` refreshes it about one minute before expiry. If it is
already expired, outgoing signing waits for a successful re-registration using the same instance
ID and key. A failed refresh blocks signing rather than using an expired token.

## Server responsibilities

`@metorial-outpost/server` supplies the Hono wire protocol. Its resolver must decide whether the
credential is known, revoked, or disabled; consume challenges atomically; persist registrations;
and authorize instances on later requests. Use shared challenge storage (for example
`RedisChallengeStore`) in multi-process deployments so one-time challenge consumption remains
atomic across replicas.

The server also exposes an issuer-key endpoint. A running Outpost uses it to verify tokens from
nested Outposts; it does not need the issuer private key itself.

# Outpost signature system

`@metorial-outpost/signature` defines deterministic Ed25519 signature bases for instance
registration and outbound Outpost requests. It deliberately does not issue tokens, retain
challenges, or decide whether a credential is permitted; those are server/service concerns.

## Registration signatures

Registration binds a server-issued challenge to the exact Outpost, enrollment credential,
instance ID, and instance public key. The client creates two signatures over the same base:

- the enrollment key proves the Outpost credential authorized this registration;
- the new instance key proves possession of the key that will sign later requests.

It also sends an enrollment-key signature over `(outpostId, credentialId, instanceId)`, which
allows the server to bind or renew the chosen instance ID.

```ts
import { Ed25519 } from '@metorial-outpost/crypto';
import { generateChallenge, signInstanceId, signRegistration } from '@metorial-outpost/signature';

let enrollment = await Ed25519.generateKeyPair();
let instance = await Ed25519.generateKeyPair();
let input = {
  challengeId: 'och_123',
  challenge: generateChallenge(),
  outpostId: 'otp_123',
  credentialId: 'otc_456',
  instanceId: 'oti_789',
  instancePublicKey: await Ed25519.exportPublicKey(instance.publicKey)
};

let signature = await signRegistration(enrollment.privateKey, input);
let instanceSignature = await signRegistration(instance.privateKey, input);
let instanceIdSignature = await signInstanceId(enrollment.privateKey, input);
```

The production client flow is implemented by `registerInstance()` and `OutpostAuth`; normally,
applications should use those rather than manually calling these primitives.

## Request signatures

Every signed request covers its identity, timestamp, random request ID, service, normalized URL,
the selected headers, SHA-256 body digest, and (when present) proxy context and relay chain.

```ts
import { Ed25519, sha256 } from '@metorial-outpost/crypto';
import {
  canonicalizeSignedHeaders,
  generateRequestId,
  signRequest,
  verifyRequestSignature
} from '@metorial-outpost/signature';

let keyPair = await Ed25519.generateKeyPair();
let body = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));
let headers = { authorization: 'Bearer abc', 'content-type': 'application/json' };
let signedHeaders = canonicalizeSignedHeaders(headers, Object.keys(headers));
let request = {
  outpostId: 'otp_123', instanceId: 'oti_456',
  timestamp: Math.floor(Date.now() / 1000), requestId: generateRequestId(),
  service: 'metorial.proxy', method: 'POST', scheme: 'https',
  authority: 'api.metorial.com', path: '/v1/messages', query: '',
  signedHeaders, bodySha256: await sha256(body)
};

let signature = await signRequest(keyPair.privateKey, request);
let valid = await verifyRequestSignature(keyPair.publicKey, request, signature);
```

Canonicalization is part of the protocol: methods are uppercased, scheme and authority are
normalized, signed header names are lowercased/sorted, and the path/query must already be
canonical. Do not reconstruct the outgoing request differently after signing it.

## HTTP metadata

`OutpostAuth.sign()` produces these headers for an ordinary outbound request:

| Header | Purpose |
| --- | --- |
| `Metorial-Outpost-Id` | Signed Outpost identity. |
| `Metorial-Outpost-Instance-Token` | The server-issued token for the signing instance. |
| `Metorial-Outpost-Signature` | Base64url JSON metadata, including signature and signed-header names. |

The signature metadata is encoded with `encodeSignatureHeader()` and parsed strictly with
`decodeSignatureHeader()`. The instance token is intentionally a separate header.

Sign the exact non-Outpost headers that will be sent. In particular, `authorization`,
`proxy-authorization`, `content-type`, and `content-encoding` are required to be signed whenever
present. A verifier can check this with `findMissingRequiredSignedHeaders()`.

## Freshness and nested routing

Verifiers should reject stale or implausibly future timestamps with `isTimestampFresh()` (default:
five-minute age and 15-second future skew). Pair that with replay protection keyed by request ID
at the service layer if replay prevention is required.

When an Outpost relays a request, verify the inbound signature first, then re-sign using the
relaying instance. Preserve client metadata and append the previous hop:

```ts
import { appendToOutpostChain } from '@metorial-outpost/signature';

let outpostChain = appendToOutpostChain(existingChain, childOutpostId, childInstanceId);
```

`appendToOutpostChain()` de-duplicates by Outpost ID while retaining request-flow order.
`proxy_context` is a sorted, signed string map (conventionally `ip` and `user_agent`), so a relay
does not replace the original client information with its own peer connection.

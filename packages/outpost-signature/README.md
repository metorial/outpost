# `@metorial/outpost-signature`

Implements the request- and registration-signing parts of the
[Metorial Outpost Signature Protocol](../../spec.md) on top of `@metorial/outpost-crypto`:
canonical signature bases, header canonicalization, and the `Metorial-Outpost-Signature`
metadata format.

Instance Token issuance/verification, challenge storage, and authorization state
(enabled/disabled/revoked) are service-level concerns and are not part of this package.

## Installation

```bash
npm install @metorial/outpost-signature
yarn add @metorial/outpost-signature
bun add @metorial/outpost-signature
pnpm add @metorial/outpost-signature
```

## Usage

### Instance registration (spec §9-13)

```typescript
import { Ed25519 } from '@metorial-outpost/crypto';
import {
  generateChallenge,
  signRegistration,
  verifyRegistrationSignature
} from '@metorial-outpost/signature';

let outpost = await Ed25519.generateKeyPair(); // the Outpost enrollment key pair
let instance = await Ed25519.generateKeyPair(); // the instance key pair

let input = {
  challengeId: 'och_123',
  challenge: generateChallenge(),
  outpostId: 'otp_123',
  credentialId: 'otc_456',
  instanceId: 'oti_789',
  instancePublicKey: await Ed25519.exportPublicKey(instance.publicKey)
};

let signature = await signRegistration(outpost.privateKey, input);

let isValid = await verifyRegistrationSignature(outpost.publicKey, input, signature);
```

### Request signing (spec §17-41)

```typescript
import { Ed25519, sha256 } from '@metorial-outpost/crypto';
import {
  canonicalizeSignedHeaders,
  generateRequestId,
  signRequest,
  verifyRequestSignature
} from '@metorial-outpost/signature';

let instance = await Ed25519.generateKeyPair();

let body = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));
let headers = { authorization: 'Bearer abc', 'content-type': 'application/json' };

let signedHeaders = canonicalizeSignedHeaders(headers, ['authorization', 'content-type']);

let input = {
  outpostId: 'otp_123',
  instanceId: 'oti_456',
  timestamp: Math.floor(Date.now() / 1000),
  requestId: generateRequestId(),
  service: 'metorial.proxy',
  method: 'POST',
  scheme: 'https',
  authority: 'api.metorial.com',
  path: '/v1/foo',
  query: '',
  signedHeaders,
  bodySha256: await sha256(body)
};

let signature = await signRequest(instance.privateKey, input);
let isValid = await verifyRequestSignature(instance.publicKey, input, signature);
```

### Signature metadata (spec §18)

```typescript
import { encodeSignatureHeader, decodeSignatureHeader } from '@metorial-outpost/signature';

let header = encodeSignatureHeader({
  version: 1,
  outpost_id: 'otp_123',
  timestamp: 1788084301,
  request_id: 'req_123',
  service: 'metorial.proxy',
  signed_headers: ['authorization', 'content-type'],
  signature: '<base64url Ed25519 signature>'
});

let metadata = decodeSignatureHeader(header); // throws on malformed/missing fields
```

The Instance Token itself travels in its own `Metorial-Outpost-Instance-Token` header
(`OUTPOST_INSTANCE_TOKEN_HEADER`), not inside the signature metadata.

### Required signed headers (spec §38) and timestamp freshness (spec §26)

```typescript
import {
  findMissingRequiredSignedHeaders,
  isTimestampFresh
} from '@metorial-outpost/signature';

let missing = findMissingRequiredSignedHeaders(
  Object.keys(headers),
  signedHeaders.map(h => h.name)
);
if (missing.length > 0)
  throw new Error(`Missing required signed headers: ${missing.join(', ')}`);

if (!isTimestampFresh(input.timestamp)) throw new Error('Stale or future-dated request');
```

### Nested Outposts / Outpost Chains

An Outpost placed behind another Outpost is a fully stand-alone Outpost with its own credentials
and Instances — nesting is purely a network-routing fact, not a distinct signing mechanism.
Ordinary request verification (Instance Token, same as always) already tells the front Outpost
whether a request came from a nested child: the signed `outpost_id` simply differs from its own.
The front Outpost then re-signs the request as itself, recording the relay in `outpost_chain`:

```typescript
import {
  appendToOutpostChain,
  signRequest,
  verifyRequestSignature
} from '@metorial-outpost/signature';

let behindSignature = await signRequest(behindOutpost.instancePrivateKey, input);

let verified = await verifyRequestSignature(
  behindOutpost.instancePublicKey,
  input,
  behindSignature
);

let frontSignature = await signRequest(frontOutpost.instancePrivateKey, {
  ...input,
  outpostId: frontOutpost.outpostId,
  instanceId: frontOutpost.instanceId,
  outpostChain: appendToOutpostChain(
    input.outpostChain,
    behindOutpost.outpostId,
    behindOutpost.instanceId
  )
});
```

`outpost_chain` is a deduplicated array of `[outpostId, instanceId]` tuples in request-flow order
(the order each Outpost actually relayed the request in, not alphabetical), included in the
signature base so neither identity can be tampered with in transit. Use `appendToOutpostChain` to
add the next hop.

`proxy_context` carries request metadata (conventionally `ip` and `user_agent`) that would
otherwise be lost once a request is proxied through one or more Outposts. Building one from the
current hop's own connection is `@metorial/outpost-trust-proxy`'s `resolveProxyContext` -- see
that package for details.

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>

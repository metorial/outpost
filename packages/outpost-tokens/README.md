# `@metorial/outpost-tokens`

Issues and verifies Instance Tokens (spec §15) for the
[Metorial Outpost Signature Protocol](../../spec.md), on top of `@metorial/outpost-crypto`.

## Installation

```bash
npm install @metorial/outpost-tokens
yarn add @metorial/outpost-tokens
bun add @metorial/outpost-tokens
pnpm add @metorial/outpost-tokens
```

## Usage

### Signing (the true root authority only)

Only the party that holds the Metorial issuer's Ed25519 private key can mint Instance Tokens. It
constructs an `OutpostTokens` with a `signing` key, tagged with a `kid` (spec §15/§48) so
verifiers can pick the right public key out of a set, e.g. during key rotation:

```typescript
import { OutpostTokens } from '@metorial-outpost/tokens';

let tokens = new OutpostTokens({
  signing: { kid: 'mik_2026_01', privateKey, publicKey }
});

let token = await tokens.sign({
  type: 'metorial-outpost-instance',
  data: { outpost_id: 'otp_123', instance_id: 'oti_789', instance_public_key: '...' }
});
```

When `verification` is omitted, it defaults to trusting exactly the configured `signing` key
(`{ [kid]: publicKey }`) — the common, non-rotating case.

### Verifying (any Outpost, including non-root ones)

Verification only ever needs a public key, never the private key. Construct a **verify-only**
`OutpostTokens` — no `signing` field — from whichever public key(s) you have, keyed by `kid`:

```typescript
let verifier = new OutpostTokens({
  verification: { mik_2026_01: oldPublicKey, mik_2026_02: newPublicKey }
});

let verifier = new OutpostTokens({
  verification: { resolve: async kid => await fetchAndCacheIssuerKey(kid) }
});

let result = await verifier.verify({ expectedType: 'metorial-outpost-instance', token });
if (result.verified) {
  // result.data, result.expiresAt, result.createdAt
}
```

This is what makes it possible for any Outpost — not just the true root authority — to verify an
Instance Token, e.g. to check a nested Outpost's request (spec §59).

`OutpostTokens.decode(token)` reads the payload data without verifying the signature, useful for
non-authoritative logging/debugging only.

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>

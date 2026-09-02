# `@metorial/outpost-crypto`

Low-level cryptographic primitives for the [Metorial Outpost Signature Protocol](../../spec.md):
Ed25519 keys and signatures, SHA-256, base64url encoding, and the Metorial Canonical
Encoding v1 codec used to build deterministic signature bases.

This package has no dependencies. It uses only the platform Web Crypto API
(`crypto.subtle`, `crypto.getRandomValues`), as recommended by the protocol spec.

## Installation

```bash
npm install @metorial/outpost-crypto
yarn add @metorial/outpost-crypto
bun add @metorial/outpost-crypto
pnpm add @metorial/outpost-crypto
```

## Usage

### Ed25519 keys and signatures

```typescript
import { Ed25519 } from '@metorial-outpost/crypto';

let { publicKey, privateKey } = await Ed25519.generateKeyPair();

let data = new TextEncoder().encode('hello');
let signature = await Ed25519.sign(privateKey, data);

let isValid = await Ed25519.verify(publicKey, signature, data);

// Export/import raw public key and PKCS#8 private key bytes
let rawPublicKey = await Ed25519.exportPublicKey(publicKey);
let pkcs8PrivateKey = await Ed25519.exportPrivateKey(privateKey);

let importedPublicKey = await Ed25519.importPublicKey(rawPublicKey);
let importedPrivateKey = await Ed25519.importPrivateKey(pkcs8PrivateKey);
```

### SHA-256

```typescript
import { sha256 } from '@metorial-outpost/crypto';

let digest = await sha256(new TextEncoder().encode('hello'));
```

### base64url (unpadded)

```typescript
import { base64url } from '@metorial-outpost/crypto';

let encoded = base64url.encode(new Uint8Array([1, 2, 3]));
let decoded = base64url.decode(encoded);
```

### Random bytes

```typescript
import { randomBytes } from '@metorial-outpost/crypto';

let challenge = randomBytes(32); // 256 bits
```

### Metorial Canonical Encoding v1

Deterministic, unambiguous binary encoding used as the input to every signature in the
protocol. See spec sections 20–22.

```typescript
import { canonicalMessage, field, decodeCanonical } from '@metorial-outpost/crypto';

let message = canonicalMessage('metorial-outpost-request-v1', [
  field.uint('version', 1),
  field.string('outpost-id', 'otp_123'),
  field.bytes('body-sha256', digest)
]);

let { magic, fields } = decodeCanonical(message);
```

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>

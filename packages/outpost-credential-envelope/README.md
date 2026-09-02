# `@metorial/outpost-credential-envelope`

Encodes and decodes the instance credential handed to `OutpostAuth` and `OutpostInstance`
as a single opaque, transportable string instead of a raw JSON object.

An envelope looks like:

```
metorial_op_<base64url("mtop_" + JSON.stringify(["v1", credential]))>
```

## Installation

```bash
npm install @metorial/outpost-credential-envelope
yarn add @metorial/outpost-credential-envelope
bun add @metorial/outpost-credential-envelope
pnpm add @metorial/outpost-credential-envelope
```

## Usage

```typescript
import {
  decodeCredentialEnvelope,
  encodeCredentialEnvelope,
  type OutpostCredential
} from '@metorial-outpost/credential-envelope';

let credential: OutpostCredential = {
  version: 1,
  endpoint: 'https://outpost.metorial.com',
  outpost_id: 'otp_123',
  credential_id: 'otc_456',
  private_key: '...'
};

let envelope = encodeCredentialEnvelope(credential);
// 'metorial_op_...'

let decoded = decodeCredentialEnvelope(envelope);
// decoded deep-equals credential
```

`decodeCredentialEnvelope` throws a descriptive `Error` if the envelope is missing the
`metorial_op_` prefix, isn't valid base64url, is missing the `mtop_` payload prefix, isn't
valid JSON, or carries an unsupported envelope version.

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>

import { base64url } from '@metorial-outpost/crypto';
import type { OutpostCredential, OutpostCredentialEnvelope } from './types';

let ENVELOPE_PREFIX = 'metorial_op_';
let PAYLOAD_PREFIX = 'mtop_';
let ENVELOPE_VERSION = 'v1';

let encoder = new TextEncoder();
let decoder = new TextDecoder();

export let encodeCredentialEnvelope = (
  credential: OutpostCredential
): OutpostCredentialEnvelope => {
  let payload = `${PAYLOAD_PREFIX}${JSON.stringify([
    ENVELOPE_VERSION,
    {
      ...credential,
      outpost_id: undefined,
      credential_id: undefined
    }
  ])}:${credential.outpost_id}:${credential.credential_id}`;
  return `${ENVELOPE_PREFIX}${base64url.encode(encoder.encode(payload))}`;
};

export let decodeCredentialEnvelope = (
  envelope: OutpostCredentialEnvelope
): OutpostCredential => {
  if (!envelope.startsWith(ENVELOPE_PREFIX)) {
    throw new Error(
      `Invalid outpost credential envelope: expected it to start with "${ENVELOPE_PREFIX}"`
    );
  }

  let encoded = envelope.slice(ENVELOPE_PREFIX.length);

  let payload: string;
  try {
    payload = decoder.decode(base64url.decode(encoded));
  } catch {
    throw new Error('Invalid outpost credential envelope: not valid base64url');
  }

  if (!payload.startsWith(PAYLOAD_PREFIX)) {
    throw new Error(
      `Invalid outpost credential envelope: decoded payload is missing the "${PAYLOAD_PREFIX}" prefix`
    );
  }

  let body = payload.slice(PAYLOAD_PREFIX.length);
  let credentialSeparator = body.lastIndexOf(':');
  let outpostSeparator =
    credentialSeparator > 0 ? body.lastIndexOf(':', credentialSeparator - 1) : -1;

  if (outpostSeparator < 0) {
    throw new Error(
      'Invalid outpost credential envelope: decoded payload is missing the outpost/credential ids'
    );
  }

  let json = body.slice(0, outpostSeparator);
  let outpostId = body.slice(outpostSeparator + 1, credentialSeparator);
  let credentialId = body.slice(credentialSeparator + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid outpost credential envelope: decoded payload is not valid JSON');
  }

  if (!Array.isArray(parsed) || parsed.length !== 2) {
    throw new Error(
      'Invalid outpost credential envelope: decoded payload must be a [version, credential] tuple'
    );
  }

  let [version, credential] = parsed;
  if (version !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported outpost credential envelope version: ${version}`);
  }

  if (!credential || typeof credential !== 'object') {
    throw new Error(
      'Invalid outpost credential envelope: decoded payload is not a valid credential'
    );
  }

  return {
    ...(credential as Omit<OutpostCredential, 'outpost_id' | 'credential_id'>),
    outpost_id: outpostId,
    credential_id: credentialId
  } as OutpostCredential;
};

import { describe, expect, it } from 'vitest';
import { decodeCredentialEnvelope, encodeCredentialEnvelope } from './envelope';
import type { OutpostCredential } from './types';

let credential: OutpostCredential = {
  version: 1,
  endpoint: 'https://outpost.metorial.com',
  outpost_id: 'otp_123',
  credential_id: 'otc_456',
  private_key: 'private-key-material'
};

describe('encodeCredentialEnvelope / decodeCredentialEnvelope', () => {
  it('round-trips a credential', () => {
    let envelope = encodeCredentialEnvelope(credential);
    expect(decodeCredentialEnvelope(envelope)).toEqual(credential);
  });

  it('encodes with the "metorial_op_" prefix', () => {
    expect(encodeCredentialEnvelope(credential)).toMatch(/^metorial_op_/);
  });

  it('produces a payload starting with "mtop_" once base64url-decoded', () => {
    let envelope = encodeCredentialEnvelope(credential);
    let encoded = envelope.slice('metorial_op_'.length);
    let payload = new TextDecoder().decode(
      Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c =>
        c.charCodeAt(0)
      )
    );

    let { outpost_id, credential_id, ...rest } = credential;

    expect(payload).toBe(
      `mtop_${JSON.stringify(['v1', rest])}:${outpost_id}:${credential_id}`
    );
  });

  it('round-trips an endpoint containing a port, so the id separators stay unambiguous', () => {
    let withPort: OutpostCredential = {
      ...credential,
      endpoint: 'http://localhost:3000/outpost'
    };

    expect(decodeCredentialEnvelope(encodeCredentialEnvelope(withPort))).toEqual(withPort);
  });

  it('round-trips even when the base64url portion contains "_"', () => {
    let candidate: { envelope: string; credential: OutpostCredential } | undefined;

    for (let attempt = 0; attempt < 200 && !candidate; attempt++) {
      let privateKey = Array.from({ length: 80 }, () =>
        String.fromCharCode(33 + Math.floor(Math.random() * 94))
      ).join('');

      let attemptCredential: OutpostCredential = { ...credential, private_key: privateKey };
      let envelope = encodeCredentialEnvelope(attemptCredential);

      if (envelope.slice('metorial_op_'.length).includes('_')) {
        candidate = { envelope, credential: attemptCredential };
      }
    }

    expect(candidate).toBeDefined();
    expect(decodeCredentialEnvelope(candidate!.envelope)).toEqual(candidate!.credential);
  });

  it('throws when the envelope is missing the "metorial_op_" prefix', () => {
    expect(() => decodeCredentialEnvelope('not-an-envelope')).toThrow(/metorial_op_/);
  });

  it('throws when the envelope is not valid base64url', () => {
    expect(() => decodeCredentialEnvelope('metorial_op_!!!not-base64!!!')).toThrow(
      /not valid base64url/
    );
  });

  it('throws when the decoded payload is missing the "mtop_" prefix', () => {
    let bogusPayload = base64urlEncodeForTest('not-mtop-prefixed');
    expect(() => decodeCredentialEnvelope(`metorial_op_${bogusPayload}`)).toThrow(/mtop_/);
  });

  it('throws when the decoded payload is missing the outpost/credential ids', () => {
    let bogusPayload = base64urlEncodeForTest('mtop_["v1",{}]');
    expect(() => decodeCredentialEnvelope(`metorial_op_${bogusPayload}`)).toThrow(
      /missing the outpost\/credential ids/
    );
  });

  it('throws when the decoded payload is not valid JSON', () => {
    let bogusPayload = base64urlEncodeForTest('mtop_not-json:otp_123:otc_456');
    expect(() => decodeCredentialEnvelope(`metorial_op_${bogusPayload}`)).toThrow(
      /not valid JSON/
    );
  });

  it('throws when the envelope version is unsupported', () => {
    let bogusPayload = base64urlEncodeForTest(
      `mtop_${JSON.stringify(['v2', {}])}:otp_123:otc_456`
    );
    expect(() => decodeCredentialEnvelope(`metorial_op_${bogusPayload}`)).toThrow(
      /Unsupported outpost credential envelope version: v2/
    );
  });
});

let base64urlEncodeForTest = (value: string): string =>
  btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

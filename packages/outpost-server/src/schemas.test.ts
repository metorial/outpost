import { base64url } from '@metorial-outpost/crypto';
import { describe, expect, it } from 'vitest';
import { OutpostServerError } from './errors';
import { parseChallengeRequestBody, parseRegisterRequestBody } from './schemas';

let validInstancePublicKey = base64url.encode(new Uint8Array(32));

describe('parseChallengeRequestBody', () => {
  it('parses a valid body', () => {
    let body = parseChallengeRequestBody({
      version: 1,
      outpost_id: 'otp_123',
      credential_id: 'otc_456',
      instance_id: 'oti_789',
      instance_public_key: validInstancePublicKey
    });

    expect(body.outpostId).toBe('otp_123');
    expect(body.credentialId).toBe('otc_456');
    expect(body.instanceId).toBe('oti_789');
    expect(body.instancePublicKey).toHaveLength(32);
  });

  it('rejects a missing field', () => {
    expect(() =>
      parseChallengeRequestBody({
        version: 1,
        outpost_id: 'otp_123',
        credential_id: 'otc_456',
        instance_public_key: validInstancePublicKey
      })
    ).toThrow(OutpostServerError);
  });

  it('rejects an unsupported version', () => {
    expect(() =>
      parseChallengeRequestBody({
        version: 2,
        outpost_id: 'otp_123',
        credential_id: 'otc_456',
        instance_id: 'oti_789',
        instance_public_key: validInstancePublicKey
      })
    ).toThrow(OutpostServerError);
  });

  it('rejects a public key of the wrong length', () => {
    expect(() =>
      parseChallengeRequestBody({
        version: 1,
        outpost_id: 'otp_123',
        credential_id: 'otc_456',
        instance_id: 'oti_789',
        instance_public_key: base64url.encode(new Uint8Array(16))
      })
    ).toThrow(OutpostServerError);
  });
});

describe('parseRegisterRequestBody', () => {
  it('parses a valid body', () => {
    let body = parseRegisterRequestBody({
      version: 1,
      challenge_id: 'och_123',
      signature: 'sig',
      instance_signature: 'instance-sig',
      credential_instance_id_signature: 'credential-instance-id-sig'
    });

    expect(body.challengeId).toBe('och_123');
    expect(body.signature).toBe('sig');
    expect(body.instanceSignature).toBe('instance-sig');
    expect(body.credentialInstanceIdSignature).toBe('credential-instance-id-sig');
  });

  it('rejects a missing instance_signature', () => {
    expect(() =>
      parseRegisterRequestBody({
        version: 1,
        challenge_id: 'och_123',
        signature: 'sig',
        credential_instance_id_signature: 'credential-instance-id-sig'
      })
    ).toThrow(OutpostServerError);
  });

  it('rejects a missing credential_instance_id_signature', () => {
    expect(() =>
      parseRegisterRequestBody({
        version: 1,
        challenge_id: 'och_123',
        signature: 'sig',
        instance_signature: 'instance-sig'
      })
    ).toThrow(OutpostServerError);
  });

  it('rejects a non-object body', () => {
    expect(() => parseRegisterRequestBody(null)).toThrow(OutpostServerError);
    expect(() => parseRegisterRequestBody('nope')).toThrow(OutpostServerError);
  });
});

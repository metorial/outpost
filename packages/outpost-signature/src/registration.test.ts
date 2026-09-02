import { Ed25519 } from '@metorial-outpost/crypto';
import { describe, expect, it } from 'vitest';
import {
  generateChallenge,
  signRegistration,
  verifyRegistrationSignature
} from './registration';

let buildInput = async () => {
  let outpost = await Ed25519.generateKeyPair();
  let instance = await Ed25519.generateKeyPair();

  return {
    outpost,
    input: {
      challengeId: 'och_123',
      challenge: generateChallenge(),
      outpostId: 'otp_123',
      credentialId: 'otc_456',
      instanceId: 'oti_789',
      instancePublicKey: await Ed25519.exportPublicKey(instance.publicKey)
    }
  };
};

describe('registration signature', () => {
  it('verifies a proof signed with the matching enrollment key', async () => {
    let { outpost, input } = await buildInput();

    let signature = await signRegistration(outpost.privateKey, input);

    expect(await verifyRegistrationSignature(outpost.publicKey, input, signature)).toBe(true);
  });

  it('rejects a proof signed with a different enrollment key', async () => {
    let { input } = await buildInput();
    let other = await Ed25519.generateKeyPair();

    let signature = await signRegistration(other.privateKey, input);
    let attacker = await Ed25519.generateKeyPair();

    expect(await verifyRegistrationSignature(attacker.publicKey, input, signature)).toBe(
      false
    );
  });

  it.each(['challengeId', 'outpostId', 'credentialId', 'instanceId'] as const)(
    'rejects a proof replayed for a different %s',
    async key => {
      let { outpost, input } = await buildInput();
      let signature = await signRegistration(outpost.privateKey, input);

      let tampered = { ...input, [key]: `${input[key]}-tampered` };

      expect(await verifyRegistrationSignature(outpost.publicKey, tampered, signature)).toBe(
        false
      );
    }
  );

  it('rejects a proof replayed for a different instance public key', async () => {
    let { outpost, input } = await buildInput();
    let signature = await signRegistration(outpost.privateKey, input);

    let otherInstance = await Ed25519.generateKeyPair();
    let tampered = {
      ...input,
      instancePublicKey: await Ed25519.exportPublicKey(otherInstance.publicKey)
    };

    expect(await verifyRegistrationSignature(outpost.publicKey, tampered, signature)).toBe(
      false
    );
  });

  it('rejects a proof replayed with a different challenge', async () => {
    let { outpost, input } = await buildInput();
    let signature = await signRegistration(outpost.privateKey, input);

    let tampered = { ...input, challenge: generateChallenge() };

    expect(await verifyRegistrationSignature(outpost.publicKey, tampered, signature)).toBe(
      false
    );
  });
});

describe('generateChallenge', () => {
  it('returns 32 random bytes', () => {
    expect(generateChallenge()).toHaveLength(32);
    expect(generateChallenge()).not.toEqual(generateChallenge());
  });
});

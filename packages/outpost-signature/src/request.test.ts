import { Ed25519, sha256 } from '@metorial-outpost/crypto';
import { describe, expect, it } from 'vitest';
import { canonicalizeSignedHeaders } from './headers';
import { generateRequestId, hashBody, signRequest, verifyRequestSignature } from './request';

let buildInput = async () => {
  let instance = await Ed25519.generateKeyPair();
  let body = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));

  let signedHeaders = canonicalizeSignedHeaders(
    { authorization: 'Bearer abc', 'content-type': 'application/json' },
    ['authorization', 'content-type']
  );

  return {
    instance,
    input: {
      outpostId: 'otp_123',
      instanceId: 'oti_456',
      timestamp: 1788084301,
      requestId: generateRequestId(),
      service: 'metorial.proxy',
      method: 'POST',
      scheme: 'https',
      authority: 'api.metorial.com',
      path: '/v1/foo',
      query: '',
      signedHeaders,
      bodySha256: await hashBody(body)
    }
  };
};

describe('request signature', () => {
  it('verifies a signature produced with the matching instance key', async () => {
    let { instance, input } = await buildInput();

    let signature = await signRequest(instance.privateKey, input);

    expect(await verifyRequestSignature(instance.publicKey, input, signature)).toBe(true);
  });

  it('rejects a signature verified with a different instance key', async () => {
    let { instance, input } = await buildInput();
    let signature = await signRequest(instance.privateKey, input);

    let other = await Ed25519.generateKeyPair();
    expect(await verifyRequestSignature(other.publicKey, input, signature)).toBe(false);
  });

  it.each([
    ['method', 'GET'],
    ['scheme', 'http'],
    ['authority', 'evil.example.com'],
    ['path', '/v1/bar'],
    ['query', 'a=1'],
    ['service', 'metorial.control'],
    ['outpostId', 'otp_999'],
    ['instanceId', 'oti_999'],
    ['requestId', 'oprq_other']
  ] as const)('rejects a signature replayed with a modified %s', async (key, value) => {
    let { instance, input } = await buildInput();
    let signature = await signRequest(instance.privateKey, input);

    let tampered = { ...input, [key]: value };
    expect(await verifyRequestSignature(instance.publicKey, tampered, signature)).toBe(false);
  });

  it('rejects a signature replayed with a modified timestamp', async () => {
    let { instance, input } = await buildInput();
    let signature = await signRequest(instance.privateKey, input);

    let tampered = { ...input, timestamp: input.timestamp + 1 };
    expect(await verifyRequestSignature(instance.publicKey, tampered, signature)).toBe(false);
  });

  it('rejects a signature replayed with a different body', async () => {
    let { instance, input } = await buildInput();
    let signature = await signRequest(instance.privateKey, input);

    let tampered = {
      ...input,
      bodySha256: await sha256(new TextEncoder().encode('different'))
    };
    expect(await verifyRequestSignature(instance.publicKey, tampered, signature)).toBe(false);
  });

  it('rejects a signature replayed with an added signed header', async () => {
    let { instance, input } = await buildInput();
    let signature = await signRequest(instance.privateKey, input);

    let tampered = {
      ...input,
      signedHeaders: [...input.signedHeaders, { name: 'x-extra', value: '1' }]
    };
    expect(await verifyRequestSignature(instance.publicKey, tampered, signature)).toBe(false);
  });

  it('rejects a signature replayed with a modified signed header value', async () => {
    let { instance, input } = await buildInput();
    let signature = await signRequest(instance.privateKey, input);

    let tampered = {
      ...input,
      signedHeaders: input.signedHeaders.map(h =>
        h.name == 'authorization' ? { ...h, value: 'Bearer tampered' } : h
      )
    };
    expect(await verifyRequestSignature(instance.publicKey, tampered, signature)).toBe(false);
  });

  it('normalizes method casing and scheme/authority before signing', async () => {
    let { instance, input } = await buildInput();

    let lowerMethod = { ...input, method: 'post' };
    let signature = await signRequest(instance.privateKey, lowerMethod);

    expect(
      await verifyRequestSignature(instance.publicKey, { ...input, method: 'POST' }, signature)
    ).toBe(true);
  });

  it('signs and verifies an outpost chain in request-flow order', async () => {
    let { instance, input } = await buildInput();

    let withChain = {
      ...input,
      outpostChain: [
        ['otp_b', 'oti_b'],
        ['otp_a', 'oti_a']
      ] as [string, string][]
    };
    let signature = await signRequest(instance.privateKey, withChain);

    expect(await verifyRequestSignature(instance.publicKey, withChain, signature)).toBe(true);
  });

  it('rejects a signature replayed with the outpost chain reordered', async () => {
    let { instance, input } = await buildInput();
    let withChain = {
      ...input,
      outpostChain: [
        ['otp_b', 'oti_b'],
        ['otp_a', 'oti_a']
      ] as [string, string][]
    };
    let signature = await signRequest(instance.privateKey, withChain);

    let reordered = {
      ...withChain,
      outpostChain: [
        ['otp_a', 'oti_a'],
        ['otp_b', 'oti_b']
      ] as [string, string][]
    };
    expect(await verifyRequestSignature(instance.publicKey, reordered, signature)).toBe(false);
  });

  it('rejects a signature replayed with a modified outpost chain', async () => {
    let { instance, input } = await buildInput();
    let withChain = {
      ...input,
      outpostChain: [['otp_a', 'oti_a']] as [string, string][]
    };
    let signature = await signRequest(instance.privateKey, withChain);

    let tampered = {
      ...withChain,
      outpostChain: [
        ['otp_a', 'oti_a'],
        ['otp_b', 'oti_b']
      ] as [string, string][]
    };
    expect(await verifyRequestSignature(instance.publicKey, tampered, signature)).toBe(false);
  });

  it('rejects a signature replayed with a modified chain instance ID', async () => {
    let { instance, input } = await buildInput();
    let withChain = {
      ...input,
      outpostChain: [['otp_a', 'oti_a']] as [string, string][]
    };
    let signature = await signRequest(instance.privateKey, withChain);

    let tampered = {
      ...withChain,
      outpostChain: [['otp_a', 'oti_other']] as [string, string][]
    };
    expect(await verifyRequestSignature(instance.publicKey, tampered, signature)).toBe(false);
  });

  it('treats a missing outpost chain the same as an explicit empty one', async () => {
    let { instance, input } = await buildInput();
    let signature = await signRequest(instance.privateKey, input);

    expect(
      await verifyRequestSignature(
        instance.publicKey,
        { ...input, outpostChain: [] },
        signature
      )
    ).toBe(true);
  });
});

describe('generateRequestId', () => {
  it('is prefixed and unique', () => {
    expect(generateRequestId()).toMatch(/^oprq_/);
    expect(generateRequestId()).not.toBe(generateRequestId());
  });
});

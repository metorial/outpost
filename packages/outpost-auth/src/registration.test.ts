import { base64url, Ed25519 } from '@metorial-outpost/crypto';
import { verifyRegistrationSignature } from '@metorial-outpost/signature';
import { describe, expect, it, vi } from 'vitest';
import { registerInstance } from './registration';

let jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

describe('registerInstance', () => {
  it('runs the challenge/response flow and returns an Instance Credential', async () => {
    let outpost = await Ed25519.generateKeyPair();

    let seenChallengeRequest: any;
    let seenRegisterRequest: any;

    let fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      let body = JSON.parse(init.body as string);

      if (url.endsWith('/outpost/register/challenge')) {
        seenChallengeRequest = body;
        return jsonResponse({
          challenge_id: 'och_123',
          challenge: base64url.encode(crypto.getRandomValues(new Uint8Array(32))),
          expires_at: Math.floor(Date.now() / 1000) + 60
        });
      }

      if (url.endsWith('/outpost/register')) {
        seenRegisterRequest = body;
        return jsonResponse({ instance_token: 'instance-token-value' });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    let credentials = await registerInstance({
      endpoint: 'https://outpost.metorial.com/',
      outpostId: 'otp_123',
      credentialId: 'otc_456',
      enrollmentPrivateKey: outpost.privateKey,
      fetch: fetchMock as unknown as typeof fetch
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(seenChallengeRequest).toMatchObject({
      outpost_id: 'otp_123',
      credential_id: 'otc_456'
    });
    expect(seenChallengeRequest.instance_id).toBe(credentials.instanceId);
    expect(seenChallengeRequest.instance_public_key).toBe(credentials.instancePublicKey);

    expect(seenRegisterRequest.challenge_id).toBe('och_123');

    expect(credentials.instanceId).toMatch(/^oti_/);
    expect(credentials.instanceToken).toBe('instance-token-value');
    expect(typeof credentials.instancePrivateKey).toBe('string');
    expect(typeof credentials.instancePublicKey).toBe('string');

    let importedInstancePrivateKey = await Ed25519.importPrivateKey(
      base64url.decode(credentials.instancePrivateKey)
    );
    let importedInstancePublicKey = await Ed25519.importPublicKey(
      base64url.decode(credentials.instancePublicKey)
    );
    let signature = await Ed25519.sign(importedInstancePrivateKey, new Uint8Array([1, 2, 3]));
    expect(
      await Ed25519.verify(importedInstancePublicKey, signature, new Uint8Array([1, 2, 3]))
    ).toBe(true);
  });

  it('signs the registration proof with the enrollment private key, verifiable against the returned instance key', async () => {
    let outpost = await Ed25519.generateKeyPair();
    let challengeBytes = crypto.getRandomValues(new Uint8Array(32));

    let fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/outpost/register/challenge')) {
        return jsonResponse({
          challenge_id: 'och_abc',
          challenge: base64url.encode(challengeBytes)
        });
      }
      return jsonResponse({ instance_token: 'tok' });
    });

    let credentials = await registerInstance({
      endpoint: 'https://outpost.metorial.com',
      outpostId: 'otp_123',
      credentialId: 'otc_456',
      enrollmentPrivateKey: outpost.privateKey,
      fetch: fetchMock as unknown as typeof fetch
    });

    let registerCallInit = fetchMock.mock.calls.find(([url]) =>
      (url as string).endsWith('/outpost/register')
    )![1] as RequestInit;
    let registerBody = JSON.parse(registerCallInit.body as string);

    let signatureInput = {
      challengeId: 'och_abc',
      challenge: challengeBytes,
      outpostId: 'otp_123',
      credentialId: 'otc_456',
      instanceId: credentials.instanceId,
      instancePublicKey: base64url.decode(credentials.instancePublicKey)
    };

    expect(
      await verifyRegistrationSignature(
        outpost.publicKey,
        signatureInput,
        registerBody.signature
      )
    ).toBe(true);

    let importedInstancePublicKey = await Ed25519.importPublicKey(
      base64url.decode(credentials.instancePublicKey)
    );
    expect(
      await verifyRegistrationSignature(
        importedInstancePublicKey,
        signatureInput,
        registerBody.instance_signature
      )
    ).toBe(true);
  });

  it('throws when the challenge response is missing required fields', async () => {
    let outpost = await Ed25519.generateKeyPair();
    let fetchMock = vi.fn(async () => jsonResponse({}));

    await expect(
      registerInstance({
        endpoint: 'https://outpost.metorial.com',
        outpostId: 'otp_123',
        credentialId: 'otc_456',
        enrollmentPrivateKey: outpost.privateKey,
        fetch: fetchMock as unknown as typeof fetch
      })
    ).rejects.toThrow(/challenge response/);
  });

  it('throws when a request fails with a non-2xx status', async () => {
    let outpost = await Ed25519.generateKeyPair();
    let fetchMock = vi.fn(async () => jsonResponse({ error: 'nope' }, 403));

    await expect(
      registerInstance({
        endpoint: 'https://outpost.metorial.com',
        outpostId: 'otp_123',
        credentialId: 'otc_456',
        enrollmentPrivateKey: outpost.privateKey,
        fetch: fetchMock as unknown as typeof fetch
      })
    ).rejects.toThrow(/403/);
  });
});

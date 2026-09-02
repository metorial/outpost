import {
  encodeCredentialEnvelope,
  type OutpostCredential
} from '@metorial-outpost/credential-envelope';
import { base64url, Ed25519, sha256 } from '@metorial-outpost/crypto';
import {
  decodeSignatureHeader,
  OUTPOST_ID_HEADER,
  OUTPOST_INSTANCE_TOKEN_HEADER,
  OUTPOST_SIGNATURE_HEADER,
  verifyRequestSignature,
  type RequestSignatureInput
} from '@metorial-outpost/signature';
import { describe, expect, it, vi } from 'vitest';
import { OutpostAuth } from './outpost-auth';
import { MemoryInstanceCredentialStore } from './stores/memory';

let jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

let buildCredential = async (): Promise<{
  credential: OutpostCredential;
  envelope: string;
  outpostKeyPair: CryptoKeyPair;
}> => {
  let outpostKeyPair = (await Ed25519.generateKeyPair()) as unknown as CryptoKeyPair;

  let credential: OutpostCredential = {
    version: 1,
    endpoint: 'https://outpost.metorial.com',
    outpost_id: 'otp_123',
    credential_id: 'otc_456',
    private_key: base64url.encode(
      await Ed25519.exportPrivateKey(outpostKeyPair.privateKey as CryptoKey)
    )
  };

  return { outpostKeyPair, credential, envelope: encodeCredentialEnvelope(credential) };
};

let registrationFetchMock = () =>
  vi.fn(async (url: string) => {
    if (url.endsWith('/outpost/register/challenge')) {
      return jsonResponse({
        challenge_id: 'och_123',
        challenge: base64url.encode(crypto.getRandomValues(new Uint8Array(32)))
      });
    }

    if (url.endsWith('/outpost/register')) {
      return jsonResponse({ instance_token: 'instance-token-value' });
    }

    throw new Error(`Unexpected URL: ${url}`);
  });

describe('OutpostAuth', () => {
  it('registers lazily, only once, even under concurrent sign() calls', async () => {
    let { envelope } = await buildCredential();
    let fetchMock = registrationFetchMock();

    let auth = new OutpostAuth({
      credential: envelope,
      defaultService: 'metorial.proxy',
      fetch: fetchMock as unknown as typeof fetch
    });

    let [first, second] = await Promise.all([
      auth.sign({ method: 'GET', url: 'https://api.metorial.com/v1/foo' }),
      auth.sign({ method: 'GET', url: 'https://api.metorial.com/v1/bar' })
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2); // one challenge call, one register call
    expect(first[OUTPOST_ID_HEADER]).toBe('otp_123');
    expect(second[OUTPOST_ID_HEADER]).toBe('otp_123');
  });

  it('produces a request signature that verifies against the stored instance credentials', async () => {
    let { credential, envelope } = await buildCredential();
    let store = new MemoryInstanceCredentialStore();
    let fetchMock = registrationFetchMock();

    let auth = new OutpostAuth({
      credential: envelope,
      store,
      fetch: fetchMock as unknown as typeof fetch
    });

    let body = JSON.stringify({ hello: 'world' });
    let headers = { authorization: 'Bearer abc', 'content-type': 'application/json' };

    let signed = await auth.sign({
      method: 'POST',
      url: 'https://api.metorial.com/v1/foo?a=1',
      service: 'metorial.proxy',
      headers,
      body
    });

    let metadata = decodeSignatureHeader(signed[OUTPOST_SIGNATURE_HEADER]!);
    expect(signed[OUTPOST_INSTANCE_TOKEN_HEADER]).toBe('instance-token-value');
    expect(metadata.service).toBe('metorial.proxy');
    expect(metadata.signed_headers).toEqual(['authorization', 'content-type']);

    let credentials = await store.load();
    expect(credentials).not.toBeNull();

    let instancePublicKey = await Ed25519.importPublicKey(
      base64url.decode(credentials!.instancePublicKey)
    );

    let signatureInput: RequestSignatureInput = {
      outpostId: credential.outpost_id,
      instanceId: credentials!.instanceId,
      timestamp: metadata.timestamp,
      requestId: metadata.request_id,
      service: metadata.service,
      method: 'POST',
      scheme: 'https',
      authority: 'api.metorial.com',
      path: '/v1/foo',
      query: 'a=1',
      signedHeaders: [
        { name: 'authorization', value: 'Bearer abc' },
        { name: 'content-type', value: 'application/json' }
      ],
      bodySha256: await sha256(new TextEncoder().encode(body))
    };

    expect(
      await verifyRequestSignature(instancePublicKey, signatureInput, metadata.signature)
    ).toBe(true);
  });

  it('never calls the network when the store already holds instance credentials', async () => {
    let { envelope } = await buildCredential();
    let instance = await Ed25519.generateKeyPair();

    let store = new MemoryInstanceCredentialStore({
      instanceId: 'oti_existing',
      instancePrivateKey: base64url.encode(
        await Ed25519.exportPrivateKey(instance.privateKey)
      ),
      instancePublicKey: base64url.encode(await Ed25519.exportPublicKey(instance.publicKey)),
      instanceToken: 'existing-token'
    });

    let fetchMock = vi.fn(() => {
      throw new Error('should not be called');
    });

    let auth = new OutpostAuth({
      credential: envelope,
      store,
      defaultService: 'metorial.proxy',
      fetch: fetchMock as unknown as typeof fetch
    });

    let signed = await auth.sign({ method: 'GET', url: 'https://api.metorial.com/v1/foo' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(signed[OUTPOST_INSTANCE_TOKEN_HEADER]).toBe('existing-token');
  });

  it('throws when sign() is called without a service and no default is configured', async () => {
    let { envelope } = await buildCredential();
    let auth = new OutpostAuth({
      credential: envelope,
      store: new MemoryInstanceCredentialStore({
        instanceId: 'oti_existing',
        instancePrivateKey: 'irrelevant',
        instancePublicKey: 'irrelevant',
        instanceToken: 'irrelevant'
      })
    });

    await expect(
      auth.sign({ method: 'GET', url: 'https://api.metorial.com/v1/foo' })
    ).rejects.toThrow(/service/);
  });

  it('retries registration after a failed attempt instead of caching the rejection', async () => {
    let { envelope } = await buildCredential();
    let attempt = 0;

    let fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/outpost/register/challenge')) {
        attempt++;
        if (attempt == 1) return jsonResponse({ error: 'try again' }, 500);
        return jsonResponse({
          challenge_id: 'och_123',
          challenge: base64url.encode(crypto.getRandomValues(new Uint8Array(32)))
        });
      }

      return jsonResponse({ instance_token: 'instance-token-value' });
    });

    let auth = new OutpostAuth({
      credential: envelope,
      defaultService: 'metorial.proxy',
      fetch: fetchMock as unknown as typeof fetch
    });

    await expect(
      auth.sign({ method: 'GET', url: 'https://api.metorial.com/v1/foo' })
    ).rejects.toThrow();

    let signed = await auth.sign({ method: 'GET', url: 'https://api.metorial.com/v1/foo' });
    expect(signed[OUTPOST_ID_HEADER]).toBe('otp_123');
  });

  describe('getSnapshot', () => {
    it('reports the outpost/credential ids and endpoint before any registration happens', async () => {
      let { envelope } = await buildCredential();
      let auth = new OutpostAuth({ credential: envelope });

      expect(auth.getSnapshot()).toEqual({
        outpostId: 'otp_123',
        credentialId: 'otc_456',
        endpoint: 'https://outpost.metorial.com',
        instanceId: undefined,
        registered: false,
        tokenExpiresAt: null
      });
    });

    it('includes the instance id and token expiry once registered, without leaking secrets', async () => {
      let { envelope } = await buildCredential();
      let fetchMock = registrationFetchMock();

      let auth = new OutpostAuth({
        credential: envelope,
        defaultService: 'metorial.proxy',
        upstreamUrl: 'https://parent.outpost.example',
        fetch: fetchMock as unknown as typeof fetch
      });

      await auth.sign({ method: 'GET', url: 'https://api.metorial.com/v1/foo' });

      let snapshot = auth.getSnapshot();
      expect(snapshot.registered).toBe(true);
      expect(snapshot.endpoint).toBe('https://parent.outpost.example');
      expect(typeof snapshot.instanceId).toBe('string');
      expect(JSON.stringify(snapshot)).not.toContain('instance-token-value');
      expect(JSON.stringify(snapshot)).not.toMatch(/private/i);
    });
  });
});

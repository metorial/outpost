import { base64url, Ed25519 } from '@metorial-outpost/crypto';
import {
  canonicalizeSignedHeaders,
  encodeSignatureHeader,
  generateRequestId,
  hashBody,
  OUTPOST_ID_HEADER,
  OUTPOST_INSTANCE_TOKEN_HEADER,
  OUTPOST_SIGNATURE_HEADER,
  PROTOCOL_VERSION,
  signInstanceId,
  signRegistration,
  signRequest,
  type OutpostSignatureMetadata
} from '@metorial-outpost/signature';
import { OutpostTokens } from '@metorial-outpost/tokens';
import { beforeEach, describe, expect, it } from 'vitest';
import { OUTPOST_PROTOCOL_SERVICE } from './constants';
import type { ResolvedOutpostManifest } from './manifest-types';
import { RedisChallengeStore, type RedisChallengeStoreClient } from './redis-challenge-store';
import type { InstanceRegistrationResult, ResolvedEnrollmentCredential } from './resolver';
import { createOutpostServer, type CreateOutpostServerOptions } from './server';

let OUTPOST_ID = 'otp_123';
let CREDENTIAL_ID = 'otc_456';

class FakeRedis implements RedisChallengeStoreClient {
  private store = new Map<string, string>();

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async setIfNotExists(key: string, value: string): Promise<boolean> {
    if (this.store.has(key)) return false;
    this.store.set(key, value);
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
}

let jsonRequest = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

let signCredentialInstanceId = (enrollmentPrivateKey: CryptoKey, instanceId: string) =>
  signInstanceId(enrollmentPrivateKey, {
    outpostId: OUTPOST_ID,
    credentialId: CREDENTIAL_ID,
    instanceId
  });

describe('createOutpostServer', () => {
  let enrollment: Awaited<ReturnType<typeof Ed25519.generateKeyPair>>;
  let enrollmentPublicKeyBytes: Uint8Array;
  let tokens: OutpostTokens;
  let credentialStatus: ResolvedEnrollmentCredential;
  let manifestStatus: ResolvedOutpostManifest;
  let registered: any[];
  let registrationResult: InstanceRegistrationResult;
  let manifestRequests: any[];
  let credentialRequests: any[];

  beforeEach(async () => {
    enrollment = await Ed25519.generateKeyPair();
    enrollmentPublicKeyBytes = await Ed25519.exportPublicKey(enrollment.publicKey);

    let issuer = await Ed25519.generateKeyPair();
    tokens = new OutpostTokens({
      signing: { kid: 'mik_test', privateKey: issuer.privateKey, publicKey: issuer.publicKey }
    });

    credentialStatus = { status: 'ok', publicKey: enrollmentPublicKeyBytes };
    manifestStatus = {
      status: 'ok',
      manifest: { outpost: { id: OUTPOST_ID, name: 'Test Outpost' }, access: [] }
    };
    registered = [];
    registrationResult = { services: [] };
    manifestRequests = [];
    credentialRequests = [];
  });

  let buildApp = (overrides: Partial<CreateOutpostServerOptions> = {}) =>
    createOutpostServer({
      tokens,
      resolver: {
        resolveEnrollmentCredential: async input => {
          credentialRequests.push(input);
          return credentialStatus;
        },
        resolveManifest: async input => {
          manifestRequests.push(input);
          return manifestStatus;
        },
        resolveInstanceAuthorization: async () => ({ status: 'active' }),
        onInstanceRegistered: async input => {
          registered.push(input);
          return registrationResult;
        }
      },
      ...overrides
    });

  let registerInstance = async (
    app: ReturnType<typeof createOutpostServer>,
    services?: unknown
  ) => {
    let {
      body: challengeBody,
      instance,
      instanceId,
      instancePublicKeyBytes
    } = await requestChallenge(app, services);

    let signatureInput = {
      challengeId: challengeBody.challenge_id,
      challenge: base64url.decode(challengeBody.challenge),
      outpostId: OUTPOST_ID,
      credentialId: CREDENTIAL_ID,
      instanceId,
      instancePublicKey: instancePublicKeyBytes
    };
    let signature = await signRegistration(enrollment.privateKey, signatureInput);
    let instanceSignature = await signRegistration(instance.privateKey, signatureInput);
    let credentialInstanceIdSignature = await signCredentialInstanceId(
      enrollment.privateKey,
      instanceId
    );

    let registerRes = await app.request(
      jsonRequest('/outpost/register', {
        version: 1,
        challenge_id: challengeBody.challenge_id,
        signature,
        instance_signature: instanceSignature,
        credential_instance_id_signature: credentialInstanceIdSignature
      })
    );
    let registerBody = await registerRes.json();

    return {
      instanceId,
      instancePrivateKey: instance.privateKey,
      instanceToken: registerBody.instance_token,
      registerBody
    };
  };

  let signedGet = async (
    path: string,
    reg: { instanceId: string; instancePrivateKey: CryptoKey; instanceToken: string }
  ) => {
    let timestamp = Math.floor(Date.now() / 1000);
    let requestId = generateRequestId();
    let signedHeaders = canonicalizeSignedHeaders({}, []);

    let signature = await signRequest(reg.instancePrivateKey, {
      version: PROTOCOL_VERSION,
      outpostId: OUTPOST_ID,
      instanceId: reg.instanceId,
      timestamp,
      requestId,
      service: OUTPOST_PROTOCOL_SERVICE,
      method: 'GET',
      scheme: 'http',
      authority: 'localhost',
      path,
      query: '',
      signedHeaders,
      bodySha256: await hashBody(new Uint8Array(0))
    });

    let metadata: OutpostSignatureMetadata = {
      version: PROTOCOL_VERSION,
      outpost_id: OUTPOST_ID,
      timestamp,
      request_id: requestId,
      service: OUTPOST_PROTOCOL_SERVICE,
      signed_headers: [],
      signature
    };

    return new Request(`http://localhost${path}`, {
      headers: {
        [OUTPOST_ID_HEADER]: OUTPOST_ID,
        [OUTPOST_INSTANCE_TOKEN_HEADER]: reg.instanceToken,
        [OUTPOST_SIGNATURE_HEADER]: encodeSignatureHeader(metadata)
      }
    });
  };

  let requestChallenge = async (
    app: ReturnType<typeof createOutpostServer>,
    services?: unknown
  ) => {
    let instance = await Ed25519.generateKeyPair();
    let instanceId = 'oti_789';
    let instancePublicKeyBytes = await Ed25519.exportPublicKey(instance.publicKey);

    let res = await app.request(
      jsonRequest('/outpost/register/challenge', {
        version: 1,
        outpost_id: OUTPOST_ID,
        credential_id: CREDENTIAL_ID,
        instance_id: instanceId,
        instance_public_key: base64url.encode(instancePublicKeyBytes),
        ...(services === undefined ? {} : { services })
      })
    );

    return { res, body: await res.json(), instance, instanceId, instancePublicKeyBytes };
  };

  it('completes the full challenge/register flow and issues a verifiable Instance Token', async () => {
    let app = buildApp();
    let {
      res: challengeRes,
      body: challengeBody,
      instance,
      instanceId,
      instancePublicKeyBytes
    } = await requestChallenge(app);

    expect(challengeRes.status).toBe(200);
    expect(challengeBody.challenge_id).toMatch(/^och_/);

    let signatureInput = {
      challengeId: challengeBody.challenge_id,
      challenge: base64url.decode(challengeBody.challenge),
      outpostId: OUTPOST_ID,
      credentialId: CREDENTIAL_ID,
      instanceId,
      instancePublicKey: instancePublicKeyBytes
    };
    let signature = await signRegistration(enrollment.privateKey, signatureInput);
    let instanceSignature = await signRegistration(instance.privateKey, signatureInput);
    let credentialInstanceIdSignature = await signCredentialInstanceId(
      enrollment.privateKey,
      instanceId
    );

    let registerRes = await app.request(
      jsonRequest('/outpost/register', {
        version: 1,
        challenge_id: challengeBody.challenge_id,
        signature,
        instance_signature: instanceSignature,
        credential_instance_id_signature: credentialInstanceIdSignature
      })
    );
    let registerBody = await registerRes.json();

    expect(registerRes.status).toBe(200);
    expect(typeof registerBody.instance_token).toBe('string');
    expect(registered).toEqual([
      {
        outpostId: OUTPOST_ID,
        credentialId: CREDENTIAL_ID,
        instanceId,
        instancePublicKey: instancePublicKeyBytes,
        requestedServices: []
      }
    ]);

    let verified = await tokens.verify({
      token: registerBody.instance_token,
      expectedType: 'metorial-outpost-instance'
    });
    expect(verified.verified).toBe(true);
    if (verified.verified) {
      expect(verified.data.outpost_id).toBe(OUTPOST_ID);
      expect(verified.data.instance_id).toBe(instanceId);
      expect(verified.data.instance_public_key).toBe(base64url.encode(instancePublicKeyBytes));
      expect(verified.data.credential_instance_id_signature).toBe(
        credentialInstanceIdSignature
      );
    }

    void instance;
  });

  it('rejects a challenge request for an unknown credential', async () => {
    credentialStatus = { status: 'unknown' };
    let app = buildApp();
    let { res, body } = await requestChallenge(app);

    expect(res.status).toBe(404);
    expect(body.error).toBe('unknown_outpost_credential');
  });

  it('rejects a challenge request for a revoked credential', async () => {
    credentialStatus = { status: 'revoked' };
    let app = buildApp();
    let { res, body } = await requestChallenge(app);

    expect(res.status).toBe(403);
    expect(body.error).toBe('revoked_outpost_credential');
  });

  it('rejects a challenge request when the Outpost disallows registration', async () => {
    credentialStatus = {
      status: 'registration_disabled',
      publicKey: enrollmentPublicKeyBytes
    };
    let app = buildApp();
    let { res, body } = await requestChallenge(app);

    expect(res.status).toBe(403);
    expect(body.error).toBe('registration_disabled');
  });

  it('rejects registration with an unknown challenge id', async () => {
    let app = buildApp();

    let res = await app.request(
      jsonRequest('/outpost/register', {
        version: 1,
        challenge_id: 'och_does_not_exist',
        signature: base64url.encode(new Uint8Array(64)),
        instance_signature: base64url.encode(new Uint8Array(64)),
        credential_instance_id_signature: base64url.encode(new Uint8Array(64))
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_challenge');
  });

  it('rejects registration once a challenge has expired', async () => {
    let app = buildApp({ challengeTtlMs: -1_000 });
    let {
      body: challengeBody,
      instance,
      instanceId,
      instancePublicKeyBytes
    } = await requestChallenge(app);

    let signatureInput = {
      challengeId: challengeBody.challenge_id,
      challenge: base64url.decode(challengeBody.challenge),
      outpostId: OUTPOST_ID,
      credentialId: CREDENTIAL_ID,
      instanceId,
      instancePublicKey: instancePublicKeyBytes
    };
    let signature = await signRegistration(enrollment.privateKey, signatureInput);
    let instanceSignature = await signRegistration(instance.privateKey, signatureInput);

    let res = await app.request(
      jsonRequest('/outpost/register', {
        version: 1,
        challenge_id: challengeBody.challenge_id,
        signature,
        instance_signature: instanceSignature,
        credential_instance_id_signature: base64url.encode(new Uint8Array(64))
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('expired_challenge');
  });

  it('rejects a challenge that has already been consumed', async () => {
    let app = buildApp();
    let {
      body: challengeBody,
      instance,
      instanceId,
      instancePublicKeyBytes
    } = await requestChallenge(app);

    let signatureInput = {
      challengeId: challengeBody.challenge_id,
      challenge: base64url.decode(challengeBody.challenge),
      outpostId: OUTPOST_ID,
      credentialId: CREDENTIAL_ID,
      instanceId,
      instancePublicKey: instancePublicKeyBytes
    };
    let signature = await signRegistration(enrollment.privateKey, signatureInput);
    let instanceSignature = await signRegistration(instance.privateKey, signatureInput);
    let credentialInstanceIdSignature = await signCredentialInstanceId(
      enrollment.privateKey,
      instanceId
    );

    let registerPayload = jsonRequest('/outpost/register', {
      version: 1,
      challenge_id: challengeBody.challenge_id,
      signature,
      instance_signature: instanceSignature,
      credential_instance_id_signature: credentialInstanceIdSignature
    });

    let first = await app.request(registerPayload.clone());
    expect(first.status).toBe(200);

    let second = await app.request(registerPayload);
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe('consumed_challenge');
  });

  it('rejects an invalid registration signature', async () => {
    let app = buildApp();
    let { body: challengeBody, instance } = await requestChallenge(app);

    let otherKeyPair = await Ed25519.generateKeyPair();
    let signatureInput = {
      challengeId: challengeBody.challenge_id,
      challenge: base64url.decode(challengeBody.challenge),
      outpostId: OUTPOST_ID,
      credentialId: CREDENTIAL_ID,
      instanceId: challengeBody.instance_id,
      instancePublicKey: base64url.decode(challengeBody.instance_public_key)
    };
    let badSignature = await signRegistration(otherKeyPair.privateKey, signatureInput);
    let instanceSignature = await signRegistration(instance.privateKey, signatureInput);

    let res = await app.request(
      jsonRequest('/outpost/register', {
        version: 1,
        challenge_id: challengeBody.challenge_id,
        signature: badSignature,
        instance_signature: instanceSignature,
        credential_instance_id_signature: base64url.encode(new Uint8Array(64))
      })
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_registration_signature');
  });

  it('rejects an invalid instance signature', async () => {
    let app = buildApp();
    let {
      body: challengeBody,
      instanceId,
      instancePublicKeyBytes
    } = await requestChallenge(app);

    let signatureInput = {
      challengeId: challengeBody.challenge_id,
      challenge: base64url.decode(challengeBody.challenge),
      outpostId: OUTPOST_ID,
      credentialId: CREDENTIAL_ID,
      instanceId,
      instancePublicKey: instancePublicKeyBytes
    };
    let signature = await signRegistration(enrollment.privateKey, signatureInput);

    let otherKeyPair = await Ed25519.generateKeyPair();
    let badInstanceSignature = await signRegistration(otherKeyPair.privateKey, signatureInput);

    let res = await app.request(
      jsonRequest('/outpost/register', {
        version: 1,
        challenge_id: challengeBody.challenge_id,
        signature,
        instance_signature: badInstanceSignature,
        credential_instance_id_signature: base64url.encode(new Uint8Array(64))
      })
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_instance_signature');
  });

  it('rejects an invalid credential instance-id signature', async () => {
    let app = buildApp();
    let {
      body: challengeBody,
      instance,
      instanceId,
      instancePublicKeyBytes
    } = await requestChallenge(app);

    let signatureInput = {
      challengeId: challengeBody.challenge_id,
      challenge: base64url.decode(challengeBody.challenge),
      outpostId: OUTPOST_ID,
      credentialId: CREDENTIAL_ID,
      instanceId,
      instancePublicKey: instancePublicKeyBytes
    };
    let signature = await signRegistration(enrollment.privateKey, signatureInput);
    let instanceSignature = await signRegistration(instance.privateKey, signatureInput);

    let otherKeyPair = await Ed25519.generateKeyPair();
    let badCredentialInstanceIdSignature = await signCredentialInstanceId(
      otherKeyPair.privateKey,
      instanceId
    );

    let res = await app.request(
      jsonRequest('/outpost/register', {
        version: 1,
        challenge_id: challengeBody.challenge_id,
        signature,
        instance_signature: instanceSignature,
        credential_instance_id_signature: badCredentialInstanceIdSignature
      })
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_credential_signature');
  });

  it('rejects a malformed challenge request body', async () => {
    let app = buildApp();
    let res = await app.request(jsonRequest('/outpost/register/challenge', { version: 1 }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_request');
  });

  it('completes the full flow with a RedisChallengeStore in place of the in-memory default', async () => {
    let app = buildApp({
      challengeStore: new RedisChallengeStore({ client: new FakeRedis() })
    });
    let {
      body: challengeBody,
      instance,
      instanceId,
      instancePublicKeyBytes
    } = await requestChallenge(app);

    let signatureInput = {
      challengeId: challengeBody.challenge_id,
      challenge: base64url.decode(challengeBody.challenge),
      outpostId: OUTPOST_ID,
      credentialId: CREDENTIAL_ID,
      instanceId,
      instancePublicKey: instancePublicKeyBytes
    };
    let signature = await signRegistration(enrollment.privateKey, signatureInput);
    let instanceSignature = await signRegistration(instance.privateKey, signatureInput);
    let credentialInstanceIdSignature = await signCredentialInstanceId(
      enrollment.privateKey,
      instanceId
    );

    let res = await app.request(
      jsonRequest('/outpost/register', {
        version: 1,
        challenge_id: challengeBody.challenge_id,
        signature,
        instance_signature: instanceSignature,
        credential_instance_id_signature: credentialInstanceIdSignature
      })
    );

    expect(res.status).toBe(200);
    expect(typeof (await res.json()).instance_token).toBe('string');
  });

  describe('GET /outpost/public-key/:outpostId/:credentialId', () => {
    it('returns the public key for a known credential', async () => {
      let app = buildApp();
      let reg = await registerInstance(app);

      let res = await app.request(
        await signedGet(`/outpost/public-key/${OUTPOST_ID}/${CREDENTIAL_ID}`, reg)
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        outpost_id: OUTPOST_ID,
        credential_id: CREDENTIAL_ID,
        public_key: base64url.encode(enrollmentPublicKeyBytes)
      });
    });

    it('rejects an unauthenticated request', async () => {
      let app = buildApp();

      let res = await app.request(
        `http://localhost/outpost/public-key/${OUTPOST_ID}/${CREDENTIAL_ID}`
      );

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('missing_authentication');
    });

    it('rejects an unknown credential', async () => {
      let app = buildApp();
      let reg = await registerInstance(app);
      credentialStatus = { status: 'unknown' };

      let res = await app.request(
        await signedGet(`/outpost/public-key/${OUTPOST_ID}/${CREDENTIAL_ID}`, reg)
      );

      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('unknown_outpost_credential');
    });

    it('rejects a revoked credential', async () => {
      let app = buildApp();
      let reg = await registerInstance(app);
      credentialStatus = { status: 'revoked' };

      let res = await app.request(
        await signedGet(`/outpost/public-key/${OUTPOST_ID}/${CREDENTIAL_ID}`, reg)
      );

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('revoked_outpost_credential');
    });
  });

  describe('GET /outpost/manifest/:outpostId', () => {
    it('returns the manifest for a known outpost', async () => {
      let app = buildApp();
      let reg = await registerInstance(app);

      let res = await app.request(await signedGet(`/outpost/manifest/${OUTPOST_ID}`, reg));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(
        manifestStatus.status == 'ok' ? manifestStatus.manifest : null
      );
    });

    it('rejects an unauthenticated request', async () => {
      let app = buildApp();

      let res = await app.request(`http://localhost/outpost/manifest/${OUTPOST_ID}`);

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('missing_authentication');
    });

    it('rejects an unknown outpost', async () => {
      let app = buildApp();
      let reg = await registerInstance(app);
      manifestStatus = { status: 'unknown' };

      let res = await app.request(await signedGet(`/outpost/manifest/${OUTPOST_ID}`, reg));

      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('unknown_outpost');
    });
  });

  describe('capability handshake', () => {
    it('forwards the declared services, versions, and capabilities to the resolver', async () => {
      let app = buildApp();

      await registerInstance(app, [
        { id: 'outpost_registration_proxy', version: '1.2.0', capabilities: { nested: true } },
        { id: 'mcp_connection_proxy' }
      ]);

      expect(registered[0].requestedServices).toEqual([
        { id: 'outpost_registration_proxy', version: '1.2.0', capabilities: { nested: true } },
        { id: 'mcp_connection_proxy' }
      ]);
    });

    it('returns both granted and denied services, but only signs the granted ids', async () => {
      registrationResult = {
        services: [
          { id: 'outpost_registration_proxy', granted: true },
          { id: 'mcp_connection_proxy', granted: false }
        ]
      };
      let app = buildApp();

      let { registerBody } = await registerInstance(app, [
        { id: 'outpost_registration_proxy' },
        { id: 'mcp_connection_proxy' }
      ]);

      expect(registerBody.services).toEqual(registrationResult.services);

      let verified = await tokens.verify({
        token: registerBody.instance_token,
        expectedType: 'metorial-outpost-instance'
      });
      expect(verified.verified).toBe(true);
      if (verified.verified) {
        expect(verified.data.services).toEqual(['outpost_registration_proxy']);
      }
    });

    it('exposes the granted services on authenticated requests', async () => {
      registrationResult = {
        services: [
          { id: 'outpost_registration_proxy', granted: true },
          { id: 'mcp_connection_proxy', granted: false }
        ]
      };
      let app = buildApp();
      let reg = await registerInstance(app, [
        { id: 'outpost_registration_proxy' },
        { id: 'mcp_connection_proxy' }
      ]);

      let res = await app.request(await signedGet(`/outpost/manifest/${OUTPOST_ID}`, reg));

      expect(res.status).toBe(200);
      expect(manifestRequests.at(-1).requestedBy.grantedServices).toEqual([
        'outpost_registration_proxy'
      ]);
    });

    it('rejects a challenge whose services are malformed', async () => {
      let app = buildApp();
      let { res, body } = await requestChallenge(app, [{ version: '1.0.0' }]);

      expect(res.status).toBe(400);
      expect(body.error).toBe('invalid_request');
    });
  });

  describe('instance token issuance', () => {
    it('signs with the per-registration signer when one is configured', async () => {
      let accountKeyPair = await Ed25519.generateKeyPair();
      let accountTokens = new OutpostTokens({
        signing: {
          kid: 'otkp_account',
          privateKey: accountKeyPair.privateKey,
          publicKey: accountKeyPair.publicKey
        }
      });
      let signerCalls: any[] = [];

      let app = buildApp({
        signer: async input => {
          signerCalls.push(input);
          return accountTokens;
        }
      });

      let { registerBody, instanceId } = await registerInstance(app);

      expect(signerCalls).toEqual([
        { outpostId: OUTPOST_ID, credentialId: CREDENTIAL_ID, instanceId }
      ]);

      // The default `tokens` must not be able to verify a token signed by the account keypair.
      expect(
        (
          await tokens.verify({
            token: registerBody.instance_token,
            expectedType: 'metorial-outpost-instance'
          })
        ).verified
      ).toBe(false);
      expect(
        (
          await accountTokens.verify({
            token: registerBody.instance_token,
            expectedType: 'metorial-outpost-instance'
          })
        ).verified
      ).toBe(true);
    });

    it('prefers the expiry reported by the resolver over the configured fallback', async () => {
      let resolverExpiry = new Date(Date.now() + 5 * 60_000);
      registrationResult = { services: [], instanceTokenExpiresAt: resolverExpiry };

      let app = buildApp({
        instanceTokenExpiresAt: () => new Date(Date.now() + 60 * 60_000)
      });

      let { registerBody } = await registerInstance(app);

      expect(registerBody.expires_at).toBe(Math.floor(resolverExpiry.getTime() / 1000));
    });

    it('falls back to the configured expiry when the resolver reports none', async () => {
      let fallback = new Date(Date.now() + 60 * 60_000);
      let app = buildApp({ instanceTokenExpiresAt: () => fallback });

      let { registerBody } = await registerInstance(app);

      expect(registerBody.expires_at).toBe(Math.floor(fallback.getTime() / 1000));
    });
  });

  describe('account-family scoping', () => {
    it('passes the authenticated requester to the manifest resolver', async () => {
      let app = buildApp();
      let reg = await registerInstance(app);

      await app.request(await signedGet(`/outpost/manifest/${OUTPOST_ID}`, reg));

      expect(manifestRequests.at(-1)).toMatchObject({
        outpostId: OUTPOST_ID,
        requestedBy: { outpostId: OUTPOST_ID, instanceId: reg.instanceId }
      });
    });

    it('passes the authenticated requester to the public-key resolver', async () => {
      let app = buildApp();
      let reg = await registerInstance(app);

      await app.request(
        await signedGet(`/outpost/public-key/${OUTPOST_ID}/${CREDENTIAL_ID}`, reg)
      );

      expect(credentialRequests.at(-1)).toMatchObject({
        outpostId: OUTPOST_ID,
        credentialId: CREDENTIAL_ID,
        requestedBy: { outpostId: OUTPOST_ID }
      });
    });

    it('reports an out-of-family manifest as unknown rather than leaking its existence', async () => {
      let app = buildApp();
      let reg = await registerInstance(app);
      // Stands in for the resolver's family check rejecting a sibling-account outpost.
      manifestStatus = { status: 'unknown' };

      let res = await app.request(await signedGet('/outpost/manifest/otp_other', reg));

      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('unknown_outpost');
    });

    it('does not scope the register and challenge routes to a requester', async () => {
      let app = buildApp();
      await registerInstance(app);

      expect(credentialRequests.every(request => request.requestedBy === undefined)).toBe(
        true
      );
    });
  });

  describe('GET /outpost/issuer-key/:kid', () => {
    it('returns the issuer public key for a known kid', async () => {
      let app = buildApp();

      let res = await app.request('http://localhost/outpost/issuer-key/mik_test');

      expect(res.status).toBe(200);
      let body = await res.json();
      expect(body.kid).toBe('mik_test');
      expect(typeof body.public_key).toBe('string');
    });

    it('rejects an unknown kid', async () => {
      let app = buildApp();

      let res = await app.request('http://localhost/outpost/issuer-key/mik_unknown');

      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('unknown_issuer_key');
    });

    it('is reachable with no Metorial-Outpost-Signature header', async () => {
      let app = buildApp();

      let res = await app.request('http://localhost/outpost/issuer-key/mik_test', {
        headers: {}
      });

      expect(res.status).toBe(200);
    });
  });

  let signedRelayPost = async (
    path: string,
    reg: { instanceId: string; instancePrivateKey: CryptoKey; instanceToken: string },
    body: unknown,
    proxyContext?: Record<string, string>
  ) => {
    let headers = { 'content-type': 'application/json' };
    let signedHeaders = canonicalizeSignedHeaders(headers, Object.keys(headers));
    let timestamp = Math.floor(Date.now() / 1000);
    let requestId = generateRequestId();
    let bodyBytes = new TextEncoder().encode(JSON.stringify(body));

    let signature = await signRequest(reg.instancePrivateKey, {
      version: PROTOCOL_VERSION,
      outpostId: OUTPOST_ID,
      instanceId: reg.instanceId,
      timestamp,
      requestId,
      service: OUTPOST_PROTOCOL_SERVICE,
      method: 'POST',
      scheme: 'http',
      authority: 'localhost',
      path,
      query: '',
      signedHeaders,
      bodySha256: await hashBody(bodyBytes),
      proxyContext
    });

    let metadata: OutpostSignatureMetadata = {
      version: PROTOCOL_VERSION,
      outpost_id: OUTPOST_ID,
      timestamp,
      request_id: requestId,
      service: OUTPOST_PROTOCOL_SERVICE,
      signed_headers: signedHeaders.map(header => header.name),
      signature,
      proxy_context: proxyContext
    };

    return new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        ...headers,
        [OUTPOST_ID_HEADER]: OUTPOST_ID,
        [OUTPOST_INSTANCE_TOKEN_HEADER]: reg.instanceToken,
        [OUTPOST_SIGNATURE_HEADER]: encodeSignatureHeader(metadata)
      },
      body: JSON.stringify(body)
    });
  };

  describe('POST /outpost/register -- relayed through a nested Outpost', () => {
    it("persists the relaying Outpost's signed proxy_context.ip instead of its own connecting peer", async () => {
      let app = buildApp();
      let relay = await registerInstance(app);

      let {
        body: challengeBody,
        instance,
        instanceId,
        instancePublicKeyBytes
      } = await requestChallenge(app);
      let signatureInput = {
        challengeId: challengeBody.challenge_id,
        challenge: base64url.decode(challengeBody.challenge),
        outpostId: OUTPOST_ID,
        credentialId: CREDENTIAL_ID,
        instanceId,
        instancePublicKey: instancePublicKeyBytes
      };
      let registerBody = {
        version: 1,
        challenge_id: challengeBody.challenge_id,
        signature: await signRegistration(enrollment.privateKey, signatureInput),
        instance_signature: await signRegistration(instance.privateKey, signatureInput),
        credential_instance_id_signature: await signCredentialInstanceId(
          enrollment.privateKey,
          instanceId
        )
      };

      let res = await app.request(
        await signedRelayPost('/outpost/register', relay, registerBody, { ip: '203.0.113.9' })
      );

      expect(res.status).toBe(200);
      expect(registered.at(-1)?.context).toEqual({ ip: '203.0.113.9' });
    });

    it('does not attach a context when the direct registration carries no Outpost signature', async () => {
      let app = buildApp();
      await registerInstance(app);

      expect(registered.at(-1)?.context).toBeUndefined();
    });

    it("rejects a registration relayed with a signature that doesn't verify", async () => {
      let app = buildApp();
      let relay = await registerInstance(app);

      let req = await signedRelayPost(
        '/outpost/register',
        relay,
        { version: 1 },
        {
          ip: '203.0.113.9'
        }
      );
      let tampered = new Request(req, {
        headers: { ...Object.fromEntries(req.headers), [OUTPOST_ID_HEADER]: 'otp_other' }
      });

      let res = await app.request(tampered);

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('outpost_mismatch');
    });
  });

  describe('POST /outpost/register/challenge -- relayed through a nested Outpost', () => {
    it('accepts a challenge relayed with a valid Outpost signature', async () => {
      let app = buildApp();
      let relay = await registerInstance(app);
      let newInstance = await Ed25519.generateKeyPair();

      let req = await signedRelayPost(
        '/outpost/register/challenge',
        relay,
        {
          version: 1,
          outpost_id: OUTPOST_ID,
          credential_id: CREDENTIAL_ID,
          instance_id: 'oti_new',
          instance_public_key: base64url.encode(
            await Ed25519.exportPublicKey(newInstance.publicKey)
          )
        },
        { ip: '203.0.113.9' }
      );

      let res = await app.request(req);

      expect(res.status).toBe(200);
      expect((await res.json()).challenge_id).toMatch(/^och_/);
    });

    it("rejects a challenge relayed with a signature that doesn't verify", async () => {
      let app = buildApp();
      let relay = await registerInstance(app);

      let req = await signedRelayPost(
        '/outpost/register/challenge',
        relay,
        { version: 1 },
        {
          ip: '203.0.113.9'
        }
      );
      let tampered = new Request(req, {
        headers: { ...Object.fromEntries(req.headers), [OUTPOST_ID_HEADER]: 'otp_other' }
      });

      let res = await app.request(tampered);

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('outpost_mismatch');
    });
  });
});

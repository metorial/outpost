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
  signRequest,
  type OutpostSignatureMetadata
} from '@metorial-outpost/signature';
import { OutpostTokens } from '@metorial-outpost/tokens';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { authenticateOutpostRequest, verifyOutpostRequest } from './authenticate';
import { INSTANCE_TOKEN_TYPE } from './constants';
import { OutpostServerError } from './errors';
import type { ResolvedEnrollmentCredential, ResolvedInstanceAuthorization } from './resolver';

let SERVICE = 'metorial.proxy';
let OUTPOST_ID = 'otp_123';
let INSTANCE_ID = 'oti_789';
let CREDENTIAL_ID = 'otc_456';

describe('authenticate', () => {
  let issuer: Awaited<ReturnType<typeof Ed25519.generateKeyPair>>;
  let instance: Awaited<ReturnType<typeof Ed25519.generateKeyPair>>;
  let enrollment: Awaited<ReturnType<typeof Ed25519.generateKeyPair>>;
  let enrollmentPublicKeyBytes: Uint8Array;
  let tokens: OutpostTokens;
  let instanceToken: string;

  beforeEach(async () => {
    issuer = await Ed25519.generateKeyPair();
    instance = await Ed25519.generateKeyPair();
    enrollment = await Ed25519.generateKeyPair();
    enrollmentPublicKeyBytes = await Ed25519.exportPublicKey(enrollment.publicKey);

    tokens = new OutpostTokens({
      signing: { kid: 'mik_test', privateKey: issuer.privateKey, publicKey: issuer.publicKey }
    });

    let credentialInstanceIdSignature = await signInstanceId(enrollment.privateKey, {
      outpostId: OUTPOST_ID,
      credentialId: CREDENTIAL_ID,
      instanceId: INSTANCE_ID
    });

    instanceToken = await tokens.sign({
      type: INSTANCE_TOKEN_TYPE,
      data: {
        outpost_id: OUTPOST_ID,
        instance_id: INSTANCE_ID,
        credential_id: CREDENTIAL_ID,
        instance_public_key: base64url.encode(
          await Ed25519.exportPublicKey(instance.publicKey)
        ),
        credential_instance_id_signature: credentialInstanceIdSignature
      }
    });
  });

  let defaultResolveEnrollmentCredential =
    async (): Promise<ResolvedEnrollmentCredential> => ({
      status: 'ok',
      publicKey: enrollmentPublicKeyBytes
    });

  let buildRequest = async (
    overrides: {
      metadataOverrides?: Partial<OutpostSignatureMetadata>;
      omitOutpostIdHeader?: boolean;
      omitSignatureHeader?: boolean;
      omitInstanceTokenHeader?: boolean;
      instanceTokenOverride?: string;
      signWithInstanceKey?: CryptoKey;
      path?: string;
      method?: string;
      body?: string;
      scheme?: string;
      authority?: string;
      forwardedHeaders?: Record<string, string>;
    } = {}
  ) => {
    let method = overrides.method ?? 'GET';
    let path = overrides.path ?? '/test';
    let body = overrides.body ?? '';
    let bodyBytes = new TextEncoder().encode(body);

    let timestamp = Math.floor(Date.now() / 1000);
    let requestId = generateRequestId();
    let signedHeaders = canonicalizeSignedHeaders({}, []);

    let signatureInput = {
      version: PROTOCOL_VERSION,
      outpostId: OUTPOST_ID,
      instanceId: INSTANCE_ID,
      timestamp,
      requestId,
      service: SERVICE,
      method,
      scheme: overrides.scheme ?? 'http',
      authority: overrides.authority ?? 'localhost',
      path,
      query: '',
      signedHeaders,
      bodySha256: await hashBody(bodyBytes)
    };

    let signature = await signRequest(
      overrides.signWithInstanceKey ?? instance.privateKey,
      signatureInput
    );

    let metadata: OutpostSignatureMetadata = {
      version: PROTOCOL_VERSION,
      outpost_id: OUTPOST_ID,
      timestamp,
      request_id: requestId,
      service: SERVICE,
      signed_headers: signedHeaders.map(h => h.name),
      signature,
      ...overrides.metadataOverrides
    };

    let headers: Record<string, string> = {};
    if (!overrides.omitOutpostIdHeader) headers[OUTPOST_ID_HEADER] = OUTPOST_ID;
    if (!overrides.omitSignatureHeader) {
      headers[OUTPOST_SIGNATURE_HEADER] = encodeSignatureHeader(metadata);
    }
    if (!overrides.omitInstanceTokenHeader) {
      headers[OUTPOST_INSTANCE_TOKEN_HEADER] =
        overrides.instanceTokenOverride ?? instanceToken;
    }

    Object.assign(headers, overrides.forwardedHeaders);

    return new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body || undefined
    });
  };

  let buildApp = (resolver?: {
    resolveInstanceAuthorization?: (input: any) => Promise<ResolvedInstanceAuthorization>;
    resolveEnrollmentCredential?: (input: any) => Promise<ResolvedEnrollmentCredential>;
  }) => {
    let app = new Hono();
    app.onError((error, c) => {
      if (error instanceof OutpostServerError) {
        return c.json({ error: error.code }, { status: error.status as any });
      }
      return c.json({ error: 'internal_server_error' }, 500);
    });
    let options = {
      tokens,
      service: SERVICE,
      resolver: resolver
        ? {
            resolveInstanceAuthorization:
              resolver.resolveInstanceAuthorization ??
              (async (): Promise<ResolvedInstanceAuthorization> => ({ status: 'active' })),
            resolveEnrollmentCredential:
              resolver.resolveEnrollmentCredential ?? defaultResolveEnrollmentCredential
          }
        : undefined
    } as any;
    app.get('/test', authenticateOutpostRequest(options), c =>
      c.json({ auth: c.get('outpostAuth') })
    );
    app.post('/test', authenticateOutpostRequest(options), c =>
      c.json({ auth: c.get('outpostAuth') })
    );
    return app;
  };

  it('authenticates a validly signed request', async () => {
    let app = buildApp();
    let res = await app.request(await buildRequest());

    expect(res.status).toBe(200);
    let body = await res.json();
    expect(body.auth.outpostId).toBe(OUTPOST_ID);
    expect(body.auth.instanceId).toBe(INSTANCE_ID);
    expect(body.auth.credentialId).toBe(CREDENTIAL_ID);
    expect(body.auth.service).toBe(SERVICE);
    expect(body.auth.outpostChain).toEqual([]);
  });

  it(
    'authenticates a request signed against its public https URL even though this ' +
      'process only ever sees plain HTTP behind a TLS-terminating proxy',
    async () => {
      let app = buildApp();
      let res = await app.request(
        await buildRequest({
          scheme: 'https',
          authority: 'api.metorial-staging.com',
          forwardedHeaders: {
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'api.metorial-staging.com'
          }
        })
      );

      expect(res.status).toBe(200);
    }
  );

  it('rejects a request whose signed scheme/authority do not match X-Forwarded-*', async () => {
    let app = buildApp();
    let res = await app.request(
      await buildRequest({
        scheme: 'https',
        authority: 'api.metorial-staging.com',
        forwardedHeaders: { 'x-forwarded-proto': 'http' }
      })
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_signature');
  });

  it('rejects a request missing the Metorial-Outpost-Id header', async () => {
    let app = buildApp();
    let res = await app.request(await buildRequest({ omitOutpostIdHeader: true }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('missing_authentication');
  });

  it('rejects a request missing the Metorial-Outpost-Signature header', async () => {
    let app = buildApp();
    let res = await app.request(await buildRequest({ omitSignatureHeader: true }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('missing_authentication');
  });

  it('rejects a request missing the Metorial-Outpost-Instance-Token header', async () => {
    let app = buildApp();
    let res = await app.request(await buildRequest({ omitInstanceTokenHeader: true }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('missing_authentication');
  });

  it('rejects malformed signature metadata', async () => {
    let app = buildApp();
    let req = new Request('http://localhost/test', {
      headers: {
        [OUTPOST_ID_HEADER]: OUTPOST_ID,
        [OUTPOST_INSTANCE_TOKEN_HEADER]: instanceToken,
        [OUTPOST_SIGNATURE_HEADER]: 'not-base64url-json'
      }
    });

    let res = await app.request(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('malformed_signature_header');
  });

  it('rejects an unsupported version', async () => {
    let app = buildApp();
    let res = await app.request(await buildRequest({ metadataOverrides: { version: 2 } }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('unsupported_version');
  });

  it('rejects an invalid instance token', async () => {
    let app = buildApp();
    let res = await app.request(
      await buildRequest({ instanceTokenOverride: 'garbage.v1.data.sig' })
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_instance_token');
  });

  it('rejects an instance token signed by an unknown issuer key', async () => {
    let otherIssuer = await Ed25519.generateKeyPair();
    let otherTokens = new OutpostTokens({
      signing: {
        kid: 'mik_other',
        privateKey: otherIssuer.privateKey,
        publicKey: otherIssuer.publicKey
      }
    });
    let foreignToken = await otherTokens.sign({
      type: INSTANCE_TOKEN_TYPE,
      data: {
        outpost_id: OUTPOST_ID,
        instance_id: INSTANCE_ID,
        instance_public_key: base64url.encode(
          await Ed25519.exportPublicKey(instance.publicKey)
        )
      }
    });

    let app = buildApp();
    let res = await app.request(await buildRequest({ instanceTokenOverride: foreignToken }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_instance_token');
  });

  it('rejects a header outpost_id that does not match the signed metadata', async () => {
    let app = buildApp();
    let req = await buildRequest();
    let mismatched = new Request(req, { headers: req.headers });
    mismatched.headers.set(OUTPOST_ID_HEADER, 'otp_other');

    let res = await app.request(mismatched);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('outpost_mismatch');
  });

  it('rejects a service mismatch', async () => {
    let app = buildApp();
    let res = await app.request(
      await buildRequest({ metadataOverrides: { service: 'metorial.other' } })
    );

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('service_mismatch');
  });

  it('rejects a stale request', async () => {
    let app = buildApp();
    let res = await app.request(
      await buildRequest({
        metadataOverrides: { timestamp: Math.floor(Date.now() / 1000) - 3600 }
      })
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('stale_request');
  });

  it('rejects a future-dated request', async () => {
    let app = buildApp();
    let res = await app.request(
      await buildRequest({
        metadataOverrides: { timestamp: Math.floor(Date.now() / 1000) + 3600 }
      })
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('future_request');
  });

  it('rejects a request with a required header present but not signed', async () => {
    let app = buildApp();
    let req = await buildRequest();
    let withUnsigned = new Request(req, { headers: req.headers });
    withUnsigned.headers.set('authorization', 'Bearer sneaky');

    let res = await app.request(withUnsigned);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('missing_required_signed_header');
  });

  it('rejects an invalid signature', async () => {
    let otherInstance = await Ed25519.generateKeyPair();
    let app = buildApp();
    let res = await app.request(
      await buildRequest({ signWithInstanceKey: otherInstance.privateKey })
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_signature');
  });

  describe('authorization state (spec §42 Step 5)', () => {
    it('skips the check entirely when no resolver is supplied', async () => {
      let app = buildApp();
      let res = await app.request(await buildRequest());
      expect(res.status).toBe(200);
    });

    it('passes a request when the resolver reports the instance active', async () => {
      let resolveInstanceAuthorization = async (): Promise<ResolvedInstanceAuthorization> => ({
        status: 'active'
      });
      let app = buildApp({ resolveInstanceAuthorization });
      let res = await app.request(await buildRequest());
      expect(res.status).toBe(200);
    });

    it('passes the resolver the outpost/instance/credential ids from the token', async () => {
      let seen: any;
      let resolver = {
        resolveInstanceAuthorization: async (
          input: any
        ): Promise<ResolvedInstanceAuthorization> => {
          seen = input;
          return { status: 'active' };
        }
      };
      let app = buildApp(resolver);
      await app.request(await buildRequest());

      expect(seen).toEqual({
        outpostId: OUTPOST_ID,
        instanceId: INSTANCE_ID,
        credentialId: CREDENTIAL_ID
      });
    });

    it('rejects when the resolver reports the instance disabled', async () => {
      let resolveInstanceAuthorization = async (): Promise<ResolvedInstanceAuthorization> => ({
        status: 'instance_disabled'
      });
      let app = buildApp({ resolveInstanceAuthorization });
      let res = await app.request(await buildRequest());

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('instance_disabled');
    });

    it('rejects when the resolver reports the outpost disabled', async () => {
      let resolveInstanceAuthorization = async (): Promise<ResolvedInstanceAuthorization> => ({
        status: 'outpost_disabled'
      });
      let app = buildApp({ resolveInstanceAuthorization });
      let res = await app.request(await buildRequest());

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('outpost_disabled');
    });

    it('rejects an unknown instance/credential/outpost combination as an invalid token', async () => {
      let resolveInstanceAuthorization = async (): Promise<ResolvedInstanceAuthorization> => ({
        status: 'unknown'
      });
      let app = buildApp({ resolveInstanceAuthorization });
      let res = await app.request(await buildRequest());

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('invalid_instance_token');
    });
  });

  describe('credential co-signature re-verification', () => {
    it('passes when the embedded credential-signed instance id still verifies', async () => {
      let app = buildApp({});
      let res = await app.request(await buildRequest());
      expect(res.status).toBe(200);
    });

    it('rejects once the enrollment credential is reported revoked', async () => {
      let app = buildApp({
        resolveEnrollmentCredential: async (): Promise<ResolvedEnrollmentCredential> => ({
          status: 'revoked'
        })
      });
      let res = await app.request(await buildRequest());

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('revoked_outpost_credential');
    });

    it('rejects once the enrollment credential is reported unknown', async () => {
      let app = buildApp({
        resolveEnrollmentCredential: async (): Promise<ResolvedEnrollmentCredential> => ({
          status: 'unknown'
        })
      });
      let res = await app.request(await buildRequest());

      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('unknown_outpost_credential');
    });

    it('rejects a token whose embedded credential signature does not verify against the current credential key', async () => {
      let otherEnrollment = await Ed25519.generateKeyPair();
      let app = buildApp({
        resolveEnrollmentCredential: async (): Promise<ResolvedEnrollmentCredential> => ({
          status: 'ok',
          publicKey: await Ed25519.exportPublicKey(otherEnrollment.publicKey)
        })
      });
      let res = await app.request(await buildRequest());

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('invalid_credential_signature');
    });

    it('rejects a token missing the embedded credential signature', async () => {
      let tokenWithoutCredentialSignature = await tokens.sign({
        type: INSTANCE_TOKEN_TYPE,
        data: {
          outpost_id: OUTPOST_ID,
          instance_id: INSTANCE_ID,
          credential_id: CREDENTIAL_ID,
          instance_public_key: base64url.encode(
            await Ed25519.exportPublicKey(instance.publicKey)
          )
        }
      });

      let app = buildApp({});
      let res = await app.request(
        await buildRequest({ instanceTokenOverride: tokenWithoutCredentialSignature })
      );

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('invalid_credential_signature');
    });

    it('still verifies against the credential key when registration is currently disabled', async () => {
      let app = buildApp({
        resolveEnrollmentCredential: async (): Promise<ResolvedEnrollmentCredential> => ({
          status: 'registration_disabled',
          publicKey: enrollmentPublicKeyBytes
        })
      });
      let res = await app.request(await buildRequest());

      expect(res.status).toBe(200);
    });
  });

  it('round-trips outpost_chain and proxy_context into the authenticated result', async () => {
    let app = new Hono();
    app.onError((error, c) => {
      if (error instanceof OutpostServerError) {
        return c.json({ error: error.code }, { status: error.status as any });
      }
      return c.json({ error: 'internal_server_error' }, 500);
    });
    app.get('/test', async c => {
      let authed = await verifyOutpostRequest({ tokens, service: SERVICE }, c);
      return c.json({ authed });
    });

    let timestamp = Math.floor(Date.now() / 1000);
    let requestId = generateRequestId();
    let signedHeaders = canonicalizeSignedHeaders({}, []);
    let outpostChain: [string, string][] = [
      ['otp_a', 'oti_a'],
      ['otp_b', 'oti_b']
    ];
    let proxyContext = { ip: '1.2.3.4', user_agent: 'test-agent' };

    let signature = await signRequest(instance.privateKey, {
      version: PROTOCOL_VERSION,
      outpostId: OUTPOST_ID,
      instanceId: INSTANCE_ID,
      timestamp,
      requestId,
      service: SERVICE,
      method: 'GET',
      scheme: 'http',
      authority: 'localhost',
      path: '/test',
      query: '',
      signedHeaders,
      bodySha256: await hashBody(new Uint8Array(0)),
      outpostChain,
      proxyContext
    });

    let metadata: OutpostSignatureMetadata = {
      version: PROTOCOL_VERSION,
      outpost_id: OUTPOST_ID,
      timestamp,
      request_id: requestId,
      service: SERVICE,
      signed_headers: [],
      signature,
      outpost_chain: outpostChain,
      proxy_context: proxyContext
    };

    let res = await app.request(
      new Request('http://localhost/test', {
        headers: {
          [OUTPOST_ID_HEADER]: OUTPOST_ID,
          [OUTPOST_INSTANCE_TOKEN_HEADER]: instanceToken,
          [OUTPOST_SIGNATURE_HEADER]: encodeSignatureHeader(metadata)
        }
      })
    );

    expect(res.status).toBe(200);
    let body = await res.json();
    expect(body.authed.outpostChain).toEqual(outpostChain);
    expect(body.authed.proxyContext).toEqual(proxyContext);
  });
});

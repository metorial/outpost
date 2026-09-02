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
  signRequest,
  type OutpostSignatureMetadata
} from '@metorial-outpost/signature';
import { OutpostServerError } from '@metorial-outpost/server';
import { OutpostTokens } from '@metorial-outpost/tokens';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { guardNestedOutpostAccess } from './nested-access-guard';

let SERVICE = 'metorial.proxy';
let INSTANCE_TOKEN_TYPE = 'metorial-outpost-instance';
let SELF_OUTPOST_ID = 'otp_self';

describe('guardNestedOutpostAccess', () => {
  let issuer: Awaited<ReturnType<typeof Ed25519.generateKeyPair>>;
  let tokens: OutpostTokens;

  beforeEach(async () => {
    issuer = await Ed25519.generateKeyPair();
    tokens = new OutpostTokens({
      signing: { kid: 'mik_test', privateKey: issuer.privateKey, publicKey: issuer.publicKey }
    });
  });

  let mintInstanceToken = async (
    outpostId: string,
    instanceId: string,
    instance: CryptoKeyPair
  ) =>
    tokens.sign({
      type: INSTANCE_TOKEN_TYPE,
      data: {
        outpost_id: outpostId,
        instance_id: instanceId,
        credential_id: 'otc_1',
        instance_public_key: base64url.encode(
          await Ed25519.exportPublicKey(instance.publicKey as CryptoKey)
        )
      }
    });

  let buildSignedRequest = async (opts: {
    outpostId: string;
    instanceId: string;
    instancePrivateKey: CryptoKey;
    instanceToken: string;
  }) => {
    let timestamp = Math.floor(Date.now() / 1000);
    let requestId = generateRequestId();
    let signedHeaders = canonicalizeSignedHeaders({}, []);

    let signature = await signRequest(opts.instancePrivateKey, {
      version: PROTOCOL_VERSION,
      outpostId: opts.outpostId,
      instanceId: opts.instanceId,
      timestamp,
      requestId,
      service: SERVICE,
      method: 'GET',
      scheme: 'http',
      authority: 'localhost',
      path: '/test',
      query: '',
      signedHeaders,
      bodySha256: await hashBody(new Uint8Array(0))
    });

    let metadata: OutpostSignatureMetadata = {
      version: PROTOCOL_VERSION,
      outpost_id: opts.outpostId,
      timestamp,
      request_id: requestId,
      service: SERVICE,
      signed_headers: [],
      signature
    };

    return new Request('http://localhost/test', {
      headers: {
        [OUTPOST_ID_HEADER]: opts.outpostId,
        [OUTPOST_INSTANCE_TOKEN_HEADER]: opts.instanceToken,
        [OUTPOST_SIGNATURE_HEADER]: encodeSignatureHeader(metadata)
      }
    });
  };

  let buildApp = (opts: {
    selfManifestAccess: any[];
    resolveOutpostManifest: (outpostId: string) => Promise<any>;
  }) => {
    let app = new Hono();
    app.onError((error, c) => {
      if (error instanceof OutpostServerError) {
        return c.json({ error: error.code }, { status: error.status as any });
      }
      return c.json({ error: 'internal_server_error' }, 500);
    });
    app.get(
      '/test',
      guardNestedOutpostAccess({
        tokens,
        service: SERVICE,
        selfOutpostId: SELF_OUTPOST_ID,
        selfManifest: {
          current: () => ({
            outpost: { id: SELF_OUTPOST_ID, name: 'Self' },
            access: opts.selfManifestAccess
          })
        },
        resolveOutpostManifest: opts.resolveOutpostManifest
      }),
      c => c.json({ ok: true, auth: c.get('outpostAuth' as never) })
    );
    return app;
  };

  it('passes a plain client request through untouched (no Outpost signature at all)', async () => {
    let app = buildApp({
      selfManifestAccess: [],
      resolveOutpostManifest: async () => undefined
    });

    let res = await app.request('http://localhost/test');
    expect(res.status).toBe(200);
  });

  it('passes through without a manifest check when the request is from this Outpost’s own Instance', async () => {
    let instance = (await Ed25519.generateKeyPair()) as unknown as CryptoKeyPair;
    let token = await mintInstanceToken(SELF_OUTPOST_ID, 'oti_1', instance);

    let resolveOutpostManifest = async () => {
      throw new Error('should not be called for a non-nested request');
    };

    let app = buildApp({ selfManifestAccess: [], resolveOutpostManifest });
    let res = await app.request(
      await buildSignedRequest({
        outpostId: SELF_OUTPOST_ID,
        instanceId: 'oti_1',
        instancePrivateKey: instance.privateKey as CryptoKey,
        instanceToken: token
      })
    );

    expect(res.status).toBe(200);
  });

  it('allows a nested Outpost whose manifest access is a subset of this Outpost’s own', async () => {
    let instance = (await Ed25519.generateKeyPair()) as unknown as CryptoKeyPair;
    let childOutpostId = 'otp_child';
    let token = await mintInstanceToken(childOutpostId, 'oti_child', instance);

    let compartment = {
      organizationId: 'org_1',
      projectId: 'proj_1',
      instanceId: 'ins_1'
    };
    let app = buildApp({
      selfManifestAccess: [{ compartment, services: [{ id: 'svc_a' }, { id: 'svc_b' }] }],
      resolveOutpostManifest: async outpostId => {
        expect(outpostId).toBe(childOutpostId);
        return {
          outpost: { id: childOutpostId, name: 'Child' },
          access: [{ compartment, services: [{ id: 'svc_a' }] }]
        };
      }
    });

    let res = await app.request(
      await buildSignedRequest({
        outpostId: childOutpostId,
        instanceId: 'oti_child',
        instancePrivateKey: instance.privateKey as CryptoKey,
        instanceToken: token
      })
    );

    expect(res.status).toBe(200);
    expect((await res.json()).auth.outpostId).toBe(childOutpostId);
  });

  it('rejects a nested Outpost claiming more access than this Outpost grants', async () => {
    let instance = (await Ed25519.generateKeyPair()) as unknown as CryptoKeyPair;
    let childOutpostId = 'otp_child';
    let token = await mintInstanceToken(childOutpostId, 'oti_child', instance);

    let compartment = {
      organizationId: 'org_1',
      projectId: 'proj_1',
      instanceId: 'ins_1'
    };
    let app = buildApp({
      selfManifestAccess: [{ compartment, services: [{ id: 'svc_a' }] }],
      resolveOutpostManifest: async () => ({
        outpost: { id: childOutpostId, name: 'Child' },
        access: [{ compartment, services: [{ id: 'svc_a' }, { id: 'svc_b' }] }]
      })
    });

    let res = await app.request(
      await buildSignedRequest({
        outpostId: childOutpostId,
        instanceId: 'oti_child',
        instancePrivateKey: instance.privateKey as CryptoKey,
        instanceToken: token
      })
    );

    expect(res.status).toBe(403);
  });

  it('rejects when the nested Outpost’s manifest cannot be resolved', async () => {
    let instance = (await Ed25519.generateKeyPair()) as unknown as CryptoKeyPair;
    let childOutpostId = 'otp_child';
    let token = await mintInstanceToken(childOutpostId, 'oti_child', instance);

    let app = buildApp({
      selfManifestAccess: [],
      resolveOutpostManifest: async () => undefined
    });

    let res = await app.request(
      await buildSignedRequest({
        outpostId: childOutpostId,
        instanceId: 'oti_child',
        instancePrivateKey: instance.privateKey as CryptoKey,
        instanceToken: token
      })
    );

    expect(res.status).toBe(404);
  });
});

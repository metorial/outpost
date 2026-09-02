import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import { base64url, Ed25519 } from '@metorial-outpost/crypto';
import {
  INSTANCE_TOKEN_TYPE,
  OUTPOST_PROTOCOL_SERVICE,
  OutpostServerError
} from '@metorial-outpost/server';
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
  type OutpostProxyContext,
  type OutpostSignatureMetadata
} from '@metorial-outpost/signature';
import { OutpostTokens } from '@metorial-outpost/tokens';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { challengeHandler, type ChallengeHandlerDeps } from './challenge';

let buildFetchMock = () => {
  let calls: [
    string,
    RequestInit & { service?: string; proxyContext?: OutpostProxyContext }
  ][] = [];
  let fetch: OutpostFetchFunction = vi.fn(async (input, init) => {
    calls.push([input as string, init as any]);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' }
    });
  }) as unknown as OutpostFetchFunction;
  return { fetch, calls };
};

let mountApp = (deps: ChallengeHandlerDeps) => {
  let app = new Hono();
  app.onError((error, c) => {
    if (error instanceof OutpostServerError) {
      return c.json({ error: error.code }, { status: error.status as any });
    }
    return c.json({ error: 'internal_server_error' }, 500);
  });
  app.post('/register/challenge', challengeHandler(deps));
  return app;
};

let baseDeps = (overrides: Partial<ChallengeHandlerDeps> = {}): ChallengeHandlerDeps => ({
  endpoint: 'https://parent.example.com',
  basePath: '/outpost',
  fetch: buildFetchMock().fetch,
  tokens: {} as any,
  ...overrides
});

describe('outpost-parent-adapter challengeHandler', () => {
  it("signs the forwarded request as this outpost's own service and preserves the body", async () => {
    let { fetch, calls } = buildFetchMock();
    let app = mountApp(baseDeps({ fetch }));

    let body = JSON.stringify({ version: 1, outpost_id: 'otp_1' });
    let res = await app.request('/register/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    });

    expect(res.status).toBe(200);
    let [url, init] = calls[0]!;
    expect(url).toBe('https://parent.example.com/outpost/register/challenge');
    expect(init.method).toBe('POST');
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(body);
    expect(init.service).toBe(OUTPOST_PROTOCOL_SERVICE);
  });

  it('captures a fresh proxy_context from its own connection for the first hop', async () => {
    let { fetch, calls } = buildFetchMock();
    let app = mountApp(baseDeps({ fetch, trustProxy: true }));

    await app.request('/register/challenge', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.7', 'user-agent': 'outpost-client/1' },
      body: '{}'
    });

    let [, init] = calls[0]!;
    expect(init.proxyContext).toEqual({ ip: '198.51.100.7', user_agent: 'outpost-client/1' });
  });

  it('does not resolve a client ip when trustProxy is disabled outside of a real runtime', async () => {
    let { fetch, calls } = buildFetchMock();
    let app = mountApp(baseDeps({ fetch }));

    await app.request('/register/challenge', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.7' },
      body: '{}'
    });

    let [, init] = calls[0]!;
    expect(init.proxyContext?.ip).toBeUndefined();
  });

  it('strips hop-by-hop headers before re-signing', async () => {
    let { fetch, calls } = buildFetchMock();
    let app = mountApp(baseDeps({ fetch }));

    await app.request('/register/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json', connection: 'keep-alive' },
      body: '{}'
    });

    let [, init] = calls[0]!;
    let headers = init.headers as Record<string, string>;
    expect(headers.connection).toBeUndefined();
    expect(headers['content-type']).toBe('application/json');
  });

  describe('a challenge already relayed by a nested Outpost', () => {
    let setup = async () => {
      let issuer = await Ed25519.generateKeyPair();
      let tokens = new OutpostTokens({
        signing: {
          kid: 'mik_test',
          privateKey: issuer.privateKey,
          publicKey: issuer.publicKey
        }
      });

      let instance = await Ed25519.generateKeyPair();
      let instancePublicKeyBytes = await Ed25519.exportPublicKey(instance.publicKey);
      let instanceToken = await tokens.sign({
        type: INSTANCE_TOKEN_TYPE,
        data: {
          outpost_id: 'otp_child',
          instance_id: 'oti_child',
          credential_id: 'otc_child',
          instance_public_key: base64url.encode(instancePublicKeyBytes)
        }
      });

      return { tokens, instancePrivateKey: instance.privateKey, instanceToken };
    };

    let signedChallengeRequest = async (opts: {
      instancePrivateKey: CryptoKey;
      instanceToken: string;
      body: string;
      proxyContext?: OutpostProxyContext;
      signature?: string;
    }) => {
      let url = new URL('http://localhost/register/challenge');
      let headers = { 'content-type': 'application/json' };
      let signedHeaders = canonicalizeSignedHeaders(headers, Object.keys(headers));
      let timestamp = Math.floor(Date.now() / 1000);
      let requestId = generateRequestId();

      let signature =
        opts.signature ??
        (await signRequest(opts.instancePrivateKey, {
          version: PROTOCOL_VERSION,
          outpostId: 'otp_child',
          instanceId: 'oti_child',
          timestamp,
          requestId,
          service: OUTPOST_PROTOCOL_SERVICE,
          method: 'POST',
          scheme: url.protocol.replace(/:$/, ''),
          authority: url.host,
          path: url.pathname,
          query: '',
          signedHeaders,
          bodySha256: await hashBody(new TextEncoder().encode(opts.body)),
          proxyContext: opts.proxyContext
        }));

      let metadata: OutpostSignatureMetadata = {
        version: PROTOCOL_VERSION,
        outpost_id: 'otp_child',
        timestamp,
        request_id: requestId,
        service: OUTPOST_PROTOCOL_SERVICE,
        signed_headers: signedHeaders.map(header => header.name),
        signature,
        proxy_context: opts.proxyContext
      };

      return new Request(url, {
        method: 'POST',
        headers: {
          ...headers,
          'x-forwarded-for': '10.0.0.9',
          [OUTPOST_ID_HEADER]: 'otp_child',
          [OUTPOST_INSTANCE_TOKEN_HEADER]: opts.instanceToken,
          [OUTPOST_SIGNATURE_HEADER]: encodeSignatureHeader(metadata)
        },
        body: opts.body
      });
    };

    it('reuses the incoming proxy_context instead of re-deriving one from its own connection', async () => {
      let { tokens, instancePrivateKey, instanceToken } = await setup();
      let { fetch, calls } = buildFetchMock();
      let app = mountApp(baseDeps({ fetch, tokens, trustProxy: true }));

      let req = await signedChallengeRequest({
        instancePrivateKey,
        instanceToken,
        body: JSON.stringify({ version: 1, outpost_id: 'otp_1' }),
        proxyContext: { ip: '203.0.113.5', user_agent: 'original-client' }
      });

      let res = await app.request(req);

      expect(res.status).toBe(200);
      let [, init] = calls[0]!;
      expect(init.proxyContext).toEqual({ ip: '203.0.113.5', user_agent: 'original-client' });
    });

    it(
      "drops the verified hop's own Outpost auth headers before re-signing, instead of " +
        'letting them survive alongside the new ones',
      async () => {
        let { tokens, instancePrivateKey, instanceToken } = await setup();
        let { fetch, calls } = buildFetchMock();
        let app = mountApp(baseDeps({ fetch, tokens }));

        let req = await signedChallengeRequest({
          instancePrivateKey,
          instanceToken,
          body: JSON.stringify({ version: 1, outpost_id: 'otp_1' }),
          proxyContext: { ip: '203.0.113.5' }
        });

        let res = await app.request(req);

        expect(res.status).toBe(200);
        let [, init] = calls[0]!;
        let headers = init.headers as Record<string, string>;
        expect(headers[OUTPOST_ID_HEADER.toLowerCase()]).toBeUndefined();
        expect(headers[OUTPOST_INSTANCE_TOKEN_HEADER.toLowerCase()]).toBeUndefined();
        expect(headers[OUTPOST_SIGNATURE_HEADER.toLowerCase()]).toBeUndefined();
      }
    );

    it('rejects a forwarded challenge whose Outpost signature does not verify', async () => {
      let { tokens, instancePrivateKey, instanceToken } = await setup();
      let { fetch, calls } = buildFetchMock();
      let app = mountApp(baseDeps({ fetch, tokens }));

      let req = await signedChallengeRequest({
        instancePrivateKey,
        instanceToken,
        body: JSON.stringify({ version: 1, outpost_id: 'otp_1' }),
        proxyContext: { ip: '203.0.113.5' },
        signature: base64url.encode(new Uint8Array(64))
      });

      let res = await app.request(req);

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('invalid_signature');
      expect(calls).toHaveLength(0);
    });
  });
});

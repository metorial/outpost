import { MemoryInstanceCredentialStore, OutpostAuth } from '@metorial-outpost/auth';
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
  OUTPOST_SIGNATURE_HEADER_NAMES,
  verifyRequestSignature,
  type RequestSignatureInput
} from '@metorial-outpost/signature';
import { describe, expect, it, vi } from 'vitest';
import {
  createOutpostFetch,
  OutpostFetch,
  shouldFollowOutpostRedirect
} from './outpost-fetch';

let jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

let buildAuth = async (opts: { defaultService?: string } = {}) => {
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

  let envelope = encodeCredentialEnvelope(credential);

  let registrationFetch = vi.fn(async (url: string) => {
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

  let store = new MemoryInstanceCredentialStore();

  let auth = new OutpostAuth({
    credential: envelope,
    store,
    defaultService: opts.defaultService,
    fetch: registrationFetch as unknown as typeof fetch
  });

  return { auth, credential, envelope, store };
};

describe('OutpostFetch', () => {
  it('signs the outgoing request and forwards it to the underlying fetch', async () => {
    let { auth } = await buildAuth({ defaultService: 'metorial.proxy' });
    let fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'));

    let outpostFetch = new OutpostFetch({ auth, fetch: fetchMock as unknown as typeof fetch });

    let response = await outpostFetch.fetch('https://api.metorial.com/v1/foo?a=1', {
      method: 'POST',
      headers: { authorization: 'Bearer abc', 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' })
    });

    expect(await response.text()).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    let [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: any }];
    expect(url).toBe('https://api.metorial.com/v1/foo?a=1');
    expect(init.headers[OUTPOST_ID_HEADER]).toBe('otp_123');
    expect(init.headers[OUTPOST_SIGNATURE_HEADER]).toBeDefined();
    expect(init.headers.authorization).toBe('Bearer abc');
  });

  it('produces a signature that verifies against the registered instance credentials', async () => {
    let { auth, credential, store } = await buildAuth({ defaultService: 'metorial.proxy' });
    let fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'));
    let outpostFetch = new OutpostFetch({ auth, fetch: fetchMock as unknown as typeof fetch });

    let body = JSON.stringify({ hello: 'world' });
    await outpostFetch.fetch('https://api.metorial.com/v1/foo?a=1', {
      method: 'POST',
      headers: { authorization: 'Bearer abc', 'content-type': 'application/json' },
      body
    });

    let [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: any }];
    let metadata = decodeSignatureHeader(init.headers[OUTPOST_SIGNATURE_HEADER]);

    let credentials = await store.load();
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

  it('defaults the method to GET and signs requests without a body', async () => {
    let { auth } = await buildAuth({ defaultService: 'metorial.proxy' });
    let fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'));
    let outpostFetch = new OutpostFetch({ auth, fetch: fetchMock as unknown as typeof fetch });

    await outpostFetch.fetch('https://api.metorial.com/v1/foo');

    let [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: any }];
    expect(init.method).toBe('GET');
    expect(init.headers[OUTPOST_ID_HEADER]).toBe('otp_123');
  });

  it('lets a per-call service override the client default', async () => {
    let { auth } = await buildAuth({ defaultService: 'metorial.proxy' });
    let fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'));
    let outpostFetch = new OutpostFetch({
      auth,
      service: 'metorial.default',
      fetch: fetchMock as unknown as typeof fetch
    });

    await outpostFetch.fetch('https://api.metorial.com/v1/foo', {
      service: 'metorial.override'
    });

    let [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: any }];
    let metadata = decodeSignatureHeader(init.headers[OUTPOST_SIGNATURE_HEADER]);
    expect(metadata.service).toBe('metorial.override');
  });

  it('carries outpostChain into the signed metadata', async () => {
    let { auth } = await buildAuth({ defaultService: 'metorial.proxy' });
    let fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'));
    let outpostFetch = new OutpostFetch({ auth, fetch: fetchMock as unknown as typeof fetch });

    await outpostFetch.fetch('https://api.metorial.com/v1/foo', {
      outpostChain: [
        ['otp_a', 'oti_a'],
        ['otp_b', 'oti_b']
      ]
    });

    let [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: any }];
    let metadata = decodeSignatureHeader(init.headers[OUTPOST_SIGNATURE_HEADER]);
    expect(metadata.outpost_chain).toEqual([
      ['otp_a', 'oti_a'],
      ['otp_b', 'oti_b']
    ]);
  });

  it('replaces authentication headers from a previous outpost hop', async () => {
    let { auth } = await buildAuth({ defaultService: 'metorial.proxy' });
    let fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'));
    let outpostFetch = new OutpostFetch({ auth, fetch: fetchMock as unknown as typeof fetch });

    await outpostFetch.fetch('https://api.metorial.com/v1/foo', {
      headers: {
        'metorial-outpost-id': 'otp_previous',
        'metorial-outpost-instance-token': 'previous-token',
        'metorial-outpost-signature': 'previous-signature',
        authorization: 'Bearer abc'
      },
      outpostChain: [['otp_previous', 'oti_previous']]
    });

    let [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: any }];
    let headerEntries = Object.entries(init.headers as Record<string, string>);
    let metadata = decodeSignatureHeader(init.headers[OUTPOST_SIGNATURE_HEADER]);

    for (let name of OUTPOST_SIGNATURE_HEADER_NAMES) {
      expect(headerEntries.filter(([header]) => header.toLowerCase() == name)).toHaveLength(1);
    }
    expect(init.headers[OUTPOST_ID_HEADER]).toBe('otp_123');
    expect(init.headers[OUTPOST_INSTANCE_TOKEN_HEADER]).toBe('instance-token-value');
    expect(metadata.signed_headers).toEqual(['authorization']);
    expect(metadata.outpost_chain).toEqual([['otp_previous', 'oti_previous']]);
  });

  it('follows and re-signs a small same-origin path normalization redirect', async () => {
    let { auth } = await buildAuth({ defaultService: 'metorial.proxy' });
    let calls: [URL, RequestInit][] = [];
    let fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      let url = new URL(input.toString());
      calls.push([
        url,
        { ...init!, headers: { ...(init!.headers as Record<string, string>) } }
      ]);
      if (calls.length == 1) {
        return new Response(null, { status: 308, headers: { location: '/v1/foo/' } });
      }
      return new Response('normalized');
    });
    let outpostFetch = new OutpostFetch({ auth, fetch: fetchMock as unknown as typeof fetch });

    let response = await outpostFetch.fetch('https://api.metorial.com/v1/foo');

    expect(await response.text()).toBe('normalized');
    expect(calls.map(([url]) => url.pathname)).toEqual(['/v1/foo', '/v1/foo/']);
    expect(calls.every(([, init]) => init.redirect == 'manual')).toBe(true);
    expect(
      calls.map(([, init]) =>
        decodeSignatureHeader(
          (init.headers as Record<string, string>)[OUTPOST_SIGNATURE_HEADER]
        )
      )[0]!.request_id
    ).not.toBe(
      calls.map(([, init]) =>
        decodeSignatureHeader(
          (init.headers as Record<string, string>)[OUTPOST_SIGNATURE_HEADER]
        )
      )[1]!.request_id
    );
  });

  it('follows an HTTP to HTTPS redirect on the same host', async () => {
    let { auth } = await buildAuth({ defaultService: 'metorial.proxy' });
    let calls: string[] = [];
    let fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(input.toString());
      if (calls.length == 1) {
        return new Response(null, {
          status: 301,
          headers: { location: 'https://api.metorial.com/secure-path' }
        });
      }
      return new Response('secure');
    });
    let outpostFetch = new OutpostFetch({ auth, fetch: fetchMock as unknown as typeof fetch });

    expect(await (await outpostFetch.fetch('http://api.metorial.com/start')).text()).toBe(
      'secure'
    );
    expect(calls).toEqual([
      'http://api.metorial.com/start',
      'https://api.metorial.com/secure-path'
    ]);
  });

  it('returns redirects that do not match the safe follow policy', async () => {
    let { auth } = await buildAuth({ defaultService: 'metorial.proxy' });
    let fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://client.example.com/oauth/authorize' }
        })
    );
    let outpostFetch = new OutpostFetch({ auth, fetch: fetchMock as unknown as typeof fetch });

    let response = await outpostFetch.fetch('https://api.metorial.com/oauth/start');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://client.example.com/oauth/authorize'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('only treats same-origin path changes of at most two edits as normalization', () => {
    expect(
      shouldFollowOutpostRedirect(
        new URL('https://api.metorial.com/foo'),
        new URL('https://api.metorial.com/foo//')
      )
    ).toBe(true);
    expect(
      shouldFollowOutpostRedirect(
        new URL('https://api.metorial.com/foo'),
        new URL('https://api.metorial.com/completely-different')
      )
    ).toBe(false);
    expect(
      shouldFollowOutpostRedirect(
        new URL('https://api.metorial.com/foo?a=1'),
        new URL('https://api.metorial.com/foo/?a=2')
      )
    ).toBe(false);
  });

  it('throws for body types it cannot hash (e.g. FormData)', async () => {
    let { auth } = await buildAuth({ defaultService: 'metorial.proxy' });
    let outpostFetch = new OutpostFetch({ auth, fetch: vi.fn() as unknown as typeof fetch });

    let form = new FormData();
    form.set('a', 'b');

    await expect(
      outpostFetch.fetch('https://api.metorial.com/v1/foo', {
        method: 'POST',
        body: form as unknown as BodyInit
      })
    ).rejects.toThrow(/unsupported body type/i);
  });

  it('createOutpostFetch returns a fetch-compatible function', async () => {
    let { auth } = await buildAuth({ defaultService: 'metorial.proxy' });
    let fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'));
    let fetchFn = createOutpostFetch({ auth, fetch: fetchMock as unknown as typeof fetch });

    let response = await fetchFn('https://api.metorial.com/v1/foo');
    expect(await response.text()).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

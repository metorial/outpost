import { describe, expect, it, vi } from 'vitest';
import { forwardToParent } from './forward';

let buildFetchMock = () => {
  let calls: [string, RequestInit][] = [];
  let fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    return new Response('upstream ok');
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
};

describe('forwardToParent', () => {
  it('joins the parent endpoint and the given path', async () => {
    let { fetch, calls } = buildFetchMock();
    await forwardToParent(
      { endpoint: 'https://parent.example.com/', fetch },
      '/outpost/register',
      new Request('https://child.local/outpost/register')
    );

    expect(calls[0]![0]).toBe('https://parent.example.com/outpost/register');
  });

  it('forwards GET requests without a body', async () => {
    let { fetch, calls } = buildFetchMock();
    await forwardToParent(
      { endpoint: 'https://parent.example.com', fetch },
      '/outpost/public-key/otp_1/otc_1',
      new Request('https://child.local/outpost/public-key/otp_1/otc_1')
    );

    let [, init] = calls[0]!;
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('buffers and forwards a POST body', async () => {
    let { fetch, calls } = buildFetchMock();
    await forwardToParent(
      { endpoint: 'https://parent.example.com', fetch },
      '/outpost/register',
      new Request('https://child.local/outpost/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challenge_id: 'och_1' })
      })
    );

    let [, init] = calls[0]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(
      '{"challenge_id":"och_1"}'
    );
  });

  it('strips hop-by-hop headers but forwards everything else', async () => {
    let { fetch, calls } = buildFetchMock();
    await forwardToParent(
      { endpoint: 'https://parent.example.com', fetch },
      '/outpost/register',
      new Request('https://child.local/outpost/register', {
        headers: { 'content-type': 'application/json', connection: 'keep-alive' }
      })
    );

    let [, init] = calls[0]!;
    let headers = init.headers as Record<string, string>;
    expect(headers.host).toBeUndefined();
    expect(headers.connection).toBeUndefined();
    expect(headers['content-type']).toBe('application/json');
  });
});

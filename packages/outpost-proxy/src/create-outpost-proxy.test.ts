import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createOutpostProxy } from './create-outpost-proxy';

describe('createOutpostProxy', () => {
  it('routes a request to the matching adapter', async () => {
    let testApp = new Hono();
    testApp.get('/hello', c => c.text('from test'));

    let fallbackApp = new Hono();
    fallbackApp.all('/*', c => c.text('from fallback'));

    let proxy = createOutpostProxy({
      adapters: [
        { path: '/test', app: testApp },
        { path: '/', app: fallbackApp }
      ]
    });

    let res = await proxy.request('/test/hello');
    expect(await res.text()).toBe('from test');
  });

  it('falls back to the "/" adapter for unmatched paths', async () => {
    let testApp = new Hono();
    testApp.get('/hello', c => c.text('from test'));

    let fallbackApp = new Hono();
    fallbackApp.all('/*', c => c.text('from fallback'));

    let proxy = createOutpostProxy({
      adapters: [
        { path: '/test', app: testApp },
        { path: '/', app: fallbackApp }
      ]
    });

    let res = await proxy.request('/anything/else');
    expect(await res.text()).toBe('from fallback');
  });

  it('does not let a "/" adapter registered first shadow a more specific one', async () => {
    let fallbackApp = new Hono();
    fallbackApp.all('/*', c => c.text('from fallback'));

    let abcApp = new Hono();
    abcApp.get('/thing', c => c.text('from abc'));

    let proxy = createOutpostProxy({
      adapters: [
        { path: '/', app: fallbackApp },
        { path: '/abc', app: abcApp }
      ]
    });

    let res = await proxy.request('/abc/thing');
    expect(await res.text()).toBe('from abc');
  });
});

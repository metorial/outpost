import { noopLogger } from '@metorial-outpost/logger';
import { describe, expect, it, vi } from 'vitest';
import { startManifestFetcher } from './manifest-fetcher';

let MANIFEST_V1 = { outpost: { id: 'otp_123', name: 'V1' }, access: [] };
let MANIFEST_V2 = { outpost: { id: 'otp_123', name: 'V2' }, access: [] };

let jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

let sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('startManifestFetcher', () => {
  it('fetches the manifest once before returning, using the signed context fetch', async () => {
    let calls: [string, unknown][] = [];
    let fetch = vi.fn(async (url: string, init: any) => {
      calls.push([url, init]);
      return jsonResponse(MANIFEST_V1);
    });

    let { holder, stop } = await startManifestFetcher({
      endpoint: 'https://outpost.metorial.com',
      basePath: '/outpost',
      outpostId: 'otp_123',
      service: 'metorial.outpost',
      fetch: fetch as any,
      logger: noopLogger
    });
    stop();

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('https://outpost.metorial.com/outpost/manifest/otp_123');
    expect(calls[0]![1]).toMatchObject({ method: 'GET', service: 'metorial.outpost' });
    expect(holder.current()).toEqual(MANIFEST_V1);
  });

  it('refreshes on the configured interval', async () => {
    let responses = [MANIFEST_V1, MANIFEST_V2];
    let fetch = vi.fn(async () => jsonResponse(responses.shift()));

    let { holder, stop } = await startManifestFetcher({
      endpoint: 'https://outpost.metorial.com',
      basePath: '/outpost',
      outpostId: 'otp_123',
      service: 'metorial.outpost',
      fetch: fetch as any,
      logger: noopLogger,
      refreshIntervalMs: 10
    });

    expect(holder.current()).toEqual(MANIFEST_V1);
    await sleep(50);
    stop();

    expect(holder.current()).toEqual(MANIFEST_V2);
  });

  it('keeps the last known good manifest when a refresh fails, without throwing', async () => {
    let fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(MANIFEST_V1))
      .mockRejectedValue(new Error('network down'));

    let { holder, stop } = await startManifestFetcher({
      endpoint: 'https://outpost.metorial.com',
      basePath: '/outpost',
      outpostId: 'otp_123',
      service: 'metorial.outpost',
      fetch: fetch as any,
      logger: noopLogger,
      refreshIntervalMs: 10
    });

    await sleep(50);
    stop();

    expect(holder.current()).toEqual(MANIFEST_V1);
  });

  it('keeps the last known good manifest when a refresh responds with a non-ok status', async () => {
    let fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(MANIFEST_V1))
      .mockResolvedValue(new Response('{}', { status: 500 }));

    let { holder, stop } = await startManifestFetcher({
      endpoint: 'https://outpost.metorial.com',
      basePath: '/outpost',
      outpostId: 'otp_123',
      service: 'metorial.outpost',
      fetch: fetch as any,
      logger: noopLogger,
      refreshIntervalMs: 10
    });

    await sleep(50);
    stop();

    expect(holder.current()).toEqual(MANIFEST_V1);
  });

  it('stop() clears the refresh interval', async () => {
    let fetch = vi.fn(async () => jsonResponse(MANIFEST_V1));

    let { stop } = await startManifestFetcher({
      endpoint: 'https://outpost.metorial.com',
      basePath: '/outpost',
      outpostId: 'otp_123',
      service: 'metorial.outpost',
      fetch: fetch as any,
      logger: noopLogger,
      refreshIntervalMs: 10
    });

    stop();
    await sleep(50);

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

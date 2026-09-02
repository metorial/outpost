import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { createOutpostStatusPage } from './create-status-page';
import type { OutpostStatusPageData } from './types';

let testDir = dirname(fileURLToPath(import.meta.url));
let fixtureDistDir = join(testDir, '__fixtures__', 'built-page');

let sampleData: OutpostStatusPageData = {
  outpostId: 'otp_123',
  outpostName: 'Acme Corp Outpost',
  credentialId: 'otc_456',
  instanceId: 'oti_789',
  registered: true,
  tokenExpiresAt: null,
  baseUrl: 'https://abc.outpost.example',
  startedAt: 1700000000000,
  upstream: { kind: 'metorial', host: 'outpost.metorial.com' },
  services: [
    { id: 'mcp_connection_proxy', version: '1.0.0', granted: true, paths: ['/connect/mcp'] }
  ],
  access: [
    {
      organizationId: 'org_123',
      projectId: 'proj_456',
      instanceId: 'inst_789',
      services: ['mcp_connection_proxy']
    }
  ]
};

describe('createOutpostStatusPage', () => {
  it('mounts at the proxy root by default', () => {
    let adapter = createOutpostStatusPage({ getData: () => sampleData });
    expect(adapter.path).toBe('/');
  });

  it('honors a custom mount path', () => {
    let adapter = createOutpostStatusPage({ getData: () => sampleData, path: '/status' });
    expect(adapter.path).toBe('/status');
  });

  it('serves the built index.html at GET /', async () => {
    let adapter = createOutpostStatusPage({
      getData: () => sampleData,
      distDir: fixtureDistDir
    });

    let res = await adapter.app.request('/');

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>fixture</title>');
  });

  it('falls back to a friendly placeholder when the client has not been built yet', async () => {
    let adapter = createOutpostStatusPage({
      getData: () => sampleData,
      distDir: join(testDir, '__fixtures__', 'does-not-exist')
    });

    let res = await adapter.app.request('/');

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("hasn't been built yet");
  });

  it('serves live data at GET /outpost-status/api/status', async () => {
    let adapter = createOutpostStatusPage({
      getData: () => sampleData,
      distDir: fixtureDistDir
    });

    let res = await adapter.app.request('/outpost-status/api/status');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(sampleData);
  });

  it('calls getData() fresh on every request instead of caching it', async () => {
    let calls = 0;
    let adapter = createOutpostStatusPage({
      getData: () => {
        calls++;
        return { ...sampleData, tokenExpiresAt: calls };
      },
      distDir: fixtureDistDir
    });

    await adapter.app.request('/outpost-status/api/status');
    let second = await adapter.app.request('/outpost-status/api/status');

    expect(calls).toBe(2);
    expect((await second.json()).tokenExpiresAt).toBe(2);
  });

  it('serves built assets under /assets', async () => {
    let adapter = createOutpostStatusPage({
      getData: () => sampleData,
      distDir: fixtureDistDir
    });

    let res = await adapter.app.request('/assets/hello.txt');

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('hello from fixture asset');
  });

  it('404s for a missing asset', async () => {
    let adapter = createOutpostStatusPage({
      getData: () => sampleData,
      distDir: fixtureDistDir
    });

    let res = await adapter.app.request('/assets/nope.txt');

    expect(res.status).toBe(404);
  });

  it('rejects an asset path that tries to escape the assets directory', async () => {
    let adapter = createOutpostStatusPage({
      getData: () => sampleData,
      distDir: fixtureDistDir
    });

    let res = await adapter.app.request('/assets/..%2f..%2fpackage.json');

    expect(res.status).toBe(403);
  });
});

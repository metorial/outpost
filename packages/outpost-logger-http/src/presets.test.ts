import { describe, expect, it, vi } from 'vitest';
import { DatadogLogger, ElasticLogger, SplunkLogger } from './presets';

let okResponse = () => new Response(null, { status: 200 });

describe('DatadogLogger', () => {
  it('posts a JSON array of log objects to the logs intake API with a DD-API-KEY header', async () => {
    let fetchMock = vi.fn().mockResolvedValue(okResponse());
    let logger = new DatadogLogger({
      level: 'trace',
      apiKey: 'dd-key',
      service: 'mcp-proxy',
      hostname: 'mcp-proxy',
      ddsource: 'metorial-mcp-proxy',
      fetch: fetchMock as unknown as typeof fetch
    });

    logger.info('audit: tool call', { tool: 'search' });
    await logger.flush();

    let [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://http-intake.logs.datadoghq.com/api/v2/logs');
    expect(init.headers['DD-API-KEY']).toBe('dd-key');
    expect(init.headers['content-type']).toBe('application/json');

    let events = JSON.parse(init.body);
    expect(events).toEqual([
      {
        ddsource: 'metorial-mcp-proxy',
        ddtags: undefined,
        hostname: 'mcp-proxy',
        service: 'mcp-proxy',
        status: 'info',
        message: 'audit: tool call',
        tool: 'search'
      }
    ]);
  });

  it('sends to the configured site', async () => {
    let fetchMock = vi.fn().mockResolvedValue(okResponse());
    let logger = new DatadogLogger({
      level: 'trace',
      apiKey: 'dd-key',
      site: 'datadoghq.eu',
      fetch: fetchMock as unknown as typeof fetch
    });

    logger.error('signing failed');
    await logger.flush();

    let [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://http-intake.logs.datadoghq.eu/api/v2/logs');
  });
});

describe('SplunkLogger', () => {
  it('posts to the HEC event endpoint with a Splunk auth header', async () => {
    let fetchMock = vi.fn().mockResolvedValue(okResponse());
    let logger = new SplunkLogger({
      level: 'trace',
      endpoint: 'https://splunk.example.com:8088/',
      token: 'hec-token',
      sourcetype: 'metorial:outpost',
      fetch: fetchMock as unknown as typeof fetch
    });

    logger.warn('disk almost full', { pct: 91 });
    await logger.flush();

    let [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://splunk.example.com:8088/services/collector/event');
    expect(init.headers.authorization).toBe('Splunk hec-token');
    expect(init.headers['content-type']).toBe('application/json');
  });

  it('concatenates events back-to-back rather than as a JSON array', async () => {
    let fetchMock = vi.fn().mockResolvedValue(okResponse());
    let logger = new SplunkLogger({
      level: 'trace',
      endpoint: 'https://splunk.example.com:8088',
      token: 'hec-token',
      fetch: fetchMock as unknown as typeof fetch
    });

    logger.info('first');
    logger.info('second');
    await logger.flush();

    let [, init] = fetchMock.mock.calls[0];
    expect(() => JSON.parse(init.body)).toThrow();

    let events = JSON.parse(`[${init.body.replace(/}{/g, '},{')}]`);
    expect(events.map((e: any) => e.event.message)).toEqual(['first', 'second']);
  });
});

describe('ElasticLogger', () => {
  it('posts newline-delimited action/document pairs to _bulk', async () => {
    let fetchMock = vi.fn().mockResolvedValue(okResponse());
    let logger = new ElasticLogger({
      level: 'trace',
      endpoint: 'https://es.example.com:9243',
      apiKey: 'my-key',
      index: 'outpost-logs',
      fetch: fetchMock as unknown as typeof fetch
    });

    logger.error('signing failed', { instanceId: 'oti_1' });
    await logger.flush();

    let [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://es.example.com:9243/_bulk');
    expect(init.headers.authorization).toBe('ApiKey my-key');
    expect(init.headers['content-type']).toBe('application/x-ndjson');

    let lines = init.body.trim().split('\n').map(JSON.parse);
    expect(lines[0]).toEqual({ create: { _index: 'outpost-logs' } });
    expect(lines[1]).toMatchObject({
      'log.level': 'error',
      message: 'signing failed',
      instanceId: 'oti_1'
    });
    expect(typeof lines[1]['@timestamp']).toBe('string');
  });
});

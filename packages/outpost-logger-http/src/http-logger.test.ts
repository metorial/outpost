import { describe, expect, it, vi } from 'vitest';
import { HttpLogger } from './http-logger';

let okResponse = () => new Response(null, { status: 200 });

describe('HttpLogger', () => {
  it('does not send anything until the batch fills up', async () => {
    let fetchMock = vi.fn().mockResolvedValue(okResponse());
    let logger = new HttpLogger({
      level: 'trace',
      url: 'https://logs.example.com',
      fetch: fetchMock as unknown as typeof fetch,
      maxBatchSize: 3
    });

    logger.info('a');
    logger.info('b');
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flushes automatically once maxBatchSize is reached', async () => {
    let fetchMock = vi.fn().mockResolvedValue(okResponse());
    let logger = new HttpLogger({
      level: 'trace',
      url: 'https://logs.example.com',
      fetch: fetchMock as unknown as typeof fetch,
      maxBatchSize: 2
    });

    logger.info('a');
    logger.info('b');
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    let [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://logs.example.com');
    expect(init.method).toBe('POST');
    let sent = JSON.parse(init.body);
    expect(sent.map((e: any) => e.message)).toEqual(['a', 'b']);
  });

  it('flush() sends a partial batch immediately and empties the buffer', async () => {
    let fetchMock = vi.fn().mockResolvedValue(okResponse());
    let logger = new HttpLogger({
      level: 'trace',
      url: 'https://logs.example.com',
      fetch: fetchMock as unknown as typeof fetch,
      maxBatchSize: 100
    });

    logger.info('only one');
    await logger.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await logger.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('close() flushes remaining buffered entries', async () => {
    let fetchMock = vi.fn().mockResolvedValue(okResponse());
    let logger = new HttpLogger({
      level: 'trace',
      url: 'https://logs.example.com',
      fetch: fetchMock as unknown as typeof fetch,
      maxBatchSize: 100
    });

    logger.info('pending');
    await logger.close();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('merges top-level headers with formatBody headers, formatBody taking precedence', async () => {
    let fetchMock = vi.fn().mockResolvedValue(okResponse());
    let logger = new HttpLogger({
      level: 'trace',
      url: 'https://logs.example.com',
      fetch: fetchMock as unknown as typeof fetch,
      headers: { authorization: 'token', 'content-type': 'text/plain' },
      formatBody: entries => ({
        body: entries.map(e => e.message).join('\n'),
        headers: { 'content-type': 'application/x-ndjson' }
      })
    });

    logger.info('a');
    await logger.flush();

    let [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({
      authorization: 'token',
      'content-type': 'application/x-ndjson'
    });
    expect(init.body).toBe('a');
  });

  it('reports failures via onError instead of throwing', async () => {
    let fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    let onError = vi.fn();
    let logger = new HttpLogger({
      level: 'trace',
      url: 'https://logs.example.com',
      fetch: fetchMock as unknown as typeof fetch,
      onError
    });

    logger.info('will fail');
    await expect(logger.flush()).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledTimes(1);
    let [error, entries] = onError.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(entries.map((e: any) => e.message)).toEqual(['will fail']);
  });

  it('respects the configured level -- dropped entries never reach the buffer', async () => {
    let fetchMock = vi.fn().mockResolvedValue(okResponse());
    let logger = new HttpLogger({
      level: 'error',
      url: 'https://logs.example.com',
      fetch: fetchMock as unknown as typeof fetch
    });

    logger.info('dropped');
    await logger.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

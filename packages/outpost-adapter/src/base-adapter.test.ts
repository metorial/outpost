import { BaseLogger, type LogEntry } from '@metorial-outpost/logger';
import { describe, expect, it } from 'vitest';
import { BaseOutpostAdapter } from './base-adapter';
import type { OutpostAdapterContext } from './types';

class RecordingLogger extends BaseLogger {
  entries: LogEntry[] = [];
  protected write(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

class NamedAdapter extends BaseOutpostAdapter {
  readonly name = 'named-adapter';

  logSomething() {
    this.logger.info('hello');
  }

  getCache() {
    return this.cache;
  }
}

describe('BaseOutpostAdapter', () => {
  it('scopes the logger with the adapter name, computed after construction', () => {
    let logger = new RecordingLogger();
    let context: OutpostAdapterContext = {
      auth: {} as any,
      fetch: {} as any,
      logger,
      cache: {} as any,
      manifest: {} as any,
      tokens: {} as any,
      baseUrl: 'https://proxy.local'
    };

    let adapter = new NamedAdapter(context, undefined);
    adapter.logSomething();

    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0].fields).toEqual({ adapter: 'named-adapter' });
  });

  it('passes context and config through to the instance', () => {
    let context: OutpostAdapterContext = {
      auth: {} as any,
      fetch: {} as any,
      logger: {} as any,
      cache: {} as any,
      manifest: {} as any,
      tokens: {} as any,
      baseUrl: 'https://proxy.local'
    };
    let adapter = new NamedAdapter(context, undefined);
    expect((adapter as any).context).toBe(context);
  });

  it('exposes the context cache as-is', () => {
    let cache = {} as any;
    let context: OutpostAdapterContext = {
      auth: {} as any,
      fetch: {} as any,
      logger: {} as any,
      cache,
      manifest: {} as any,
      tokens: {} as any,
      baseUrl: 'https://proxy.local'
    };
    let adapter = new NamedAdapter(context, undefined);
    expect(adapter.getCache()).toBe(cache);
  });
});

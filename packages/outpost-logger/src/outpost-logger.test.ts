import { describe, expect, it } from 'vitest';
import { BaseLogger } from './base-logger';
import { and, minLevel, not, scopeIs } from './filters';
import type { LogEntry, LogFields } from './types';
import { MultiLogger } from './multi-logger';
import { NoopLogger } from './noop-logger';

class RecordingLogger extends BaseLogger {
  entries: LogEntry[] = [];

  protected write(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

let messages = (logger: RecordingLogger) => logger.entries.map(e => e.message);

describe('BaseLogger', () => {
  it('drops entries below the configured level', () => {
    let logger = new RecordingLogger({ level: 'warn' });
    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');
    expect(messages(logger)).toEqual(['warn', 'error']);
  });

  it('defaults to info level', () => {
    let logger = new RecordingLogger();
    logger.debug('debug');
    logger.info('info');
    expect(messages(logger)).toEqual(['info']);
  });

  it('discards entries rejected by a filter', () => {
    let logger = new RecordingLogger({
      level: 'trace',
      filters: [not(scopeIs('noisy'))]
    });
    logger.info('keep', { scope: 'important' });
    logger.info('drop', { scope: 'noisy' });
    expect(messages(logger)).toEqual(['keep']);
  });

  it('runs multiple filters as an AND', () => {
    let logger = new RecordingLogger({
      level: 'trace',
      filters: [and(minLevel('warn'), scopeIs('billing'))]
    });
    logger.error('wrong scope', { scope: 'other' });
    logger.warn('right scope, right level', { scope: 'billing' });
    logger.info('right scope, too low', { scope: 'billing' });
    expect(messages(logger)).toEqual(['right scope, right level']);
  });

  it('merges bindings and per-call fields, per-call taking precedence', () => {
    let logger = new RecordingLogger({
      level: 'trace',
      bindings: { service: 'auth', env: 'prod' }
    });
    logger.info('hello', { env: 'staging' });
    expect(logger.entries[0].fields).toEqual({ service: 'auth', env: 'staging' });
  });

  it('child() merges bindings without affecting the parent', () => {
    let logger = new RecordingLogger({ level: 'trace' });
    let child = logger.child({ scope: 'sign' });
    child.info('signed');
    logger.info('unscoped');
    expect(logger.entries[0].fields).toEqual({ scope: 'sign' });
    expect(logger.entries[1].fields).toEqual({});
  });

  it('nested child() calls accumulate bindings', () => {
    let logger = new RecordingLogger({ level: 'trace' });
    let grandchild = logger.child({ a: 1 }).child({ b: 2 });
    grandchild.info('nested');
    expect(logger.entries[0].fields).toEqual({ a: 1, b: 2 });
  });
});

describe('MultiLogger', () => {
  it('fans a call out to every backend', () => {
    let a = new RecordingLogger({ level: 'trace' });
    let b = new RecordingLogger({ level: 'trace' });
    let multi = new MultiLogger([a, b]);

    multi.info('hello', { x: 1 } satisfies LogFields);

    expect(messages(a)).toEqual(['hello']);
    expect(messages(b)).toEqual(['hello']);
  });

  it('lets each backend keep its own level', () => {
    let verbose = new RecordingLogger({ level: 'trace' });
    let quiet = new RecordingLogger({ level: 'error' });
    let multi = new MultiLogger([verbose, quiet]);

    multi.debug('debug');
    multi.error('error');

    expect(messages(verbose)).toEqual(['debug', 'error']);
    expect(messages(quiet)).toEqual(['error']);
  });

  it('child() propagates bindings to every backend', () => {
    let a = new RecordingLogger({ level: 'trace' });
    let b = new RecordingLogger({ level: 'trace' });
    let multi = new MultiLogger([a, b]).child({ scope: 'shared' });

    multi.info('hi');

    expect(a.entries[0].fields).toEqual({ scope: 'shared' });
    expect(b.entries[0].fields).toEqual({ scope: 'shared' });
  });
});

describe('NoopLogger', () => {
  it('discards everything and never throws', () => {
    let logger = new NoopLogger();
    expect(() => {
      logger.trace('a');
      logger.debug('b');
      logger.info('c');
      logger.warn('d');
      logger.error('e');
      logger.child().error('f');
    }).not.toThrow();
  });
});

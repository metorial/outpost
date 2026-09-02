import type { LogFields, Logger } from './types';

export class NoopLogger implements Logger {
  trace(_message: string, _fields?: LogFields): void {}
  debug(_message: string, _fields?: LogFields): void {}
  info(_message: string, _fields?: LogFields): void {}
  warn(_message: string, _fields?: LogFields): void {}
  error(_message: string, _fields?: LogFields): void {}

  child(): Logger {
    return this;
  }
}

export let noopLogger = new NoopLogger();

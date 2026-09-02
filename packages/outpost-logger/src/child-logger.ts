import type { LogFields, Logger } from './types';

export class ChildLogger implements Logger {
  constructor(
    private target: Logger,
    private bindings: LogFields
  ) {}

  trace(message: string, fields?: LogFields): void {
    this.target.trace(message, { ...this.bindings, ...fields });
  }

  debug(message: string, fields?: LogFields): void {
    this.target.debug(message, { ...this.bindings, ...fields });
  }

  info(message: string, fields?: LogFields): void {
    this.target.info(message, { ...this.bindings, ...fields });
  }

  warn(message: string, fields?: LogFields): void {
    this.target.warn(message, { ...this.bindings, ...fields });
  }

  error(message: string, fields?: LogFields): void {
    this.target.error(message, { ...this.bindings, ...fields });
  }

  child(bindings: LogFields): Logger {
    return new ChildLogger(this.target, { ...this.bindings, ...bindings });
  }
}

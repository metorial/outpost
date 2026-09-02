import type { LogFields, Logger } from './types';

export class MultiLogger implements Logger {
  constructor(private loggers: Logger[]) {}

  trace(message: string, fields?: LogFields): void {
    for (let logger of this.loggers) logger.trace(message, fields);
  }

  debug(message: string, fields?: LogFields): void {
    for (let logger of this.loggers) logger.debug(message, fields);
  }

  info(message: string, fields?: LogFields): void {
    for (let logger of this.loggers) logger.info(message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    for (let logger of this.loggers) logger.warn(message, fields);
  }

  error(message: string, fields?: LogFields): void {
    for (let logger of this.loggers) logger.error(message, fields);
  }

  child(bindings: LogFields): Logger {
    return new MultiLogger(this.loggers.map(logger => logger.child(bindings)));
  }
}

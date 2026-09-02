import { ChildLogger } from './child-logger';
import {
  LOG_LEVEL_ORDER,
  type LogEntry,
  type LogFields,
  type LogFilter,
  type LogLevel,
  type Logger
} from './types';

export type BaseLoggerOptions = {
  level?: LogLevel;
  filters?: LogFilter[];
  bindings?: LogFields;
};

export abstract class BaseLogger implements Logger {
  private level: LogLevel;
  private filters: LogFilter[];
  private bindings: LogFields;

  constructor(opts: BaseLoggerOptions = {}) {
    this.level = opts.level ?? 'info';
    this.filters = opts.filters ?? [];
    this.bindings = opts.bindings ?? {};
  }

  trace(message: string, fields?: LogFields): void {
    this.emit('trace', message, fields);
  }

  debug(message: string, fields?: LogFields): void {
    this.emit('debug', message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.emit('info', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.emit('warn', message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.emit('error', message, fields);
  }

  child(bindings: LogFields): Logger {
    return new ChildLogger(this, { ...this.bindings, ...bindings });
  }

  private emit(level: LogLevel, message: string, fields?: LogFields): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.level]) return;

    let entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      fields: { ...this.bindings, ...fields }
    };

    for (let filter of this.filters) {
      if (!filter(entry)) return;
    }

    this.write(entry);
  }

  protected abstract write(entry: LogEntry): void;
}

import {
  BaseLogger,
  type BaseLoggerOptions,
  type LogEntry,
  type LogLevel
} from '@metorial/outpost-logger';

type ConsoleLike = Pick<Console, 'trace' | 'debug' | 'info' | 'warn' | 'error'>;

let CONSOLE_METHOD: Record<LogLevel, keyof ConsoleLike> = {
  trace: 'trace',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error'
};

export type ConsoleLoggerOptions = BaseLoggerOptions & {
  console?: ConsoleLike;
};

export class ConsoleLogger extends BaseLogger {
  private console: ConsoleLike;

  constructor(opts: ConsoleLoggerOptions = {}) {
    super(opts);
    this.console = opts.console ?? console;
  }

  protected write(entry: LogEntry): void {
    let method = this.console[CONSOLE_METHOD[entry.level]];
    let time = new Date(entry.timestamp).toISOString();
    let prefix = `[${time}] ${entry.level.toUpperCase()} ${entry.message}`;

    if (Object.keys(entry.fields).length > 0) {
      method.call(this.console, prefix, entry.fields);
    } else {
      method.call(this.console, prefix);
    }
  }
}

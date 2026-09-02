export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export let LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50
};

export type LogFields = Record<string, unknown>;

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  fields: LogFields;
}

export type LogFilter = (entry: LogEntry) => boolean;

export interface Logger {
  trace(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

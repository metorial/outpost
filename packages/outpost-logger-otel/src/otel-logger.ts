import {
  BaseLogger,
  type BaseLoggerOptions,
  type LogEntry,
  type LogLevel
} from '@metorial-outpost/logger';
import {
  SeverityNumber,
  type AnyValueMap,
  type Logger as OtelApiLogger
} from '@opentelemetry/api-logs';

let SEVERITY_NUMBER: Record<LogLevel, SeverityNumber> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR
};

export type OtelLoggerOptions = BaseLoggerOptions & {
  otelLogger: OtelApiLogger;
};

export class OtelLogger extends BaseLogger {
  private otelLogger: OtelApiLogger;

  constructor(opts: OtelLoggerOptions) {
    super(opts);
    this.otelLogger = opts.otelLogger;
  }

  protected write(entry: LogEntry): void {
    this.otelLogger.emit({
      severityNumber: SEVERITY_NUMBER[entry.level],
      severityText: entry.level.toUpperCase(),
      body: entry.message,
      timestamp: entry.timestamp,
      attributes: entry.fields as AnyValueMap
    });
  }
}

import { BaseLogger, type BaseLoggerOptions, type LogEntry } from '@metorial/outpost-logger';

export type HttpLoggerBody = { body: BodyInit; headers?: Record<string, string> };

export type HttpLoggerOptions = BaseLoggerOptions & {
  url: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  maxBatchSize?: number;
  flushIntervalMs?: number;
  formatBody?: (entries: LogEntry[]) => HttpLoggerBody;
  onError?: (error: unknown, entries: LogEntry[]) => void;
};

let defaultFormatBody = (entries: LogEntry[]): HttpLoggerBody => ({
  body: JSON.stringify(entries),
  headers: { 'content-type': 'application/json' }
});

export class HttpLogger extends BaseLogger {
  private url: string;
  private headers: Record<string, string>;
  private fetchImpl: typeof fetch;
  private maxBatchSize: number;
  private flushIntervalMs: number;
  private formatBody: (entries: LogEntry[]) => HttpLoggerBody;
  private onError: (error: unknown, entries: LogEntry[]) => void;

  private buffer: LogEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: HttpLoggerOptions) {
    super(opts);
    this.url = opts.url;
    this.headers = opts.headers ?? {};
    this.fetchImpl = opts.fetch ?? fetch;
    this.maxBatchSize = opts.maxBatchSize ?? 20;
    this.flushIntervalMs = opts.flushIntervalMs ?? 2000;
    this.formatBody = opts.formatBody ?? defaultFormatBody;
    this.onError = opts.onError ?? (() => {});
  }

  protected write(entry: LogEntry): void {
    this.buffer.push(entry);

    if (this.buffer.length >= this.maxBatchSize) {
      void this.flush();
      return;
    }

    this.timer ??= setTimeout(() => void this.flush(), this.flushIntervalMs);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) return;

    let entries = this.buffer;
    this.buffer = [];

    let { body, headers } = this.formatBody(entries);

    try {
      let response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { ...this.headers, ...headers },
        body
      });

      if (!response.ok) {
        throw new Error(
          `HttpLogger: request to ${this.url} failed with status ${response.status}`
        );
      }
    } catch (error) {
      this.onError(error, entries);
    }
  }

  async close(): Promise<void> {
    await this.flush();
  }
}

import type { LogEntry } from '@metorial/outpost-logger';
import { HttpLogger, type HttpLoggerOptions } from './http-logger';

export type SplunkLoggerOptions = Omit<HttpLoggerOptions, 'url' | 'formatBody'> & {
  endpoint: string;
  token: string;
  sourcetype?: string;
  source?: string;
  host?: string;
  index?: string;
};

type SplunkEventFields = Pick<SplunkLoggerOptions, 'sourcetype' | 'source' | 'host' | 'index'>;

let formatSplunkEvent = (entry: LogEntry, fields: SplunkEventFields): string =>
  JSON.stringify({
    time: entry.timestamp / 1000,
    host: fields.host,
    source: fields.source,
    sourcetype: fields.sourcetype,
    index: fields.index,
    event: { level: entry.level, message: entry.message, ...entry.fields }
  });

export class SplunkLogger extends HttpLogger {
  constructor(opts: SplunkLoggerOptions) {
    let { endpoint, token, sourcetype, source, host, index, headers, ...rest } = opts;
    super({
      ...rest,
      headers: { authorization: `Splunk ${token}`, ...headers },
      url: `${endpoint.replace(/\/+$/, '')}/services/collector/event`,
      formatBody: entries => ({
        headers: { 'content-type': 'application/json' },
        body: entries
          .map(entry => formatSplunkEvent(entry, { sourcetype, source, host, index }))
          .join('')
      })
    });
  }
}

export type DatadogLoggerOptions = Omit<HttpLoggerOptions, 'url' | 'formatBody'> & {
  apiKey: string;
  site?: string;
  service?: string;
  hostname?: string;
  ddsource?: string;
  tags?: string;
};

type DatadogEventFields = Pick<
  DatadogLoggerOptions,
  'service' | 'hostname' | 'ddsource' | 'tags'
>;

let formatDatadogEvent = (entry: LogEntry, fields: DatadogEventFields) => ({
  ddsource: fields.ddsource,
  ddtags: fields.tags,
  hostname: fields.hostname,
  service: fields.service,
  status: entry.level,
  message: entry.message,
  ...entry.fields
});

export class DatadogLogger extends HttpLogger {
  constructor(opts: DatadogLoggerOptions) {
    let {
      apiKey,
      site = 'datadoghq.com',
      service,
      hostname,
      ddsource,
      tags,
      headers,
      ...rest
    } = opts;
    super({
      ...rest,
      headers: { 'DD-API-KEY': apiKey, ...headers },
      url: `https://http-intake.logs.${site}/api/v2/logs`,
      formatBody: entries => ({
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          entries.map(entry =>
            formatDatadogEvent(entry, { service, hostname, ddsource, tags })
          )
        )
      })
    });
  }
}

export type ElasticLoggerOptions = Omit<HttpLoggerOptions, 'url' | 'formatBody'> & {
  endpoint: string;
  apiKey: string;
  index: string;
};

export class ElasticLogger extends HttpLogger {
  constructor(opts: ElasticLoggerOptions) {
    let { endpoint, apiKey, index, headers, ...rest } = opts;
    super({
      ...rest,
      headers: { authorization: `ApiKey ${apiKey}`, ...headers },
      url: `${endpoint.replace(/\/+$/, '')}/_bulk`,
      formatBody: entries => ({
        headers: { 'content-type': 'application/x-ndjson' },
        body:
          entries
            .flatMap(entry => [
              JSON.stringify({ create: { _index: index } }),
              JSON.stringify({
                '@timestamp': new Date(entry.timestamp).toISOString(),
                'log.level': entry.level,
                message: entry.message,
                ...entry.fields
              })
            ])
            .join('\n') + '\n'
      })
    });
  }
}

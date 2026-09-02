import { LOG_LEVEL_ORDER, type LogFilter, type LogLevel } from './types';

export let minLevel = (level: LogLevel): LogFilter => {
  let threshold = LOG_LEVEL_ORDER[level];
  return entry => LOG_LEVEL_ORDER[entry.level] >= threshold;
};

export let scopeIs =
  (scope: string): LogFilter =>
  entry =>
    entry.fields.scope === scope;

export let scopeStartsWith =
  (prefix: string): LogFilter =>
  entry =>
    typeof entry.fields.scope == 'string' && entry.fields.scope.startsWith(prefix);

export let and =
  (...filters: LogFilter[]): LogFilter =>
  entry =>
    filters.every(f => f(entry));
export let or =
  (...filters: LogFilter[]): LogFilter =>
  entry =>
    filters.some(f => f(entry));
export let not =
  (filter: LogFilter): LogFilter =>
  entry =>
    !filter(entry);

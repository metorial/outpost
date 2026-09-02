import { DEFAULT_MAX_AGE_SECONDS, DEFAULT_MAX_FUTURE_SKEW_SECONDS } from './constants';

export type TimestampFreshnessOptions = {
  now?: number;
  maxAgeSeconds?: number;
  maxFutureSkewSeconds?: number;
};

export let isTimestampFresh = (
  timestamp: number,
  opts: TimestampFreshnessOptions = {}
): boolean => {
  let now = opts.now ?? Math.floor(Date.now() / 1000);
  let maxAge = opts.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  let maxFutureSkew = opts.maxFutureSkewSeconds ?? DEFAULT_MAX_FUTURE_SKEW_SECONDS;

  if (timestamp > now + maxFutureSkew) return false;
  if (timestamp < now - maxAge) return false;

  return true;
};

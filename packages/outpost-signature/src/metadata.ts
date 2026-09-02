import { base64url } from '@metorial-outpost/crypto';
import type { OutpostChain } from './chain';

export type OutpostProxyContext = Record<string, string | undefined>;

export type OutpostSignatureMetadata = {
  version: number;
  outpost_id: string;
  timestamp: number;
  request_id: string;
  service: string;
  signed_headers: string[];
  signature: string;
  outpost_chain?: OutpostChain;
  proxy_context?: OutpostProxyContext;
};

let REQUIRED_STRING_FIELDS: (keyof OutpostSignatureMetadata)[] = [
  'outpost_id',
  'request_id',
  'service',
  'signature'
];

export let assertOutpostSignatureMetadata: (
  value: unknown
) => asserts value is OutpostSignatureMetadata = value => {
  if (typeof value != 'object' || value === null) {
    throw new Error('Invalid Outpost signature metadata: expected an object');
  }

  let metadata = value as Record<string, unknown>;

  if (typeof metadata.version != 'number') {
    throw new Error('Invalid Outpost signature metadata: missing or invalid "version"');
  }

  for (let key of REQUIRED_STRING_FIELDS) {
    if (typeof metadata[key] != 'string') {
      throw new Error(`Invalid Outpost signature metadata: missing or invalid "${key}"`);
    }
  }

  if (typeof metadata.timestamp != 'number') {
    throw new Error('Invalid Outpost signature metadata: missing or invalid "timestamp"');
  }

  if (
    !Array.isArray(metadata.signed_headers) ||
    !metadata.signed_headers.every(header => typeof header == 'string')
  ) {
    throw new Error('Invalid Outpost signature metadata: missing or invalid "signed_headers"');
  }

  if (
    metadata.outpost_chain !== undefined &&
    (!Array.isArray(metadata.outpost_chain) ||
      !metadata.outpost_chain.every(
        entry =>
          Array.isArray(entry) &&
          entry.length == 2 &&
          entry.every(value => typeof value == 'string')
      ))
  ) {
    throw new Error('Invalid Outpost signature metadata: invalid "outpost_chain"');
  }

  if (metadata.proxy_context !== undefined) {
    if (typeof metadata.proxy_context != 'object' || metadata.proxy_context === null) {
      throw new Error('Invalid Outpost signature metadata: invalid "proxy_context"');
    }

    for (let value of Object.values(metadata.proxy_context)) {
      if (value !== undefined && typeof value != 'string') {
        throw new Error('Invalid Outpost signature metadata: invalid "proxy_context"');
      }
    }
  }
};

export let encodeSignatureHeader = (metadata: OutpostSignatureMetadata): string =>
  base64url.encode(new TextEncoder().encode(JSON.stringify(metadata)));

export let decodeSignatureHeader = (header: string): OutpostSignatureMetadata => {
  let json: string;
  try {
    json = new TextDecoder().decode(base64url.decode(header));
  } catch {
    throw new Error('Invalid Outpost signature metadata: malformed base64url');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid Outpost signature metadata: malformed JSON');
  }

  try {
    assertOutpostSignatureMetadata(parsed);
  } catch (error) {
    console.error('Invalid Outpost signature metadata', error);
    throw new Error(
      `Invalid Outpost signature metadata: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return parsed;
};

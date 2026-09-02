import { base64url } from '@metorial-outpost/crypto';
import { describe, expect, it } from 'vitest';
import {
  decodeSignatureHeader,
  encodeSignatureHeader,
  type OutpostSignatureMetadata
} from './metadata';

let encodeRawJson = (json: string) => base64url.encode(new TextEncoder().encode(json));

let sample: OutpostSignatureMetadata = {
  version: 1,
  outpost_id: 'otp_123',
  timestamp: 1788084301,
  request_id: 'req_123',
  service: 'metorial.proxy',
  signed_headers: ['authorization', 'content-type'],
  signature: 'signature-bytes'
};

describe('signature metadata', () => {
  it('round-trips through encode/decode', () => {
    let header = encodeSignatureHeader(sample);
    expect(decodeSignatureHeader(header)).toEqual(sample);
  });

  it('produces an unpadded base64url string', () => {
    let header = encodeSignatureHeader(sample);
    expect(header).not.toMatch(/[+/=]/);
  });

  it.each(['outpost_id', 'request_id', 'service', 'signature'] as const)(
    'rejects metadata missing "%s"',
    key => {
      let { [key]: _omit, ...rest } = sample;
      let header = encodeSignatureHeader(rest as OutpostSignatureMetadata);
      expect(() => decodeSignatureHeader(header)).toThrow();
    }
  );

  it('accepts and round-trips an "outpost_chain"', () => {
    let withChain: OutpostSignatureMetadata = {
      ...sample,
      outpost_chain: [
        ['otp_a', 'oti_a'],
        ['otp_b', 'oti_b']
      ]
    };
    let header = encodeSignatureHeader(withChain);
    expect(decodeSignatureHeader(header)).toEqual(withChain);
  });

  it('rejects metadata whose "outpost_chain" is not an array of ID tuples', () => {
    let header = encodeSignatureHeader({ ...sample, outpost_chain: [1, 2] as any });
    expect(() => decodeSignatureHeader(header)).toThrow();

    let legacyHeader = encodeSignatureHeader({
      ...sample,
      outpost_chain: ['otp_a', 'otp_b'] as any
    });
    expect(() => decodeSignatureHeader(legacyHeader)).toThrow();
  });

  it('rejects metadata with a non-numeric version', () => {
    let header = encodeSignatureHeader({ ...sample, version: '1' as any });
    expect(() => decodeSignatureHeader(header)).toThrow();
  });

  it('rejects metadata with a non-numeric timestamp', () => {
    let header = encodeSignatureHeader({ ...sample, timestamp: '1788084301' as any });
    expect(() => decodeSignatureHeader(header)).toThrow();
  });

  it('rejects metadata whose signed_headers is not a string array', () => {
    let header = encodeSignatureHeader({ ...sample, signed_headers: [1, 2] as any });
    expect(() => decodeSignatureHeader(header)).toThrow();
  });

  it('rejects malformed JSON', () => {
    expect(() => decodeSignatureHeader(encodeRawJson('not json'))).toThrow();
  });

  it('rejects a non-object payload', () => {
    expect(() => decodeSignatureHeader(encodeRawJson('"just a string"'))).toThrow();
    expect(() => decodeSignatureHeader(encodeRawJson('null'))).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { canonicalMessage, decodeCanonical, encodeCanonical, field } from './canonical';

describe('canonical', () => {
  it('starts with the magic value', () => {
    let message = canonicalMessage('metorial-outpost-request-v1', []);
    let { magic } = decodeCanonical(message);

    expect(magic).toBe('metorial-canonical-v1');
  });

  it('round-trips string, bytes, and uint fields in order', () => {
    let bytes = new Uint8Array([1, 2, 3, 4]);

    let message = canonicalMessage('metorial-outpost-request-v1', [
      field.string('outpost-id', 'otp_123'),
      field.uint('timestamp', 1788084301),
      field.bytes('body-sha256', bytes)
    ]);

    let decoded = decodeCanonical(message);

    expect(decoded.fields).toHaveLength(4);
    expect(decoded.fields[0]).toEqual({
      name: 'context',
      type: 'string',
      value: expect.any(Uint8Array)
    });
    expect(new TextDecoder().decode(decoded.fields[0]!.value)).toBe(
      'metorial-outpost-request-v1'
    );

    expect(decoded.fields[1]!.name).toBe('outpost-id');
    expect(new TextDecoder().decode(decoded.fields[1]!.value)).toBe('otp_123');

    expect(decoded.fields[2]!.name).toBe('timestamp');
    expect(new TextDecoder().decode(decoded.fields[2]!.value)).toBe('1788084301');

    expect(decoded.fields[3]!.name).toBe('body-sha256');
    expect(decoded.fields[3]!.value).toEqual(bytes);
  });

  it('supports repeated field names', () => {
    let message = encodeCanonical([
      field.string('context', 'metorial-outpost-request-v1'),
      field.string('signed-header-name', 'authorization'),
      field.string('signed-header-value', 'Bearer abc'),
      field.string('signed-header-name', 'content-type'),
      field.string('signed-header-value', 'application/json')
    ]);

    let { fields } = decodeCanonical(message);
    let names = fields.map(f => f.name);

    expect(names).toEqual([
      'context',
      'signed-header-name',
      'signed-header-value',
      'signed-header-name',
      'signed-header-value'
    ]);
  });

  it('produces different bytes when field order differs', () => {
    let a = encodeCanonical([field.string('a', '1'), field.string('b', '2')]);
    let b = encodeCanonical([field.string('b', '2'), field.string('a', '1')]);

    expect(a).not.toEqual(b);
  });

  it('produces different bytes when integer encoding differs from string encoding', () => {
    let asString = encodeCanonical([field.string('n', '12345')]);
    let asUint = encodeCanonical([field.uint('n', 12345)]);

    expect(asString).not.toEqual(asUint);
  });

  it('rejects negative integers', () => {
    expect(() => encodeCanonical([field.uint('n', -1)])).toThrow();
  });

  it('rejects invalid field names', () => {
    expect(() => encodeCanonical([field.string('Invalid-Name', 'x')])).toThrow();
    expect(() => encodeCanonical([field.string('_bad', 'x')])).toThrow();
    expect(() => encodeCanonical([field.string('has space', 'x')])).toThrow();
  });

  it('accepts bigint uint values', () => {
    let message = encodeCanonical([field.uint('n', 9007199254740993n)]);
    let { fields } = decodeCanonical(message);

    expect(new TextDecoder().decode(fields[0]!.value)).toBe('9007199254740993');
  });

  it('rejects truncated input', () => {
    let message = canonicalMessage('metorial-outpost-request-v1', [field.string('a', 'b')]);
    expect(() => decodeCanonical(message.slice(0, message.length - 8))).toThrow();
  });

  it('rejects an unknown magic value', () => {
    let message = encodeCanonical([field.string('context', 'x')]);
    let corrupted = new Uint8Array(message);
    corrupted[3] = 5;
    expect(() => decodeCanonical(corrupted)).toThrow();
  });
});

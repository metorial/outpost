import { describe, expect, it } from 'vitest';
import {
  assertCanonicalPath,
  assertCanonicalQuery,
  normalizeAuthority,
  normalizeScheme
} from './canonicalization';

describe('normalizeScheme', () => {
  it('lowercases the scheme', () => {
    expect(normalizeScheme('HTTPS')).toBe('https');
  });
});

describe('normalizeAuthority', () => {
  it('lowercases the host', () => {
    expect(normalizeAuthority('API.Metorial.com')).toBe('api.metorial.com');
  });

  it('strips the default port for the given scheme', () => {
    expect(normalizeAuthority('api.metorial.com:443', 'https')).toBe('api.metorial.com');
    expect(normalizeAuthority('api.metorial.com:80', 'http')).toBe('api.metorial.com');
  });

  it('keeps a non-default port', () => {
    expect(normalizeAuthority('api.metorial.com:8443', 'https')).toBe('api.metorial.com:8443');
  });

  it('keeps the port when no scheme is provided', () => {
    expect(normalizeAuthority('api.metorial.com:443')).toBe('api.metorial.com:443');
  });
});

describe('assertCanonicalPath', () => {
  it('accepts a normal absolute path', () => {
    expect(() => assertCanonicalPath('/v1/foo')).not.toThrow();
  });

  it('rejects a path that does not start with "/"', () => {
    expect(() => assertCanonicalPath('v1/foo')).toThrow();
  });

  it('rejects CR, LF, and NUL', () => {
    expect(() => assertCanonicalPath('/foo\r\nbar')).toThrow();
    expect(() => assertCanonicalPath('/foo\0bar')).toThrow();
  });

  it('rejects invalid percent-encoding', () => {
    expect(() => assertCanonicalPath('/foo%2')).toThrow();
    expect(() => assertCanonicalPath('/foo%zz')).toThrow();
  });

  it('treats distinctly percent-encoded and raw paths as different by leaving them untouched', () => {
    expect(() => assertCanonicalPath('/foo/%2F/bar')).not.toThrow();
    expect(() => assertCanonicalPath('/foo///bar')).not.toThrow();
  });
});

describe('assertCanonicalQuery', () => {
  it('accepts a raw query string without the leading "?"', () => {
    expect(() => assertCanonicalQuery('foo=1&foo=2')).not.toThrow();
  });

  it('rejects a query string with a leading "?"', () => {
    expect(() => assertCanonicalQuery('?foo=1')).toThrow();
  });

  it('rejects CR, LF, and NUL', () => {
    expect(() => assertCanonicalQuery('foo=1\r\nbar=2')).toThrow();
  });

  it('rejects invalid percent-encoding', () => {
    expect(() => assertCanonicalQuery('foo=%2')).toThrow();
  });
});

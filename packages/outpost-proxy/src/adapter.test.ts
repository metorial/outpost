import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { sortOutpostProxyAdapters, type OutpostProxyAdapter } from './adapter';

let adapter = (path: string): OutpostProxyAdapter => ({ path, app: new Hono() });

describe('sortOutpostProxyAdapters', () => {
  it('keeps a "/" fallback last', () => {
    let sorted = sortOutpostProxyAdapters([adapter('/'), adapter('/test'), adapter('/abc')]);
    expect(sorted.map(a => a.path)).toEqual(['/test', '/abc', '/']);
  });

  it('orders more specific (deeper) paths before shallower ones', () => {
    let sorted = sortOutpostProxyAdapters([
      adapter('/abc'),
      adapter('/abc/nested'),
      adapter('/')
    ]);
    expect(sorted.map(a => a.path)).toEqual(['/abc/nested', '/abc', '/']);
  });

  it('preserves relative order between adapters of equal specificity', () => {
    let sorted = sortOutpostProxyAdapters([adapter('/b'), adapter('/a'), adapter('/c')]);
    expect(sorted.map(a => a.path)).toEqual(['/b', '/a', '/c']);
  });

  it('does not mutate the input array', () => {
    let input = [adapter('/'), adapter('/test')];
    let sorted = sortOutpostProxyAdapters(input);
    expect(input.map(a => a.path)).toEqual(['/', '/test']);
    expect(sorted).not.toBe(input);
  });
});

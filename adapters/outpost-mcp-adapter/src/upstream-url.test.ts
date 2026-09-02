import { describe, expect, it } from 'vitest';
import { buildUpstreamUrl } from './upstream-url';

describe('buildUpstreamUrl', () => {
  it('preserves the full path', () => {
    let url = buildUpstreamUrl(
      'https://api.example.com',
      'https://proxy.local/connect/mcp/sess1'
    );
    expect(url).toBe('https://api.example.com/connect/mcp/sess1');
  });

  it('preserves the query string', () => {
    let url = buildUpstreamUrl(
      'https://api.example.com',
      'https://proxy.local/connect/mcp/sess1?connection_token=abc'
    );
    expect(url).toBe('https://api.example.com/connect/mcp/sess1?connection_token=abc');
  });
});

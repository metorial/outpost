let CONTROL_CHAR_PATTERN = /[\r\n\0]/;
let INVALID_PERCENT_ESCAPE_PATTERN = /%(?![0-9A-Fa-f]{2})/;

let DEFAULT_PORT_BY_SCHEME: Record<string, string> = { http: '80', https: '443' };

export let normalizeScheme = (scheme: string): string => scheme.toLowerCase();

export let normalizeAuthority = (authority: string, scheme?: string): string => {
  let lower = authority.toLowerCase();
  if (!scheme) return lower;

  let defaultPort = DEFAULT_PORT_BY_SCHEME[scheme.toLowerCase()];
  if (defaultPort && lower.endsWith(`:${defaultPort}`)) {
    return lower.slice(0, -(defaultPort.length + 1));
  }

  return lower;
};

export let assertCanonicalPath = (path: string): void => {
  if (!path.startsWith('/')) throw new Error('Canonical path must start with "/"');

  if (CONTROL_CHAR_PATTERN.test(path))
    throw new Error('Canonical path contains a forbidden CR, LF, or NUL byte');

  if (INVALID_PERCENT_ESCAPE_PATTERN.test(path))
    throw new Error('Canonical path contains invalid percent-encoding');
};

export let assertCanonicalQuery = (query: string): void => {
  if (query.startsWith('?')) throw new Error('Canonical query must not include a leading "?"');

  if (CONTROL_CHAR_PATTERN.test(query))
    throw new Error('Canonical query contains a forbidden CR, LF, or NUL byte');

  if (INVALID_PERCENT_ESCAPE_PATTERN.test(query))
    throw new Error('Canonical query contains invalid percent-encoding');
};

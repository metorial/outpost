import { DEFAULT_REQUIRED_SIGNED_HEADERS } from './constants';

export type SignedHeader = { name: string; value: string };

export type HeaderMap = Record<string, string | string[] | undefined>;

let CONTROL_CHAR_PATTERN = /[\r\n\0]/;
let OPTIONAL_WHITESPACE_PATTERN = /^[ \t]+|[ \t]+$/g;

let assertHeaderValue = (name: string, value: string) => {
  if (CONTROL_CHAR_PATTERN.test(value)) {
    throw new Error(`Header "${name}" contains a forbidden CR, LF, or NUL byte`);
  }
};

export let canonicalizeSignedHeaders = (
  headers: HeaderMap,
  headerNames: string[]
): SignedHeader[] => {
  let byName = new Map<string, string>();

  for (let rawName of headerNames) {
    let name = rawName.toLowerCase();
    let rawValue = headers[name] ?? headers[rawName];
    if (rawValue === undefined) continue;

    let value = Array.isArray(rawValue) ? rawValue.join(', ') : rawValue;
    value = value.replace(OPTIONAL_WHITESPACE_PATTERN, '');

    assertHeaderValue(name, value);
    byName.set(name, value);
  }

  return Array.from(byName.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => ({ name, value }));
};

export let findMissingRequiredSignedHeaders = (
  presentHeaderNames: string[],
  signedHeaderNames: string[],
  requiredPatterns: (string | RegExp)[] = DEFAULT_REQUIRED_SIGNED_HEADERS
): string[] => {
  let signed = new Set(signedHeaderNames.map(name => name.toLowerCase()));
  let missing: string[] = [];

  for (let rawName of presentHeaderNames) {
    let name = rawName.toLowerCase();
    let isRequired = requiredPatterns.some(pattern =>
      typeof pattern == 'string' ? pattern.toLowerCase() == name : pattern.test(name)
    );

    if (isRequired && !signed.has(name)) missing.push(name);
  }

  return missing;
};

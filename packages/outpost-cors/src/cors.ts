export type CorsOriginOption = string[] | ((origin: string) => boolean);

let CORS_ALLOW_METHODS = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
let CORS_ALLOW_HEADERS =
  'Content-Type, Authorization, metorial-version, mcp-protocol-version, MCP-Session-ID, Last-Event-ID, baggage, sentry-trace';
let CORS_EXPOSE_HEADERS =
  'Metorial-Connection-Id, Metorial-Connection-Token, Metorial-Session-Id, MCP-Session-ID';
let CORS_MAX_AGE = '86400';

let CORS_RESPONSE_HEADER_NAMES = [
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-allow-credentials',
  'access-control-max-age',
  'vary'
];

export let isCorsOriginAllowed = (
  origin: string | undefined,
  corsOrigins?: CorsOriginOption
): boolean => {
  if (!origin) return false;
  if (!corsOrigins) return true;
  return typeof corsOrigins === 'function'
    ? corsOrigins(origin)
    : corsOrigins.includes(origin);
};

let applyCorsHeaders = (
  headers: Headers,
  origin: string | undefined,
  corsOrigins?: CorsOriginOption
): void => {
  for (let name of CORS_RESPONSE_HEADER_NAMES) headers.delete(name);
  if (!isCorsOriginAllowed(origin, corsOrigins)) return;

  headers.set('Access-Control-Allow-Origin', origin!);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', CORS_ALLOW_METHODS);
  headers.set('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
  headers.set('Access-Control-Expose-Headers', CORS_EXPOSE_HEADERS);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Max-Age', CORS_MAX_AGE);
};

export let withCorsHeaders = (
  response: Response,
  origin: string | undefined,
  corsOrigins?: CorsOriginOption
): Response => {
  let headers = new Headers(response.headers);
  applyCorsHeaders(headers, origin, corsOrigins);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

export let corsPreflightResponse = (
  origin: string | undefined,
  corsOrigins?: CorsOriginOption
): Response => {
  let headers = new Headers();
  applyCorsHeaders(headers, origin, corsOrigins);
  return new Response(null, { status: 204, headers });
};

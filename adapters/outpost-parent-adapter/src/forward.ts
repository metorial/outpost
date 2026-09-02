import { OUTPOST_SIGNATURE_HEADER_NAMES } from '@metorial-outpost/signature';

export type ForwardToParentOptions = {
  endpoint: string;
  fetch: typeof fetch;
};

let HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding'
]);

let filterHeaders = (headers: Headers): Record<string, string> => {
  let record: Record<string, string> = {};
  headers.forEach((value, name) => {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) record[name] = value;
  });
  return record;
};

export let filterHeadersForResigning = (headers: Headers): Record<string, string> => {
  let record: Record<string, string> = {};
  headers.forEach((value, name) => {
    let lower = name.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lower) && !OUTPOST_SIGNATURE_HEADER_NAMES.includes(lower)) {
      record[name] = value;
    }
  });
  return record;
};

export let joinUrl = (endpoint: string, path: string): string =>
  `${endpoint.replace(/\/+$/, '')}${path}`;

export let forwardToParent = async (
  options: ForwardToParentOptions,
  path: string,
  request: Request
): Promise<Response> => {
  let method = request.method;
  let body =
    method == 'GET' || method == 'HEAD'
      ? undefined
      : new Uint8Array(await request.arrayBuffer());

  return options.fetch(joinUrl(options.endpoint, path), {
    method,
    headers: filterHeaders(request.headers),
    body
  });
};

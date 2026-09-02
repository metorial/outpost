import type { OutpostAuth } from '@metorial-outpost/auth';
import type { OutpostChain, OutpostProxyContext } from '@metorial-outpost/signature';

export type OutpostFetchOptions = {
  auth: OutpostAuth;
  service?: string;
  fetch?: typeof fetch;
};

export type OutpostFetchInit = RequestInit & {
  service?: string;
  proxyContext?: OutpostProxyContext;
  outpostChain?: OutpostChain;
};

export type OutpostFetchFunction = (
  input: RequestInfo | URL,
  init?: OutpostFetchInit
) => Promise<Response>;

let encoder = new TextEncoder();
let MAX_REDIRECTS = 5;
let REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

let headersToRecord = (headers: Headers): Record<string, string> => {
  let record: Record<string, string> = {};
  headers.forEach((value, name) => (record[name] = value));
  return record;
};

let headersInitToRecord = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) return {};
  if (headers instanceof Headers) return headersToRecord(headers);
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([name, value]) => [name.toLowerCase(), value]));
  }
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
  );
};

let normalizeBody = (body: BodyInit | null | undefined): Uint8Array | undefined => {
  if (body == null) return undefined;
  if (typeof body == 'string') return encoder.encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body))
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof URLSearchParams) return encoder.encode(body.toString());

  throw new Error(
    'OutpostFetch: unsupported body type -- pass a string, Uint8Array, ArrayBuffer, or ' +
      'URLSearchParams. Pre-serialize FormData/Blob/ReadableStream bodies before calling fetch().'
  );
};

let isPathWithinEditDistance = (a: string, b: string, maximum: number): boolean => {
  if (Math.abs(a.length - b.length) > maximum) return false;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let aIndex = 1; aIndex <= a.length; aIndex++) {
    let current = [aIndex];

    for (let bIndex = 1; bIndex <= b.length; bIndex++) {
      let value = Math.min(
        previous[bIndex]! + 1,
        current[bIndex - 1]! + 1,
        previous[bIndex - 1]! + (a[aIndex - 1] == b[bIndex - 1] ? 0 : 1)
      );
      current.push(value);
    }

    previous = current;
  }

  return previous[b.length]! <= maximum;
};

export let shouldFollowOutpostRedirect = (from: URL, to: URL): boolean => {
  if (to.username || to.password) return false;

  let isHttpUpgrade =
    from.protocol == 'http:' &&
    to.protocol == 'https:' &&
    from.hostname == to.hostname &&
    (from.port == '' || from.port == '80') &&
    (to.port == '' || to.port == '443');
  if (isHttpUpgrade) return true;

  return (
    from.origin == to.origin &&
    from.search == to.search &&
    isPathWithinEditDistance(from.pathname, to.pathname, 2)
  );
};

let replaceHeader = (headers: Record<string, string>, name: string, value: string): void => {
  for (let existingName of Object.keys(headers)) {
    if (existingName.toLowerCase() == name.toLowerCase()) delete headers[existingName];
  }
  headers[name] = value;
};

let deleteHeaders = (headers: Record<string, string>, names: string[]): void => {
  let normalizedNames = new Set(names.map(name => name.toLowerCase()));
  for (let name of Object.keys(headers)) {
    if (normalizedNames.has(name.toLowerCase())) delete headers[name];
  }
};

export class OutpostFetch {
  private auth: OutpostAuth;
  private service: string | undefined;
  private fetchImpl: typeof fetch;

  constructor(opts: OutpostFetchOptions) {
    this.auth = opts.auth;
    this.service = opts.service;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  fetch: OutpostFetchFunction = async (input, init = {}) => {
    let { service, proxyContext, outpostChain, ...requestInit } = init;

    let url: string;
    let method: string;
    let headers: Record<string, string>;
    let body: Uint8Array | undefined;

    if (input instanceof Request) {
      url = input.url;
      method = requestInit.method ?? input.method;

      headers = {
        ...headersToRecord(input.headers),
        ...headersInitToRecord(requestInit.headers)
      };

      body =
        requestInit.body !== undefined
          ? normalizeBody(requestInit.body)
          : method == 'GET' || method == 'HEAD'
            ? undefined
            : new Uint8Array(await input.clone().arrayBuffer());
    } else {
      url = input.toString();
      method = requestInit.method ?? 'GET';
      headers = headersInitToRecord(requestInit.headers);
      body = normalizeBody(requestInit.body);
    }

    let currentUrl = new URL(url);
    let currentMethod = method;
    let currentBody = body;

    for (let redirectCount = 0; ; redirectCount++) {
      let signedHeaders = await this.auth.sign({
        method: currentMethod,
        url: currentUrl.toString(),
        service: service ?? this.service,
        headers,
        body: currentBody,
        proxyContext,
        outpostChain
      });

      for (let [name, value] of Object.entries(signedHeaders)) {
        replaceHeader(headers, name, value);
      }

      let response = await this.fetchImpl(currentUrl.toString(), {
        ...requestInit,
        method: currentMethod,
        headers,
        body: currentBody,
        redirect: 'manual'
      });
      let location = response.headers.get('location');
      if (
        !REDIRECT_STATUSES.has(response.status) ||
        !location ||
        redirectCount >= MAX_REDIRECTS
      ) {
        return response;
      }

      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location, currentUrl);
      } catch {
        return response;
      }
      if (!shouldFollowOutpostRedirect(currentUrl, redirectUrl)) return response;

      await response.body?.cancel();

      if (
        response.status == 303 ||
        ((response.status == 301 || response.status == 302) && currentMethod == 'POST')
      ) {
        currentMethod = 'GET';
        currentBody = undefined;
        deleteHeaders(headers, ['content-type', 'content-encoding', 'content-length']);
      }

      currentUrl = redirectUrl;
    }
  };
}

export let createOutpostFetch = (opts: OutpostFetchOptions): OutpostFetchFunction => {
  return new OutpostFetch(opts).fetch;
};

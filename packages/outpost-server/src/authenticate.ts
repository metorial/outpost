import { base64url, Ed25519 } from '@metorial-outpost/crypto';
import {
  canonicalizeSignedHeaders,
  decodeSignatureHeader,
  DEFAULT_MAX_AGE_SECONDS,
  DEFAULT_MAX_FUTURE_SKEW_SECONDS,
  findMissingRequiredSignedHeaders,
  hashBody,
  OUTPOST_ID_HEADER,
  OUTPOST_INSTANCE_TOKEN_HEADER,
  OUTPOST_SIGNATURE_HEADER,
  PROTOCOL_VERSION,
  verifyInstanceIdSignature,
  verifyRequestSignature,
  type OutpostChain,
  type OutpostProxyContext
} from '@metorial-outpost/signature';
import type { OutpostTokens } from '@metorial-outpost/tokens';
import type { Context, MiddlewareHandler } from 'hono';
import { INSTANCE_TOKEN_TYPE } from './constants';
import { OutpostServerError } from './errors';
import type { OutpostRegistrationResolver } from './resolver';

export type AuthenticatedOutpostRequest = {
  outpostId: string;
  instanceId: string;
  credentialId: string;
  service: string;
  grantedServices: string[];
  requestId: string;
  timestamp: number;
  outpostChain: OutpostChain;
  proxyContext?: OutpostProxyContext;
};

export type AuthenticateOptions = {
  tokens: OutpostTokens;
  service: string;
  resolver?: OutpostRegistrationResolver;
};

export let verifyOutpostRequest = async (
  options: AuthenticateOptions,
  c: Context
): Promise<AuthenticatedOutpostRequest> => {
  let outpostIdHeader = c.req.header(OUTPOST_ID_HEADER);
  let signatureHeader = c.req.header(OUTPOST_SIGNATURE_HEADER);
  let instanceTokenHeader = c.req.header(OUTPOST_INSTANCE_TOKEN_HEADER);
  if (!outpostIdHeader || !signatureHeader || !instanceTokenHeader) {
    throw new OutpostServerError('missing_authentication');
  }

  let metadata;
  try {
    metadata = decodeSignatureHeader(signatureHeader);
  } catch {
    throw new OutpostServerError('malformed_signature_header');
  }

  if (metadata.version != PROTOCOL_VERSION) {
    throw new OutpostServerError('unsupported_version');
  }

  let verifiedToken = await options.tokens.verify({
    token: instanceTokenHeader,
    expectedType: INSTANCE_TOKEN_TYPE
  });
  if (!verifiedToken.verified) throw new OutpostServerError('invalid_instance_token');

  let tokenData = verifiedToken.data as {
    outpost_id: string;
    instance_id: string;
    credential_id: string;
    instance_public_key: string;
    credential_instance_id_signature?: string;
    services?: string[];
  };

  if (outpostIdHeader != metadata.outpost_id || metadata.outpost_id != tokenData.outpost_id) {
    throw new OutpostServerError('outpost_mismatch');
  }

  if (options.resolver) {
    let authorization = await options.resolver.resolveInstanceAuthorization({
      outpostId: tokenData.outpost_id,
      instanceId: tokenData.instance_id,
      credentialId: tokenData.credential_id
    });

    if (authorization.status == 'unknown')
      throw new OutpostServerError('invalid_instance_token');
    if (authorization.status == 'instance_disabled') {
      throw new OutpostServerError('instance_disabled');
    }
    if (authorization.status == 'outpost_disabled') {
      throw new OutpostServerError('outpost_disabled');
    }

    let enrollmentCredential = await options.resolver.resolveEnrollmentCredential({
      outpostId: tokenData.outpost_id,
      credentialId: tokenData.credential_id
    });

    if (enrollmentCredential.status == 'unknown') {
      throw new OutpostServerError('unknown_outpost_credential');
    }
    if (enrollmentCredential.status == 'revoked') {
      throw new OutpostServerError('revoked_outpost_credential');
    }

    if (typeof tokenData.credential_instance_id_signature != 'string') {
      throw new OutpostServerError('invalid_credential_signature');
    }

    let enrollmentPublicKey = await Ed25519.importPublicKey(enrollmentCredential.publicKey);
    let credentialSignatureVerified = await verifyInstanceIdSignature(
      enrollmentPublicKey,
      {
        outpostId: tokenData.outpost_id,
        credentialId: tokenData.credential_id,
        instanceId: tokenData.instance_id
      },
      tokenData.credential_instance_id_signature
    );
    if (!credentialSignatureVerified) {
      throw new OutpostServerError('invalid_credential_signature');
    }
  }

  if (metadata.service != options.service) {
    throw new OutpostServerError('service_mismatch');
  }

  let now = Math.floor(Date.now() / 1000);
  if (metadata.timestamp > now + DEFAULT_MAX_FUTURE_SKEW_SECONDS) {
    throw new OutpostServerError('future_request');
  }
  if (metadata.timestamp < now - DEFAULT_MAX_AGE_SECONDS) {
    throw new OutpostServerError('stale_request');
  }

  let presentHeaderNames = Array.from(c.req.raw.headers.keys());
  let missing = findMissingRequiredSignedHeaders(presentHeaderNames, metadata.signed_headers);
  if (missing.length > 0) throw new OutpostServerError('missing_required_signed_header');

  let headerMap: Record<string, string> = {};
  c.req.raw.headers.forEach((value, name) => (headerMap[name] = value));
  let signedHeaders = canonicalizeSignedHeaders(headerMap, metadata.signed_headers);

  let bodyBytes = new Uint8Array(await c.req.raw.clone().arrayBuffer());
  let url = new URL(c.req.url);

  let forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  let forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
  let scheme = forwardedProto || url.protocol.replace(/:$/, '');
  let authority = forwardedHost || url.host;

  let instancePublicKey = await Ed25519.importPublicKey(
    base64url.decode(tokenData.instance_public_key)
  );

  let verifiedSignature = await verifyRequestSignature(
    instancePublicKey,
    {
      version: metadata.version,
      outpostId: metadata.outpost_id,
      instanceId: tokenData.instance_id,
      timestamp: metadata.timestamp,
      requestId: metadata.request_id,
      service: metadata.service,
      method: c.req.method,
      scheme,
      authority,
      path: url.pathname,
      query: url.search.replace(/^\?/, ''),
      signedHeaders,
      bodySha256: await hashBody(bodyBytes),
      outpostChain: metadata.outpost_chain,
      proxyContext: metadata.proxy_context
    },
    metadata.signature
  );
  if (!verifiedSignature) throw new OutpostServerError('invalid_signature');

  return {
    outpostId: metadata.outpost_id,
    instanceId: tokenData.instance_id,
    credentialId: tokenData.credential_id,
    service: metadata.service,
    grantedServices: Array.isArray(tokenData.services) ? tokenData.services : [],
    requestId: metadata.request_id,
    timestamp: metadata.timestamp,
    outpostChain: metadata.outpost_chain ?? [],
    proxyContext: metadata.proxy_context
  };
};

export let verifyOutpostRequestIfPresent = async (
  options: AuthenticateOptions,
  c: Context
): Promise<AuthenticatedOutpostRequest | undefined> => {
  if (
    !c.req.header(OUTPOST_SIGNATURE_HEADER) &&
    !c.req.header(OUTPOST_INSTANCE_TOKEN_HEADER)
  ) {
    return undefined;
  }

  return verifyOutpostRequest(options, c);
};

export let authenticateOutpostRequest = (
  options: AuthenticateOptions
): MiddlewareHandler<{ Variables: { outpostAuth: AuthenticatedOutpostRequest } }> => {
  return async (c, next) => {
    c.set('outpostAuth', await verifyOutpostRequest(options, c));
    return next();
  };
};

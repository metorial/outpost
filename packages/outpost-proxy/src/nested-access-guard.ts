import {
  isManifestAccessAllowed,
  OutpostServerError,
  verifyOutpostRequest,
  type AuthenticatedOutpostRequest,
  type OutpostManifest,
  type OutpostRegistrationResolver
} from '@metorial-outpost/server';
import {
  OUTPOST_INSTANCE_TOKEN_HEADER,
  OUTPOST_SIGNATURE_HEADER
} from '@metorial-outpost/signature';
import type { OutpostTokens } from '@metorial-outpost/tokens';
import type { MiddlewareHandler } from 'hono';

export type NestedAccessGuardOptions = {
  tokens: OutpostTokens;
  service: string;
  selfOutpostId: string;
  selfManifest: { current(): OutpostManifest | undefined };
  resolveOutpostManifest: (outpostId: string) => Promise<OutpostManifest | undefined>;
  resolver?: OutpostRegistrationResolver;
};

export let guardNestedOutpostAccess = (
  options: NestedAccessGuardOptions
): MiddlewareHandler<{ Variables: { outpostAuth?: AuthenticatedOutpostRequest } }> => {
  return async (c, next) => {
    if (
      !c.req.header(OUTPOST_SIGNATURE_HEADER) &&
      !c.req.header(OUTPOST_INSTANCE_TOKEN_HEADER)
    ) {
      return next();
    }

    let authed = await verifyOutpostRequest(
      { tokens: options.tokens, service: options.service, resolver: options.resolver },
      c
    );
    c.set('outpostAuth', authed);

    if (authed.outpostId == options.selfOutpostId) return next();

    let [childManifest, selfManifest] = await Promise.all([
      options.resolveOutpostManifest(authed.outpostId),
      Promise.resolve(options.selfManifest.current())
    ]);
    if (!childManifest || !selfManifest) throw new OutpostServerError('unknown_outpost');
    if (!isManifestAccessAllowed(childManifest.access, selfManifest.access)) {
      throw new OutpostServerError('insufficient_capabilities');
    }

    return next();
  };
};

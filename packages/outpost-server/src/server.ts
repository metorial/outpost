import type { OutpostTokens } from '@metorial-outpost/tokens';
import { Hono } from 'hono';
import { authenticateOutpostRequest } from './authenticate';
import {
  InMemoryChallengeStore,
  type ChallengeStore,
  type StoredChallenge
} from './challenge-store';
import {
  DEFAULT_BASE_PATH,
  DEFAULT_CHALLENGE_TTL_MS,
  DEFAULT_INSTANCE_TOKEN_TTL_MS,
  OUTPOST_PROTOCOL_SERVICE
} from './constants';
import { OutpostServerError } from './errors';
import type { OutpostRegistrationResolver } from './resolver';
import { challengeHandler } from './routes/challenge';
import { issuerKeyHandler } from './routes/issuer-key';
import { manifestHandler } from './routes/manifest';
import { publicKeyHandler } from './routes/public-key';
import { registerHandler } from './routes/register';

export type CreateOutpostServerOptions = {
  resolver: OutpostRegistrationResolver;
  tokens: OutpostTokens;
  signer?: (input: {
    outpostId: string;
    credentialId: string;
    instanceId: string;
  }) => Promise<OutpostTokens>;
  challengeStore?: ChallengeStore;
  challengeTtlMs?: number;
  instanceTokenExpiresAt?: (challenge: StoredChallenge) => Date | undefined;
  basePath?: string;
  onError?: (error: unknown) => void;
};

export let createOutpostServer = (options: CreateOutpostServerOptions): Hono => {
  let app = new Hono();
  let basePath = options.basePath ?? DEFAULT_BASE_PATH;
  let challengeTtlMs = options.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS;
  let store = options.challengeStore ?? new InMemoryChallengeStore(challengeTtlMs);

  // Only used when the resolver doesn't report an expiry of its own.
  let instanceTokenExpiresAt =
    options.instanceTokenExpiresAt ??
    (() => new Date(Date.now() + DEFAULT_INSTANCE_TOKEN_TTL_MS));

  app.onError((error, c) => {
    if (error instanceof OutpostServerError) {
      return c.json(
        { error: error.code, error_message: error.message },
        { status: error.status as any }
      );
    }

    console.error(error);
    options.onError?.(error);

    return c.json({ error: 'internal_server_error' }, 500);
  });

  app.post(
    `${basePath}/register/challenge`,
    challengeHandler({
      resolver: options.resolver,
      store,
      tokens: options.tokens,
      challengeTtlMs
    })
  );

  app.post(
    `${basePath}/register`,
    registerHandler({
      resolver: options.resolver,
      store,
      tokens: options.tokens,
      signer: options.signer,
      instanceTokenExpiresAt
    })
  );

  let auth = authenticateOutpostRequest({
    tokens: options.tokens,
    service: OUTPOST_PROTOCOL_SERVICE,
    resolver: options.resolver
  });

  app.get(
    `${basePath}/public-key/:outpostId/:credentialId`,
    auth,
    publicKeyHandler({ resolver: options.resolver })
  );

  app.get(
    `${basePath}/manifest/:outpostId`,
    auth,
    manifestHandler({ resolver: options.resolver })
  );

  app.get(`${basePath}/issuer-key/:kid`, issuerKeyHandler({ tokens: options.tokens }));

  return app;
};

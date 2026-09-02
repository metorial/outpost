import {
  base64url,
  canonicalMessage,
  Ed25519,
  field,
  randomBytes
} from '@metorial-outpost/crypto';
import { PROTOCOL_VERSION, REGISTRATION_CONTEXT } from './constants';

export type RegistrationSignatureInput = {
  version?: number;
  challengeId: string;
  challenge: Uint8Array;
  outpostId: string;
  credentialId: string;
  instanceId: string;
  instancePublicKey: Uint8Array;
};

export let buildRegistrationSignatureBase = (input: RegistrationSignatureInput): Uint8Array =>
  canonicalMessage(REGISTRATION_CONTEXT, [
    field.uint('version', input.version ?? PROTOCOL_VERSION),
    field.string('challenge-id', input.challengeId),
    field.bytes('challenge', input.challenge),
    field.string('outpost-id', input.outpostId),
    field.string('credential-id', input.credentialId),
    field.string('instance-id', input.instanceId),
    field.bytes('instance-public-key', input.instancePublicKey)
  ]);

export let signRegistration = async (
  privateKey: CryptoKey,
  input: RegistrationSignatureInput
): Promise<string> =>
  base64url.encode(await Ed25519.sign(privateKey, buildRegistrationSignatureBase(input)));

export let verifyRegistrationSignature = (
  publicKey: CryptoKey,
  input: RegistrationSignatureInput,
  signature: string
): Promise<boolean> =>
  Ed25519.verify(
    publicKey,
    base64url.decode(signature),
    buildRegistrationSignatureBase(input)
  );

export let generateChallenge = (): Uint8Array => randomBytes(32);

import type { AuthenticatedOutpostRequest } from './authenticate';
import type { ResolvedOutpostManifest } from './manifest-types';
import type { RequestedService, ResolvedService } from './service-types';

export type ResolvedEnrollmentCredential =
  | { status: 'ok'; publicKey: Uint8Array }
  | { status: 'unknown' }
  | { status: 'revoked' }
  | { status: 'registration_disabled'; publicKey: Uint8Array };

export type ResolvedInstanceAuthorization =
  | { status: 'active' }
  | { status: 'unknown' }
  | { status: 'instance_disabled' }
  | { status: 'outpost_disabled' };

export type InstanceRegistrationResult = {
  services: ResolvedService[];
  instanceTokenExpiresAt?: Date;
};

export interface OutpostRegistrationResolver {
  resolveEnrollmentCredential(input: {
    outpostId: string;
    credentialId: string;
    requestedBy?: AuthenticatedOutpostRequest;
  }): Promise<ResolvedEnrollmentCredential>;

  onInstanceRegistered(input: {
    outpostId: string;
    credentialId: string;
    instanceId: string;
    instancePublicKey: Uint8Array;
    requestedServices: RequestedService[];
    context?: { ip?: string };
  }): Promise<InstanceRegistrationResult>;

  resolveManifest(input: {
    outpostId: string;
    requestedBy?: AuthenticatedOutpostRequest;
  }): Promise<ResolvedOutpostManifest>;

  resolveInstanceAuthorization(input: {
    outpostId: string;
    instanceId: string;
    credentialId: string;
  }): Promise<ResolvedInstanceAuthorization>;
}

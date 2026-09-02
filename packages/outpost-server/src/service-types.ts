export type RequestedService = {
  id: string;
  version?: string;
  capabilities?: Record<string, unknown>;
};

export type ResolvedService = {
  id: string;
  granted: boolean;
};

export let grantedServiceIds = (services: ResolvedService[]): string[] =>
  services.filter(service => service.granted).map(service => service.id);

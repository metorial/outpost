export type OutpostManifest = {
  outpost: { id: string; name: string };
  access: {
    compartment: { organizationId: string; projectId: string; instanceId: string };
    services: { id: string }[];
  }[];
};

export type ResolvedOutpostManifest =
  | { status: 'ok'; manifest: OutpostManifest }
  | { status: 'unknown' };

let compartmentKey = (compartment: {
  organizationId: string;
  projectId: string;
  instanceId: string;
}): string =>
  `${compartment.organizationId}:${compartment.projectId}:${compartment.instanceId}`;

export let isManifestAccessAllowed = (
  childAccess: OutpostManifest['access'],
  parentAccess: OutpostManifest['access']
): boolean => {
  let parentServicesByCompartment = new Map<string, Set<string>>();
  for (let entry of parentAccess) {
    parentServicesByCompartment.set(
      compartmentKey(entry.compartment),
      new Set(entry.services.map(service => service.id))
    );
  }

  return childAccess.every(entry => {
    let parentServices = parentServicesByCompartment.get(compartmentKey(entry.compartment));
    if (!parentServices) return false;

    return entry.services.every(service => parentServices.has(service.id));
  });
};

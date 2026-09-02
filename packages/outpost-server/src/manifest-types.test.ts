import { describe, expect, it } from 'vitest';
import { isManifestAccessAllowed, type OutpostManifest } from './manifest-types';

let access = (instanceId: string): OutpostManifest['access'] => [
  {
    compartment: {
      organizationId: 'org_1',
      projectId: 'prj_1',
      instanceId
    },
    services: [{ id: 'mcp_connection_proxy' }]
  }
];

describe('isManifestAccessAllowed', () => {
  it('does not share access between instances in the same project', () => {
    expect(isManifestAccessAllowed(access('ins_child'), access('ins_parent'))).toBe(false);
  });
});

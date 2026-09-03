#!/usr/bin/env bun

// Rewrites "workspace:*" dependencies to the real published version of the
// referenced workspace package. `npm publish` does not understand the
// `workspace:` protocol (unlike pnpm/yarn), so it publishes it verbatim --
// which breaks installs for anyone consuming the published package. Run this
// right before `npm publish` in CI.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type DependencySection =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

type PackageJson = {
  name?: string;
  version?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: unknown;
};

type Manifest = {
  directory: string;
  path: string;
  packageJson: PackageJson;
  packageName: string;
};

const ROOT_DIRECTORY = path.resolve(import.meta.dir, '..');
const WORKSPACE_DIRECTORIES = ['packages', 'adapters', 'apps'] as const;
const DEPENDENCY_SECTIONS: DependencySection[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies'
];

async function main() {
  let dryRun = process.argv.includes('--dry-run');
  let checkOnly = process.argv.includes('--check');

  let manifests = await getManifests();
  let versions = new Map(
    manifests
      .filter(manifest => manifest.packageJson.version)
      .map(manifest => [manifest.packageName, manifest.packageJson.version!])
  );

  let changedManifests: Manifest[] = [];

  for (let manifest of manifests) {
    let changed = false;

    for (let section of DEPENDENCY_SECTIONS) {
      let dependencies = manifest.packageJson[section];
      if (!dependencies) continue;

      for (let [dependencyName, currentValue] of Object.entries(dependencies)) {
        if (!currentValue.startsWith('workspace:')) continue;

        let version = versions.get(dependencyName);
        if (!version) {
          throw new Error(
            `${manifest.packageName}: cannot resolve "${dependencyName}": ${currentValue} -- no workspace package with that name was found.`
          );
        }

        let resolved = resolveWorkspaceRange(currentValue, version);
        if (resolved === currentValue) continue;

        dependencies[dependencyName] = resolved;
        changed = true;
        console.error(
          `${manifest.packageName}: ${section}.${dependencyName} ${currentValue} -> ${resolved}`
        );
      }
    }

    if (changed) changedManifests.push(manifest);
  }

  if (changedManifests.length === 0) {
    console.error('No workspace: dependencies to resolve.');
    return;
  }

  if (checkOnly) {
    throw new Error(
      `${changedManifests.length} package.json file(s) still contain unresolved "workspace:" dependencies. Run "bun scripts/sync-workspace-versions.ts" to fix.`
    );
  }

  if (dryRun) {
    console.error(`Would update ${changedManifests.length} package.json file(s).`);
    return;
  }

  await Promise.all(changedManifests.map(manifest => writeManifest(manifest)));
  console.error(`Updated ${changedManifests.length} package.json file(s).`);
}

function resolveWorkspaceRange(workspaceValue: string, version: string): string {
  let range = workspaceValue.slice('workspace:'.length);

  if (range === '*' || range === '') return version;
  if (range === '^' || range === '~') return `${range}${version}`;

  // An explicit version/range (e.g. "workspace:1.2.3") is used as-is.
  return range;
}

async function getManifests(): Promise<Manifest[]> {
  let entryLists = await Promise.all(
    WORKSPACE_DIRECTORIES.map(directory =>
      readdir(path.join(ROOT_DIRECTORY, directory), { withFileTypes: true })
    )
  );

  let targets = WORKSPACE_DIRECTORIES.flatMap((directory, index) =>
    entryLists[index]
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(ROOT_DIRECTORY, directory, entry.name))
  );

  return Promise.all(
    targets.map(async directory => {
      let manifestPath = path.join(directory, 'package.json');
      let raw = await readFile(manifestPath, 'utf8');
      let packageJson = JSON.parse(raw) as PackageJson;

      if (!packageJson.name) {
        throw new Error(`Missing "name" in ${manifestPath}.`);
      }

      return {
        directory,
        path: manifestPath,
        packageJson,
        packageName: packageJson.name
      };
    })
  );
}

async function writeManifest(manifest: Manifest): Promise<void> {
  await writeFile(manifest.path, `${JSON.stringify(manifest.packageJson, null, 2)}\n`, 'utf8');
}

await main();

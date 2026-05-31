#!/usr/bin/env node

/**
 * set-version.js
 *
 * Sets the version in package.json from a git tag or explicit version argument.
 * Usage:
 *   node scripts/set-version.js          # reads from git tag (e.g. v1.2.3)
 *   node scripts/set-version.js 1.2.3    # explicit version
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '..', 'package.json');

function getVersionFromArg() {
  return process.argv[2] || null;
}

function getVersionFromTag() {
  try {
    const tag = execSync('git describe --tags --exact-match 2>/dev/null', {
      encoding: 'utf-8',
    }).trim();
    return tag.replace(/^v/, '');
  } catch {
    return null;
  }
}

function main() {
  const version = getVersionFromArg() || getVersionFromTag();

  if (!version) {
    console.error(
      'No version specified. Pass a version as argument or ensure the current commit has a git tag.'
    );
    process.exit(1);
  }

  // Validate semver format (x.y.z or x.y.z-pre.n)
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    console.error(`Invalid version format: "${version}". Expected semver (e.g. 1.2.3)`);
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  console.log(`package.json version set to ${version}`);
}

main();

/**
 * Fast ASAR patcher — rebuilds app.asar from source dist/ + dist-electron/
 * without touching the 2.75 GB model-bundle or re-running PyInstaller.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const asarDest = path.join(root, 'release', 'electron', 'win-unpacked', 'resources', 'app.asar');
const stagingDir = path.join(root, 'release', 'electron', 'asar-staging');

console.log('=== SlideForge ASAR patcher ===');

// 1. Clean staging
if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true });
fs.mkdirSync(stagingDir, { recursive: true });

// 2. Copy dist/ (frontend)
const distSrc = path.join(root, 'dist');
fs.cpSync(distSrc, path.join(stagingDir, 'dist'), { recursive: true });
console.log('Copied dist/');

// 3. Copy dist-electron/ (Electron main/preload/backend-manager)
const elecSrc = path.join(root, 'dist-electron');
fs.cpSync(elecSrc, path.join(stagingDir, 'dist-electron'), { recursive: true });
console.log('Copied dist-electron/');

// 4. Copy legal/ if it exists
const legalSrc = path.join(root, 'legal');
if (fs.existsSync(legalSrc)) {
  fs.cpSync(legalSrc, path.join(stagingDir, 'legal'), { recursive: true });
  console.log('Copied legal/');
}

// 5. Copy package.json (Electron needs it for the "main" field)
fs.copyFileSync(path.join(root, 'package.json'), path.join(stagingDir, 'package.json'));
console.log('Copied package.json');

// 6. Copy node_modules (production only — skip devDeps and .bin)
const nmSrc = path.join(root, 'node_modules');
const nmDst = path.join(stagingDir, 'node_modules');
fs.mkdirSync(nmDst, { recursive: true });

// Only copy packages listed in package.json dependencies (not devDependencies)
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const prodDeps = Object.keys(pkg.dependencies || {});
let copied = 0;
for (const dep of prodDeps) {
  const src = path.join(nmSrc, dep);
  const dst = path.join(nmDst, dep);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dst, { recursive: true });
    copied++;
  }
}
console.log(`Copied ${copied}/${prodDeps.length} production node_modules`);

// 7. Pack into ASAR
console.log(`Packing ASAR → ${asarDest}`);
execFileSync('npx', ['asar', 'pack', stagingDir, asarDest], {
  stdio: 'inherit',
  shell: true,
  cwd: root,
});

// 8. Cleanup staging
fs.rmSync(stagingDir, { recursive: true });

console.log('Done. ASAR size:', Math.round(fs.statSync(asarDest).size / 1024 / 1024) + ' MB');

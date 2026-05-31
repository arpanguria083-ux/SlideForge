import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const electronDistDir = path.join(root, 'dist-electron');

if (!fs.existsSync(electronDistDir)) {
  console.error('dist-electron not found. Run `tsc -p electron` first.');
  process.exit(1);
}

const packageJsonPath = path.join(electronDistDir, 'package.json');
const packageJson = {
  type: 'commonjs',
};

fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(root, packageJsonPath)}`);

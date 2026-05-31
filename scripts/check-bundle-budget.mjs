import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const assetsDir = path.join(root, 'dist', 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error('dist/assets not found. Run `npm run build` before bundle budget checks.');
  process.exit(1);
}

const entries = fs
  .readdirSync(assetsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

const getSizeKb = (buffer) => Number((buffer.length / 1024).toFixed(2));

const fileStats = entries.map((name) => {
  const filePath = path.join(assetsDir, name);
  const raw = fs.readFileSync(filePath);
  const gz = gzipSync(raw);
  return {
    name,
    ext: path.extname(name),
    rawKb: getSizeKb(raw),
    gzipKb: getSizeKb(gz),
  };
});

const jsStats = fileStats.filter((stat) => stat.ext === '.js');
const cssStats = fileStats.filter((stat) => stat.ext === '.css');

const findChunk = (prefix) => jsStats.find((stat) => stat.name.startsWith(`${prefix}-`));

const checks = [
  { label: 'index chunk gzip', actual: findChunk('index')?.gzipKb, max: 85, required: true },
  { label: 'query chunk gzip', actual: findChunk('query')?.gzipKb, max: 20, required: false },
  { label: 'dashboard chunk gzip', actual: findChunk('Dashboard')?.gzipKb, max: 35, required: false },
  { label: 'charts chunk gzip', actual: findChunk('charts')?.gzipKb, max: 100, required: false },
  {
    label: 'total JS gzip',
    actual: Number(jsStats.reduce((sum, item) => sum + item.gzipKb, 0).toFixed(2)),
    max: 225,
    required: true,
  },
  {
    label: 'total CSS gzip',
    actual: Number(cssStats.reduce((sum, item) => sum + item.gzipKb, 0).toFixed(2)),
    max: 20,
    required: true,
  },
];

const failures = [];

for (const check of checks) {
  if (check.actual === undefined) {
    if (check.required) {
      failures.push(`${check.label}: missing required chunk`);
    }
    continue;
  }
  if (check.actual > check.max) {
    failures.push(`${check.label}: ${check.actual}KB > ${check.max}KB`);
  }
}

console.log('Bundle budget report');
for (const check of checks) {
  const value = check.actual === undefined ? 'n/a' : `${check.actual}KB`;
  console.log(`- ${check.label}: ${value} (max ${check.max}KB)`);
}

if (failures.length > 0) {
  console.error('\nBundle budget exceeded:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('\nAll bundle budgets are within limits.');

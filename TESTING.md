Running tests locally
=====================

This project uses Vitest + React Testing Library for frontend unit tests.

Quick start (recommended):

1. Install dependencies (may need legacy peer deps due to dev deps targeting react@18):

```powershell
npm install --legacy-peer-deps --ignore-scripts --no-audit --no-fund
```

2. Run the test suite:

```powershell
npm test
```

Alternatively, run Vitest directly:

```powershell
npx vitest run --reporter=dot
```

Notes
-----
- Tests run in a jsdom environment and may perform additional setup (jsdom / fetch polyfills). The first run can be slower due to package installation and environment setup.
- If you have a `package-lock.json`, prefer `npm ci --legacy-peer-deps` to get reproducible installations.
- CI (GitHub Actions) is configured at `.github/workflows/ci.yml` to run `npx tsc --noEmit` and `npx vitest run` on pushes and PRs to `main`/`master`.

If you run into dependency conflicts during install, use `--legacy-peer-deps` (as above) — we do this because some testing libraries require React 18 while the app uses a newer React.

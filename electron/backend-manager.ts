import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import { AddressInfo, createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';

let backendProcess: ChildProcess | null = null;
let backendPort = 0;
let onPhaseCallback: ((msg: string) => void) | null = null;

const logPath = path.join(os.tmpdir(), 'slideforge-electron-backend.log');
const logBackend = (message: string): void => {
  try {
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch {
    // best-effort logging only
  }
};

const getAvailablePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to determine available port')));
        return;
      }
      const port = (address as AddressInfo).port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });

const waitForHealth = async (url: string, appReadySignal: Promise<void>, timeoutMs = 300_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  const httpHealthCheck = async () => {
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url);
        if (response.ok) return;
      } catch {
        // retry until timeout
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Backend did not become healthy: ${url}`);
  };

  // Whichever comes first: HTTP health check OR APP_READY signal from backend stderr/stdout
  try {
    await Promise.race([httpHealthCheck(), appReadySignal]);
  } catch (err) {
    // If neither completes, rethrow
    throw err;
  }
};

const backendExecutableName = (): string => {
  if (process.platform === 'win32') return 'SlideForge.exe';
  return 'SlideForge';
};

const backendExecutablePath = (): string => {
  const executable = backendExecutableName();
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', executable);
  }
  return path.join(app.getAppPath(), 'backend', 'dist', 'SlideForge', executable);
};

const packagedModelBundlePath = (): string => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'model-bundle');
  }
  return path.join(app.getAppPath(), 'backend', 'model-bundle');
};

const requiredBundledFiles = [
  path.join('got_ocr2', 'model.safetensors'),
  path.join('got_ocr2', 'config.json'),
];

const hasCompleteBundledModels = (rootDir: string): boolean =>
  requiredBundledFiles.every((relativePath) => fs.existsSync(path.join(rootDir, relativePath)));

const hasFullBundledPayload = (): boolean => {
  const sourceDir = packagedModelBundlePath();
  return hasCompleteBundledModels(sourceDir);
};

const reportPhase = (msg: string): void => {
  logBackend(msg);
  if (onPhaseCallback) {
    try {
      onPhaseCallback(msg);
    } catch {
      // ignore callback failures
    }
  }
};

const calculateDirSize = (dir: string): number => {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += calculateDirSize(full);
      } else if (entry.isFile()) {
        try {
          total += fs.statSync(full).size;
        } catch {
          // skip unreadable files
        }
      }
    }
  } catch {
    // dir does not exist
  }
  return total;
};

const verifyBundleSizes = (sourceDir: string, targetDir: string): boolean => {
  for (const relPath of requiredBundledFiles) {
    const src = path.join(sourceDir, relPath);
    const tgt = path.join(targetDir, relPath);
    if (!fs.existsSync(tgt)) return false;
    try {
      const srcSize = fs.statSync(src).size;
      const tgtSize = fs.statSync(tgt).size;
      if (srcSize !== tgtSize) {
        logBackend(`bundleSizeMismatch file=${relPath} src=${srcSize} tgt=${tgtSize}`);
        return false;
      }
    } catch (err) {
      logBackend(`bundleVerifyError file=${relPath} err=${(err as Error).message}`);
      return false;
    }
  }
  return true;
};

const ensureBundledModels = async (dataDir: string): Promise<void> => {
  const sourceDir = packagedModelBundlePath();
  const targetDir = path.join(dataDir, 'ocr_models');
  const markerPath = path.join(targetDir, '.bundled');
  if (!fs.existsSync(sourceDir)) {
    logBackend(`modelBundleMissing source=${sourceDir}`);
    return;
  }
  if (hasCompleteBundledModels(targetDir) && verifyBundleSizes(sourceDir, targetDir)) {
    if (!fs.existsSync(markerPath)) {
      fs.writeFileSync(markerPath, new Date().toISOString(), 'utf8');
    }
    reportPhase(`OCR bundle already seeded at ${targetDir}`);
    return;
  }
  if (fs.existsSync(targetDir)) {
    reportPhase(`Removing incomplete OCR bundle at ${targetDir}`);
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(dataDir, { recursive: true });

  const totalBytes = calculateDirSize(sourceDir);
  const totalMb = Math.round(totalBytes / (1024 * 1024));
  reportPhase(`Seeding OCR bundle (${totalMb} MB) — first launch only...`);

  // Copy on next tick so UI updates between calls — keeps overlay responsive
  await new Promise<void>((resolve, reject) => {
    setImmediate(() => {
      try {
        fs.cpSync(sourceDir, targetDir, { recursive: true, force: false });
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });

  if (!verifyBundleSizes(sourceDir, targetDir)) {
    reportPhase('OCR bundle copy verification FAILED — sizes mismatch');
    throw new Error('OCR bundle verification failed after copy');
  }

  fs.writeFileSync(markerPath, new Date().toISOString(), 'utf8');
  reportPhase(`OCR bundle seeded successfully (${totalMb} MB)`);
};

export const allocatePort = async (): Promise<number> => {
  if (backendPort !== 0) return backendPort;
  backendPort = await getAvailablePort();
  return backendPort;
};

export const setPhaseCallback = (cb: ((msg: string) => void) | null): void => {
  onPhaseCallback = cb;
};

export const launchBackend = async (port: number, dataDir: string): Promise<void> => {
  if (backendProcess) return;

  backendPort = port;
  const exePath = backendExecutablePath();
  const ocrDir = path.join(dataDir, 'ocr_models');
  if (hasFullBundledPayload()) {
    try {
      await ensureBundledModels(dataDir);
    } catch (err) {
      reportPhase(`OCR bundle seed failed: ${(err as Error).message}`);
      // Continue — backend will surface OCR-not-ready state via /api/diagnostics
    }
  } else {
    reportPhase('Lite build detected — OCR will be downloaded on demand');
  }
  logBackend(`launchBackend port=${backendPort} exe=${exePath} dataDir=${dataDir}`);
  logBackend(`hasFullPayload=${hasFullBundledPayload()} ocrDir=${ocrDir}`);

  let appReadyResolve: (() => void) | null = null;
  const appReadyPromise = new Promise<void>((resolve) => {
    appReadyResolve = resolve;
  });

  const appName = app.getName().toLowerCase();
  let ocrBackend = '';
  if (appName.includes('got-ocr') || appName.includes('got_ocr') || appName.includes('got')) {
    ocrBackend = 'got_ocr2';
  } else if (appName.includes('paddleocr') || appName.includes('paddle')) {
    ocrBackend = 'paddleocr';
  } else if (appName.includes('lite')) {
    ocrBackend = 'doctr';
  }

  const spawnEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    SLIDEFORGE_DATA_DIR: dataDir,
    SLIDEFORGE_OCR_DIR: ocrDir,
    PYTHONUNBUFFERED: '1',
  };
  if (ocrBackend) {
    spawnEnv.SLIDEFORGE_OCR_BACKEND = ocrBackend;
  }

  backendProcess = spawn(exePath, ['--host', '127.0.0.1', '--port', String(backendPort), '--data-dir', dataDir], {
    env: spawnEnv,
    windowsHide: true,
  });

  logBackend(`backendSpawned pid=${backendProcess.pid ?? 'unknown'}`);
  backendProcess.stdout?.on('data', (chunk) => {
    const msg = String(chunk).trim();
    logBackend(`stdout ${msg}`);
    if (onPhaseCallback) onPhaseCallback(`[stdout] ${msg}`);
    if (msg.includes('APP_READY') && appReadyResolve) {
      appReadyResolve();
      appReadyResolve = null;
    }
  });
  backendProcess.stderr?.on('data', (chunk) => {
    const msg = String(chunk).trim();
    logBackend(`stderr ${msg}`);
    if (onPhaseCallback) onPhaseCallback(`[stderr] ${msg}`);
    if (msg.includes('APP_READY') && appReadyResolve) {
      appReadyResolve();
      appReadyResolve = null;
    }
  });
  backendProcess.on('exit', (code, signal) => {
    logBackend(`backendExit code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    if (appReadyResolve) appReadyResolve();
    backendProcess = null;
  });
  backendProcess.on('error', (error) => {
    logBackend(`backendError ${error.stack || error.message}`);
    if (appReadyResolve) appReadyResolve();
  });

  await waitForHealth(`http://127.0.0.1:${backendPort}/api/health`, appReadyPromise);
  logBackend(`backendHealthy port=${backendPort}`);
  // Ask backend for its OCR asset status so Electron UI can show a single source of truth
  try {
    const statusUrl = `http://127.0.0.1:${backendPort}/api/ocr/status`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(statusUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      try {
        const body = await resp.json();
        // backend returns an "assets" key when idle
        if (body && body.assets && body.assets.ready) {
          reportPhase(`OCR assets ready`);
        } else {
          reportPhase(`OCR assets not ready`);
        }
      } catch (err) {
        reportPhase(`OCR status parse failed: ${(err as Error).message}`);
      }
    } else {
      reportPhase(`OCR status request failed: ${resp.status}`);
    }
  } catch (err) {
    reportPhase(`OCR status check error: ${(err as Error).message}`);
  }
};

export const startBackend = async (): Promise<number> => {
  const port = await allocatePort();
  const dataDir = path.join(app.getPath('userData'), 'data');
  await launchBackend(port, dataDir);
  return port;
};

export const stopBackend = async (): Promise<void> => {
  if (!backendProcess) return;
  const pid = backendProcess.pid;
  backendProcess.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 2500));
  if (pid) {
    try {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    } catch {
      // best effort fallback
    }
  }
  backendProcess = null;
};

export const getBackendPort = (): number => backendPort;

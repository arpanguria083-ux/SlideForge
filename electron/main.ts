import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getBackendPort, allocatePort, launchBackend, setPhaseCallback, stopBackend } from './backend-manager';

let mainWindow: BrowserWindow | null = null;

const logPath = path.join(os.tmpdir(), 'slideforge-electron-main.log');
const logMain = (message: string): void => {
  try {
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch {
    // best-effort logging only
  }
};

process.on('uncaughtException', (error) => {
  logMain(`uncaughtException: ${error.stack || error.message}`);
});

process.on('unhandledRejection', (reason) => {
  const detail = reason instanceof Error ? reason.stack || reason.message : String(reason);
  logMain(`unhandledRejection: ${detail}`);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logMain('single-instance lock failed, another instance already running');
  app.quit();
  process.exit(0);
}

const createWindow = async (port: number): Promise<void> => {
  logMain('createWindow:start');
  logMain('createWindow:port=' + port);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--slideforge-api-base=http://127.0.0.1:${getBackendPort()}`],
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; img-src 'self' data: blob: http://127.0.0.1:* http://localhost:*; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; font-src 'self' data: https://fonts.gstatic.com;",
        ],
      },
    });
  });

  if (app.isPackaged) {
    logMain(`createWindow:loadFile ${path.join(app.getAppPath(), 'dist', 'index.html')}`);
    await mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  } else {
    logMain('createWindow:loadURL http://127.0.0.1:3000');
    await mainWindow.loadURL('http://127.0.0.1:3000');
  }
  logMain('createWindow:done');
};

app.on('second-instance', () => {
  logMain('second-instance-detected');
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  logMain('app.whenReady');

  ipcMain.handle('slideforge:get-api-base', async () => {
    const port = getBackendPort();
    logMain(`ipc:get-api-base -> http://127.0.0.1:${port}`);
    return `http://127.0.0.1:${port}`;
  });

  ipcMain.handle('slideforge:open-deck-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Decks', extensions: ['pptx', 'pdf'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    return { path: filePath, filename: path.basename(filePath) };
  });

  // Allocate port fast
  const port = await allocatePort();
  logMain('allocatePort:done port=' + port);

  // Create window immediately (shows overlay)
  await createWindow(port);
  logMain('createWindow:done');

  // Start backend in background (no await)
  const dataDir = path.join(app.getPath('userData'), 'data');
  setPhaseCallback((msg: string) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('slideforge:backend-phase', msg);
    }
  });

  launchBackend(port, dataDir)
    .then(() => {
      logMain('launchBackend:done');
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('slideforge:backend-ready');
      }
    })
    .catch((err) => {
      logMain('launchBackend:error ' + (err instanceof Error ? err.message : String(err)));
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('slideforge:backend-error', err instanceof Error ? err.message : String(err));
      }
    });
});

app.on('window-all-closed', async () => {
  logMain('window-all-closed');
  await stopBackend();
  app.quit();
});

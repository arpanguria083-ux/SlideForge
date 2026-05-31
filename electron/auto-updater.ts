import { BrowserWindow } from 'electron'

// Lightweight auto-updater shim. If `electron-updater` is installed this will wire
// update events to the renderer; otherwise the functions are no-ops and the app
// continues to run without update functionality.
export function setupAutoUpdater(win: BrowserWindow) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { autoUpdater } = require('electron-updater')

    autoUpdater.autoDownload = false

    autoUpdater.on('checking-for-update', () => {
      win.webContents.send('update:checking')
    })

    autoUpdater.on('update-available', (info: any) => {
      win.webContents.send('update:available', info)
    })

    autoUpdater.on('update-not-available', () => {
      win.webContents.send('update:not-available')
    })

    autoUpdater.on('update-downloaded', (info: any) => {
      win.webContents.send('update:downloaded', info)
    })

    autoUpdater.on('error', (err: any) => {
      win.webContents.send('update:error', String(err))
    })

    return {
      checkForUpdates: () => autoUpdater.checkForUpdates(),
      downloadUpdate: () => autoUpdater.downloadUpdate(),
      quitAndInstall: () => autoUpdater.quitAndInstall(),
    }
  } catch (e) {
    // electron-updater not available — return no-op functions
    // Keep this quiet for production; renderer can detect lack of messages.
    // eslint-disable-next-line no-console
    console.warn('electron-updater not available; auto-updates disabled')
    return {
      checkForUpdates: async () => undefined,
      downloadUpdate: async () => undefined,
      quitAndInstall: async () => undefined,
    }
  }
}

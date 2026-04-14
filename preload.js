const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cvrma', {
    // Settings
    loadSettings: () => ipcRenderer.invoke('load-settings'),
    saveSettings: (data) => ipcRenderer.invoke('save-settings', data),

    // Install dir
    detectInstallDir: () => ipcRenderer.invoke('detect-install-dir'),
    selectDir: () => ipcRenderer.invoke('select-dir'),
    openDir: (dirPath) => ipcRenderer.invoke('open-dir', dirPath),
    openAppData: () => ipcRenderer.invoke('open-app-data'),
    openGameAppData: () => ipcRenderer.invoke('open-game-app-data'),

    // Mod scanning
    scanInstalledMods: (installDir) => ipcRenderer.invoke('scan-installed-mods', installDir),

    // MelonLoader
    melonLoaderStatus: (installDir) => ipcRenderer.invoke('melon-loader-status', installDir),
    installMelonLoader: (installDir) => ipcRenderer.invoke('install-melon-loader', installDir),
    removeMelonLoader: (installDir) => ipcRenderer.invoke('remove-melon-loader', installDir),

    // Mods
    installMod: (installDir, mod) => ipcRenderer.invoke('install-mod', installDir, mod),
    uninstallMod: (filePath) => ipcRenderer.invoke('uninstall-mod', filePath),
    removeAllMods: (installDir) => ipcRenderer.invoke('remove-all-mods', installDir),
    removeAllModsAndMelon: (installDir) => ipcRenderer.invoke('remove-all-mods-and-melon', installDir),

    // Presets
    exportPresets: () => ipcRenderer.invoke('export-presets'),
    importPresets: () => ipcRenderer.invoke('import-presets'),

    // App info
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    isPortable: () => ipcRenderer.invoke('is-portable'),

    // Window controls
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),

    // Status push from main → renderer
    onStatusUpdate: (cb) => ipcRenderer.on('status-update', (_e, data) => cb(data)),
    offStatusUpdate: () => ipcRenderer.removeAllListeners('status-update'),

    // Updates
    getUpdateState: () => ipcRenderer.invoke('get-update-state'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
    onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_e, info) => cb(info)),
    onUpdateNotAvailable: (cb) => ipcRenderer.on('update-not-available', () => cb()),
    onUpdateError: (cb) => ipcRenderer.on('update-error', (_e, msg) => cb(msg)),
    onUpdateDownloadProgress: (cb) => ipcRenderer.on('update-download-progress', (_e, p) => cb(p)),
    onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
    onUpdateMessage: (cb) => ipcRenderer.on('update-message', (_e, msg) => cb(msg)),
    offUpdateEvents: () => {
        ipcRenderer.removeAllListeners('update-available');
        ipcRenderer.removeAllListeners('update-not-available');
        ipcRenderer.removeAllListeners('update-error');
        ipcRenderer.removeAllListeners('update-download-progress');
        ipcRenderer.removeAllListeners('update-downloaded');
        ipcRenderer.removeAllListeners('update-message');
    }
});

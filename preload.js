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

    // Presets
    exportPresets: () => ipcRenderer.invoke('export-presets'),
    importPresets: () => ipcRenderer.invoke('import-presets'),

    // App info
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // Window controls
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),

    // Status push from main → renderer
    onStatusUpdate: (cb) => ipcRenderer.on('status-update', (_e, data) => cb(data)),
    offStatusUpdate: () => ipcRenderer.removeAllListeners('status-update'),
});

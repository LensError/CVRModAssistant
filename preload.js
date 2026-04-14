const { contextBridge, ipcRenderer } = require('electron');

// Stored listener references for targeted removal (avoids removeAllListeners side-effects)
let _statusUpdateFn = null;
const _updateFns = {};

contextBridge.exposeInMainWorld('cvrma', {
    // Settings
    loadSettings: () => ipcRenderer.invoke('load-settings'),
    saveSettings: (data) => ipcRenderer.invoke('save-settings', data),

    // Install dir
    detectInstallDir: () => ipcRenderer.invoke('detect-install-dir'),
    selectDir: () => ipcRenderer.invoke('select-dir'),
    openDir: (dirPath) => ipcRenderer.invoke('open-dir', dirPath),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
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
    onStatusUpdate: (cb) => {
        if (_statusUpdateFn) ipcRenderer.removeListener('status-update', _statusUpdateFn);
        _statusUpdateFn = (_e, data) => cb(data);
        ipcRenderer.on('status-update', _statusUpdateFn);
    },
    offStatusUpdate: () => {
        if (_statusUpdateFn) {
            ipcRenderer.removeListener('status-update', _statusUpdateFn);
            _statusUpdateFn = null;
        }
    },

    // Updates
    getUpdateState: () => ipcRenderer.invoke('get-update-state'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
    onUpdateAvailable: (cb) => {
        const ch = 'update-available';
        if (_updateFns[ch]) ipcRenderer.removeListener(ch, _updateFns[ch]);
        _updateFns[ch] = (_e, info) => cb(info);
        ipcRenderer.on(ch, _updateFns[ch]);
    },
    onUpdateNotAvailable: (cb) => {
        const ch = 'update-not-available';
        if (_updateFns[ch]) ipcRenderer.removeListener(ch, _updateFns[ch]);
        _updateFns[ch] = () => cb();
        ipcRenderer.on(ch, _updateFns[ch]);
    },
    onUpdateError: (cb) => {
        const ch = 'update-error';
        if (_updateFns[ch]) ipcRenderer.removeListener(ch, _updateFns[ch]);
        _updateFns[ch] = (_e, msg) => cb(msg);
        ipcRenderer.on(ch, _updateFns[ch]);
    },
    onUpdateDownloadProgress: (cb) => {
        const ch = 'update-download-progress';
        if (_updateFns[ch]) ipcRenderer.removeListener(ch, _updateFns[ch]);
        _updateFns[ch] = (_e, p) => cb(p);
        ipcRenderer.on(ch, _updateFns[ch]);
    },
    onUpdateDownloaded: (cb) => {
        const ch = 'update-downloaded';
        if (_updateFns[ch]) ipcRenderer.removeListener(ch, _updateFns[ch]);
        _updateFns[ch] = () => cb();
        ipcRenderer.on(ch, _updateFns[ch]);
    },
    onUpdateMessage: (cb) => {
        const ch = 'update-message';
        if (_updateFns[ch]) ipcRenderer.removeListener(ch, _updateFns[ch]);
        _updateFns[ch] = (_e, msg) => cb(msg);
        ipcRenderer.on(ch, _updateFns[ch]);
    },
    offUpdateEvents: () => {
        for (const [channel, fn] of Object.entries(_updateFns)) {
            ipcRenderer.removeListener(channel, fn);
        }
        for (const key of Object.keys(_updateFns)) delete _updateFns[key];
    },
});

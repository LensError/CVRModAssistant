const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const AdmZip = require('adm-zip');
const { parseMelonInfo } = require('./dll-parser');

// ─── Settings ────────────────────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }
    } catch (e) { /* ignore */ }
    return {};
}

function saveSettings(data) {
    try {
        const current = loadSettings();
        const merged = { ...current, ...data };
        fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
        return merged;
    } catch (e) {
        console.error('Failed to save settings:', e);
        return null;
    }
}

// ─── Steam / Oculus directory detection ──────────────────────────────────────
function findSteamInstallDir() {
    try {
        // Only available on Windows
        const Registry = require('winreg');

        return new Promise((resolve) => {
            const key = new Registry({
                hive: Registry.HKLM,
                key: '\\SOFTWARE\\WOW6432Node\\Valve\\Steam'
            });
            key.get('InstallPath', (err, item) => {
                if (err || !item) { resolve(null); return; }
                const steamPath = item.value;
                const vdf = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
                if (!fs.existsSync(vdf)) { resolve(null); return; }

                const content = fs.readFileSync(vdf, 'utf-8');
                const pathMatches = [...content.matchAll(/"path"\s+"([^"]+)"/g)];
                const libraryPaths = [
                    path.join(steamPath, 'steamapps'),
                    ...pathMatches.map(m => path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps'))
                ];

                for (const lib of libraryPaths) {
                    const acf = path.join(lib, 'appmanifest_661130.acf');
                    if (!fs.existsSync(acf)) continue;
                    const acfContent = fs.readFileSync(acf, 'utf-8');
                    const match = acfContent.match(/\s"installdir"\s+"(.+)"/);
                    if (match) {
                        const gameDir = path.join(lib, 'common', match[1]);
                        if (fs.existsSync(path.join(gameDir, 'ChilloutVR.exe'))) {
                            resolve({ dir: gameDir, store: 'Steam' });
                            return;
                        }
                    }
                }
                resolve(null);
            });
        });
    } catch (e) {
        return Promise.resolve(null);
    }
}

function findOculusInstallDir() {
    try {
        const Registry = require('winreg');
        return new Promise((resolve) => {
            const key = new Registry({
                hive: Registry.HKLM,
                key: '\\SOFTWARE\\Wow6432Node\\Oculus VR, LLC\\Oculus\\Config'
            });
            key.get('InitialAppLibrary', (err, item) => {
                if (err || !item) { resolve(null); return; }
                const oculusPath = item.value;
                const gameDir = path.join(oculusPath, 'Software', 'ChilloutVR-ChilloutVR');
                if (fs.existsSync(path.join(gameDir, 'ChilloutVR.exe'))) {
                    resolve({ dir: gameDir, store: 'Oculus' });
                } else {
                    resolve(null);
                }
            });
        });
    } catch (e) {
        return Promise.resolve(null);
    }
}

async function detectInstallDir() {
    const settings = loadSettings();
    if (settings.installFolder && fs.existsSync(path.join(settings.installFolder, 'ChilloutVR.exe'))) {
        return { dir: settings.installFolder, store: settings.storeType || 'Unknown' };
    }
    const steam = await findSteamInstallDir();
    if (steam) return steam;
    const oculus = await findOculusInstallDir();
    if (oculus) return oculus;
    return null;
}

// ─── Mod file scanning (filename-based only) ─────────────────────────────────
function scanInstalledMods(installDir) {
    const results = [];
    const dirsToScan = [
        { subdir: 'Mods', isBroken: false, isRetired: false },
        { subdir: 'Plugins', isBroken: false, isRetired: false },
        { subdir: 'Mods/Broken', isBroken: true, isRetired: false },
        { subdir: 'Plugins/Broken', isBroken: true, isRetired: false },
        { subdir: 'Mods/Retired', isBroken: false, isRetired: true },
        { subdir: 'Plugins/Retired', isBroken: false, isRetired: true },
    ];

    for (const { subdir, isBroken, isRetired } of dirsToScan) {
        const fullPath = path.join(installDir, subdir);
        if (!fs.existsSync(fullPath)) continue;
        try {
            const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.dll'));
            for (const file of files) {
                const filePath = path.join(fullPath, file);
                const modInfo  = parseMelonInfo(filePath);
                results.push({
                    fileName: file,
                    baseName: file.replace(/\.dll$/i, ''),
                    filePath,
                    isBroken,
                    isRetired,
                    version: modInfo?.version || null,
                    name:    modInfo?.name    || null,
                    author:  modInfo?.author  || null,
                });
            }
        } catch (e) { /* skip unreadable dirs */ }
    }
    return results;
}

// ─── MelonLoader ─────────────────────────────────────────────────────────────
function isMelonLoaderInstalled(installDir) {
    return (
        fs.existsSync(path.join(installDir, 'version.dll')) &&
        fs.existsSync(path.join(installDir, 'MelonLoader'))
    );
}

function removeMelonLoader(installDir) {
    const filesToRemove = [
        path.join(installDir, 'version.dll'),
        path.join(installDir, 'dobby.dll'),
    ];
    const dirsToRemove = [
        path.join(installDir, 'MelonLoader'),
    ];

    for (const f of filesToRemove) {
        if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    for (const d of dirsToRemove) {
        if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
    }
    return true;
}

function downloadToBuffer(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 10) { reject(new Error('Too many redirects')); return; }
        const proto = url.startsWith('https') ? https : http;
        const req = proto.get(url, { headers: { 'User-Agent': 'CVRMelonAssistant/1.0' } }, (res) => {
            // Handle redirects — track final URL so callers can extract a clean filename
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                downloadToBuffer(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ buffer: Buffer.concat(chunks), finalUrl: url }));
            res.on('error', reject);
        }).on('error', reject);
        // 240-second timeout matching the C# HttpClient configuration
        req.setTimeout(240000, () => { req.destroy(); reject(new Error('Download timed out')); });
    });
}

async function installMelonLoader(installDir, win) {
    removeMelonLoader(installDir);

    win.webContents.send('status-update', { text: 'Downloading MelonLoader...', progress: 0.1 });
    const { buffer: zipBuffer } = await downloadToBuffer('https://github.com/LavaGang/MelonLoader/releases/latest/download/MelonLoader.x64.zip');

    win.webContents.send('status-update', { text: 'Extracting MelonLoader...', progress: 0.5 });

    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    for (const entry of entries) {
        const targetPath = path.join(installDir, entry.entryName);
        if (entry.isDirectory) {
            fs.mkdirSync(targetPath, { recursive: true });
        } else {
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.writeFileSync(targetPath, entry.getData());
        }
    }

    fs.mkdirSync(path.join(installDir, 'Mods'), { recursive: true });
    fs.mkdirSync(path.join(installDir, 'Plugins'), { recursive: true });

    win.webContents.send('status-update', { text: 'MelonLoader installed.', progress: 1.0 });
    return true;
}

async function installMod(installDir, mod, win) {
    const { downloadLink, name, isPlugin, isBroken, isRetired } = mod;
    if (!downloadLink) throw new Error(`No download link for ${name}`);

    win.webContents.send('status-update', { text: `Installing ${name}...`, progress: 0.3 });

    const { buffer } = await downloadToBuffer(downloadLink);

    const subdir = isPlugin ? 'Plugins' : 'Mods';
    const brokenSub = isBroken ? 'Broken' : (isRetired ? 'Retired' : '');
    const targetDir = path.join(installDir, subdir, brokenSub);
    fs.mkdirSync(targetDir, { recursive: true });

    // Always use the canonical mod name so filename-based matching works reliably.
    // Also remove any existing DLL whose normalized basename ends with the normalized
    // mod name (e.g. "red.sim.LightVolumesUdon.dll" when installing "LightVolumesUdon").
    const fileName = `${name}.dll`;
    const targetPath = path.join(targetDir, fileName);
    const normFn = s => s.toLowerCase().replace(/[\s\-_.]/g, '');
    const nameNorm = normFn(name);
    try {
        for (const f of fs.readdirSync(targetDir).filter(f => f.endsWith('.dll'))) {
            if (f === fileName) continue;
            if (normFn(f.replace(/\.dll$/i, '')).endsWith(nameNorm))
                fs.unlinkSync(path.join(targetDir, f));
        }
    } catch (e) { /* skip unreadable dirs */ }

    fs.writeFileSync(targetPath, buffer);
    win.webContents.send('status-update', { text: `Installed ${name}.`, progress: 1.0 });
    return targetPath;
}

function uninstallMod(filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
    }
    return false;
}

function removeAllMods(installDir) {
    const dirs = ['Mods', 'Plugins'];
    const removed = [];
    for (const d of dirs) {
        const full = path.join(installDir, d);
        if (!fs.existsSync(full)) continue;
        const files = fs.readdirSync(full, { withFileTypes: true });
        for (const f of files) {
            if (f.isFile() && f.name.endsWith('.dll')) {
                const fp = path.join(full, f.name);
                fs.unlinkSync(fp);
                removed.push(fp);
            }
        }
    }
    return removed.length;
}

// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 760,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        backgroundColor: '#0a0a0e',
        icon: path.join(__dirname, 'renderer', 'assets', 'icons', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('load-settings', () => loadSettings());

ipcMain.handle('save-settings', (_e, data) => saveSettings(data));

ipcMain.handle('detect-install-dir', async () => detectInstallDir());

ipcMain.handle('select-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select ChilloutVR Installation Folder',
        properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const dir = result.filePaths[0];
    if (!fs.existsSync(path.join(dir, 'ChilloutVR.exe'))) {
        return { error: 'ChilloutVR.exe not found in this folder.' };
    }
    const storeType = fs.existsSync(path.join(dir, 'ChilloutVR_Data', 'Plugins', 'steam_api64.dll'))
        ? 'Steam' : 'Oculus';
    return { dir, store: storeType };
});

ipcMain.handle('open-dir', (_e, dirPath) => shell.openPath(dirPath));

ipcMain.handle('open-app-data', () => shell.openPath(app.getPath('userData')));

ipcMain.handle('open-game-app-data', () => {
    const cvrAppData = path.join(app.getPath('appData'), '..', 'LocalLow', 'ChilloutVR', 'ChilloutVR');
    return shell.openPath(cvrAppData);
});

ipcMain.handle('scan-installed-mods', (_e, installDir) => {
    if (!installDir || !fs.existsSync(installDir)) return [];
    return scanInstalledMods(installDir);
});

ipcMain.handle('melon-loader-status', (_e, installDir) => ({
    installed: isMelonLoaderInstalled(installDir)
}));

ipcMain.handle('install-melon-loader', async (_e, installDir) => {
    try {
        await installMelonLoader(installDir, mainWindow);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('remove-melon-loader', (_e, installDir) => {
    try {
        removeMelonLoader(installDir);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('install-mod', async (_e, installDir, mod) => {
    try {
        const filePath = await installMod(installDir, mod, mainWindow);
        return { success: true, filePath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('uninstall-mod', (_e, filePath) => {
    try {
        uninstallMod(filePath);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('remove-all-mods', (_e, installDir) => {
    try {
        const count = removeAllMods(installDir);
        return { success: true, count };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('export-presets', async () => {
    const settings = loadSettings();
    const presets = settings.presets || {};
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Presets',
        defaultPath: 'cvrma-presets.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { cancelled: true };
    try {
        fs.writeFileSync(filePath, JSON.stringify(presets, null, 2), 'utf-8');
        return { success: true, path: filePath };
    } catch (e) {
        return { error: e.message };
    }
});

ipcMain.handle('import-presets', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Presets',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { cancelled: true };
    try {
        const raw = fs.readFileSync(filePaths[0], 'utf-8');
        const imported = JSON.parse(raw);
        if (typeof imported !== 'object' || Array.isArray(imported))
            return { error: 'Invalid preset file.' };
        // Validate: each value must be an array of strings
        for (const [k, v] of Object.entries(imported)) {
            if (!Array.isArray(v) || v.some(x => typeof x !== 'string'))
                return { error: `Invalid preset "${k}".` };
        }
        const settings = loadSettings();
        const merged = { ...(settings.presets || {}), ...imported };
        saveSettings({ presets: merged });
        return { success: true, presets: merged };
    } catch (e) {
        return { error: e.message };
    }
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

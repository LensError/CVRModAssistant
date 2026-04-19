require('v8-compile-cache');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const AdmZip = require('adm-zip');
const { execFileSync } = require('child_process');
const { parseMelonInfo } = require('./dll-parser');

// ─── Settings ────────────────────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }
    } catch (e) { console.error('Failed to load settings:', e); }
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

function findSteamLinuxInstallDir() {
    const os = require('os');
    const home = os.homedir();
    const steamRoots = [
        path.join(home, '.local', 'share', 'Steam'),
        path.join(home, '.steam', 'steam'),
        path.join(home, '.steam', 'root'),
    ];

    for (const steamPath of steamRoots) {
        const vdf = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
        if (!fs.existsSync(vdf)) continue;

        const content = fs.readFileSync(vdf, 'utf-8');
        const pathMatches = [...content.matchAll(/"path"\s+"([^"]+)"/g)];
        const libraryPaths = [
            path.join(steamPath, 'steamapps'),
            ...pathMatches.map(m => path.join(m[1], 'steamapps'))
        ];

        for (const lib of libraryPaths) {
            const acf = path.join(lib, 'appmanifest_661130.acf');
            if (!fs.existsSync(acf)) continue;
            const acfContent = fs.readFileSync(acf, 'utf-8');
            const match = acfContent.match(/\s"installdir"\s+"(.+)"/);
            if (match) {
                const gameDir = path.join(lib, 'common', match[1]);
                if (fs.existsSync(path.join(gameDir, 'ChilloutVR.exe'))) {
                    return { dir: gameDir, store: 'Steam' };
                }
            }
        }
    }
    return null;
}

async function detectInstallDir() {
    const settings = loadSettings();
    if (settings.installFolder && fs.existsSync(path.join(settings.installFolder, 'ChilloutVR.exe'))) {
        return { dir: settings.installFolder, store: settings.storeType || 'Unknown' };
    }
    if (process.platform === 'linux') {
        const steam = findSteamLinuxInstallDir();
        if (steam) return steam;
    } else {
        const steam = await findSteamInstallDir();
        if (steam) return steam;
        const oculus = await findOculusInstallDir();
        if (oculus) return oculus;
    }
    return null;
}

// ─── Shared utilities ────────────────────────────────────────────────────────
const normFn = s => s.toLowerCase().replace(/[\s\-_.]/g, '');

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
        } catch (e) { console.error('Failed to scan directory:', fullPath, e); }
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
    const resolvedBase = path.resolve(installDir);
    for (const entry of entries) {
        if (entry.entryName.includes('..')) continue; // guard against zip path traversal
        const targetPath = path.join(installDir, entry.entryName);
        if (!path.resolve(targetPath).startsWith(resolvedBase)) continue;
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
    const nameNorm = normFn(name);
    try {
        for (const f of fs.readdirSync(targetDir).filter(f => f.endsWith('.dll'))) {
            if (f === fileName) continue;
            if (normFn(f.replace(/\.dll$/i, '')).endsWith(nameNorm))
                fs.unlinkSync(path.join(targetDir, f));
        }
    } catch (e) { console.error('Failed to clean up old mod files in', targetDir, ':', e); }

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
    // Mirror the subdirectories scanned by scanInstalledMods so nothing is left behind
    const dirs = [
        'Mods', 'Plugins',
        'Mods/Broken', 'Plugins/Broken',
        'Mods/Retired', 'Plugins/Retired',
    ];
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

function removeAllModsAndMelon(installDir) {
    const count = removeAllMods(installDir);
    removeMelonLoader(installDir);
    return count;
}

// ─── Update mode ─────────────────────────────────────────────────────────────
// 'auto'  — electron-updater handles download + install (NSIS on Windows, AppImage on Linux)
// 'link'  — can only check; user downloads manually (Windows portable, deb, pacman)
function getUpdateMode() {
    if (process.env.PORTABLE_EXECUTABLE_FILE) return 'link';
    if (process.platform === 'linux' && !process.env.APPIMAGE) return 'link';
    return 'auto';
}

function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

async function checkGithubRelease(win) {
    updateCheckState = 'checking';
    updateCheckInfo  = null;
    win?.webContents.send('update-message', 'Checking for updates...');
    try {
        const { buffer } = await downloadToBuffer('https://api.github.com/repos/LensError/CVRModAssistant/releases/latest');
        const release = JSON.parse(buffer.toString('utf-8'));
        const latestVersion = release.tag_name?.replace(/^v/, '');
        if (!latestVersion) throw new Error('Could not parse release version');
        const isNewer = compareVersions(latestVersion, app.getVersion()) > 0;
        if (isNewer) {
            updateCheckState = 'available';
            updateCheckInfo  = { version: latestVersion };
            win?.webContents.send('update-available', { version: latestVersion });
        } else {
            updateCheckState = 'not-available';
            updateCheckInfo  = null;
            win?.webContents.send('update-not-available');
        }
    } catch (e) {
        updateCheckState = 'error';
        updateCheckInfo  = null;
        win?.webContents.send('update-error', e.message);
    }
}

// ─── Update state ─────────────────────────────────────────────────────────────
// Cached so the Options page can read it when it renders (the events already
// fired during the startup check by the time the user navigates there).
let updateCheckState = null; // null | 'checking' | 'available' | 'not-available' | 'error'
let updateCheckInfo  = null; // the info object from update-available, if any

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

    // --- Auto Updater ---
    if (getUpdateMode() === 'auto') {
        autoUpdater.autoDownload = false;
        autoUpdater.logger = console;

        autoUpdater.on('checking-for-update', () => {
            updateCheckState = 'checking';
            updateCheckInfo  = null;
            mainWindow?.webContents.send('update-message', 'Checking for updates...');
        });
        autoUpdater.on('update-available', (info) => {
            updateCheckState = 'available';
            updateCheckInfo  = info;
            mainWindow?.webContents.send('update-available', info);
        });
        autoUpdater.on('update-not-available', () => {
            updateCheckState = 'not-available';
            updateCheckInfo  = null;
            mainWindow?.webContents.send('update-not-available');
        });
        autoUpdater.on('error', (err) => {
            updateCheckState = 'error';
            updateCheckInfo  = null;
            mainWindow?.webContents.send('update-error', err.message);
        });
        autoUpdater.on('download-progress', (progressObj) => {
            mainWindow?.webContents.send('update-download-progress', progressObj.percent);
        });
        autoUpdater.on('update-downloaded', () => {
            mainWindow?.webContents.send('update-downloaded');
        });

        autoUpdater.checkForUpdatesAndNotify();
    } else {
        // deb / pacman / portable — check GitHub releases API on startup
        mainWindow.webContents.once('did-finish-load', () => checkGithubRelease(mainWindow));
    }
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

ipcMain.handle('open-external', (_e, url) => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
        return shell.openExternal(url);
    } catch { /* invalid URL, ignore */ }
});

ipcMain.handle('open-app-data', () => shell.openPath(app.getPath('userData')));

ipcMain.handle('open-game-app-data', () => {
    if (process.platform === 'linux') {
        const os = require('os');
        const home = os.homedir();
        const steamRoots = [
            path.join(home, '.local', 'share', 'Steam'),
            path.join(home, '.steam', 'steam'),
            path.join(home, '.steam', 'root'),
        ];
        const subpath = path.join('steamapps', 'compatdata', '661130', 'pfx', 'drive_c',
            'users', 'steamuser', 'AppData', 'LocalLow', 'ChilloutVR', 'ChilloutVR');
        for (const root of steamRoots) {
            const candidate = path.join(root, subpath);
            if (fs.existsSync(candidate)) return shell.openPath(candidate);
        }
        // Also try library paths from VDF if CVR is in a non-default library
        for (const steamRoot of steamRoots) {
            const vdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
            if (!fs.existsSync(vdf)) continue;
            const content = fs.readFileSync(vdf, 'utf-8');
            for (const [, libPath] of content.matchAll(/"path"\s+"([^"]+)"/g)) {
                const candidate = path.join(libPath, subpath);
                if (fs.existsSync(candidate)) return shell.openPath(candidate);
            }
        }
        return;
    }
    const cvrAppData = path.join(app.getPath('appData'), '..', 'LocalLow', 'ChilloutVR', 'ChilloutVR');
    return shell.openPath(cvrAppData);
});

ipcMain.handle('scan-installed-mods', (_e, installDir) => {
    if (!installDir || !fs.existsSync(installDir)) return [];
    return scanInstalledMods(installDir);
});

ipcMain.handle('melon-loader-status', (_e, installDir) => {
    const installed = isMelonLoaderInstalled(installDir);
    let version = null;
    if (installed && process.platform !== 'linux') {
        try {
            const vDll = path.join(installDir, 'version.dll');
            const escapedPath = vDll.replace(/'/g, "''"); // escape single quotes for PowerShell
            const raw = execFileSync('powershell', [
                '-NoProfile', '-NonInteractive', '-Command',
                `(Get-Item '${escapedPath}').VersionInfo.ProductVersion`
            ], { encoding: 'utf8', timeout: 5000 }).trim();
            version = raw ? raw.split('+')[0] : null;
        } catch { /* leave version null */ }
    }
    return { installed, version };
});

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

ipcMain.handle('remove-all-mods-and-melon', (_e, installDir) => {
    try {
        const count = removeAllModsAndMelon(installDir);
        return { success: true, count };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('is-portable', () => !!process.env.PORTABLE_EXECUTABLE_FILE);
ipcMain.handle('get-update-mode', () => getUpdateMode());

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
        return { success: false, error: e.message };
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
        return { success: true, presets: imported };
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

// Update Handlers
ipcMain.handle('check-for-updates', () => {
    if (getUpdateMode() === 'auto') return autoUpdater.checkForUpdatesAndNotify();
    return checkGithubRelease(mainWindow);
});
ipcMain.handle('download-update', () => autoUpdater.downloadUpdate());
ipcMain.handle('quit-and-install', () => autoUpdater.quitAndInstall());
ipcMain.handle('get-update-state', () => ({ state: updateCheckState, info: updateCheckInfo }));

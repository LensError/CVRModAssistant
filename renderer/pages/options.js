window.OptionsPage = (() => {
    async function render(installDir, storeType) {
        const content = document.getElementById('page-content');
        
        // Clear the notification dot when we enter Options
        const dot = document.getElementById('update-dot');
        if (dot) dot.style.display = 'none';

        content.innerHTML = `
            <div class="options-page fade-in">
                <div class="options-grid">
                    
                    <!-- Environment Card -->
                    <div class="settings-card">
                        <div class="card-header">
                            <div class="card-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                                </svg>
                            </div>
                            <div class="card-title-group">
                                <span class="card-label">App Environment</span>
                                <span class="card-title">Installation</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="settings-row">
                                <div class="settings-row-header">
                                    <span class="settings-label">CVR Directory</span>
                                    <span class="badge-store">${escHtml(storeType || 'Unknown')}</span>
                                </div>
                                <div class="dir-display" title="${escHtml(installDir || '')}">
                                    ${escHtml(installDir || 'Not detected')}
                                </div>
                                <span class="settings-desc">The location where ChilloutVR is installed.</span>
                            </div>
                        </div>
                        <div class="card-footer">
                            <button class="btn-ghost" id="opt-select-dir">Change Folder</button>
                            <button class="btn-ghost" id="opt-open-dir" ${!installDir ? 'disabled' : ''}>Show in Explorer</button>
                        </div>
                    </div>

                    <!-- MelonLoader Card -->
                    <div class="settings-card">
                        <div class="card-header">
                            <div class="card-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>
                                </svg>
                            </div>
                            <div class="card-title-group">
                                <span class="card-label">Modding Base</span>
                                <span class="card-title">MelonLoader</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="ml-status-box">
                                <div class="ml-status-dot" id="ml-dot"></div>
                                <span class="ml-status-text" id="ml-status-text">Checking status…</span>
                            </div>
                            <span class="settings-desc">MelonLoader is required to run any mods in ChilloutVR.</span>
                            ${window.cvrma.platform === 'linux' ? `
                            <div class="info-notice" style="margin-top:10px;">
                                <strong>Proton (Linux)</strong><br>
                                On Steam, add to launch options:<br>
                                <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                                    <code>WINEDLLOVERRIDES="version=n,b" %command%</code>
                                    <button class="btn-ghost" id="copy-proton-cmd" style="padding:2px 8px;font-size:0.75rem;">Copy</button>
                                </div>
                            </div>` : ''}
                        </div>
                        <div class="card-footer">
                            <button class="btn-ghost" id="opt-install-ml" ${!installDir ? 'disabled' : ''}>Install / Update</button>
                            <button class="btn-danger" id="opt-remove-ml" ${!installDir ? 'disabled' : ''}>Uninstall</button>
                        </div>
                    </div>

                    <!-- Preferences Card -->
                    <div class="settings-card">
                        <div class="card-header">
                            <div class="card-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                                </svg>
                            </div>
                            <div class="card-title-group">
                                <span class="card-label">User Experience</span>
                                <span class="card-title">Preferences</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="settings-toggle-row" id="toggle-hide-broken">
                                <div class="settings-row">
                                    <span class="settings-label">Filter Mods</span>
                                    <span class="settings-desc">Hide mods marked as broken or retired from the main list.</span>
                                </div>
                                <input type="checkbox" id="opt-hide-broken" class="custom-checkbox" />
                            </div>
                        </div>
                    </div>

                    <!-- Data Card -->
                    <div class="settings-card">
                        <div class="card-header">
                            <div class="card-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                            </div>
                            <div class="card-title-group">
                                <span class="card-label">Configuration</span>
                                <span class="card-title">Presets Data</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <span class="settings-desc">Backup or restore your mod presets across different installations or share them with others.</span>
                        </div>
                        <div class="card-footer">
                            <button class="btn-ghost" id="opt-export-presets">Export</button>
                            <button class="btn-ghost" id="opt-import-presets">Import</button>
                        </div>
                    </div>

                    <!-- Quick Links Card -->
                    <div class="settings-card">
                        <div class="card-header">
                            <div class="card-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                                </svg>
                            </div>
                            <div class="card-title-group">
                                <span class="card-label">Shortcuts</span>
                                <span class="card-title">Quick Links</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <span class="settings-desc">Open commonly used folders in Explorer.</span>
                        </div>
                        <div class="card-footer">
                            <button class="btn-ghost" id="opt-open-game-dir" ${!installDir ? 'disabled' : ''}>Game Folder</button>
                            <button class="btn-ghost" id="opt-open-game-appdata" ${!installDir ? 'disabled' : ''}>Game AppData</button>
                            <button class="btn-ghost" id="opt-open-appdata">App Data</button>
                        </div>
                    </div>

                    <!-- Application Updates Card -->
                    <div class="settings-card">
                        <div class="card-header">
                            <div class="card-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                            </div>
                            <div class="card-title-group">
                                <span class="card-label">Software Version</span>
                                <span class="card-title">Application Updates</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="update-status-box">
                                <span id="opt-version-text" class="version-tag">v0.0.0</span>
                                <span id="update-info-text" class="update-info">Up to date or check for latest</span>
                                <div class="update-progress-container" id="update-progress-wrap" style="display:none">
                                    <div class="update-progress-bar" id="update-progress-bar" style="width: 0%"></div>
                                </div>
                            </div>
                            <span class="settings-desc">Keep CVR Mod Assistant up to date with the latest features and bug fixes.</span>
                        </div>
                        <div class="card-footer">
                            <button class="btn-ghost" id="opt-check-update">Check Now</button>
                            <button class="btn-primary" id="opt-download-update" style="display:none">Download Update</button>
                            <button class="btn-primary" id="opt-install-update" style="display:none">Restart &amp; Install</button>
                            <button class="btn-primary" id="opt-open-releases" style="display:none">Get Update ↗</button>
                        </div>
                    </div>

                    <!-- Maintenance Card (Danger) -->
                    <div class="settings-card danger">
                        <div class="card-header">
                            <div class="card-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
                                </svg>
                            </div>
                            <div class="card-title-group">
                                <span class="card-label">Troubleshooting</span>
                                <span class="card-title">Maintenance</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <span class="settings-desc">Destructive operations for troubleshooting. Use with caution.</span>
                        </div>
                        <div class="card-footer">
                            <button class="btn-danger" id="opt-remove-all-mods" ${!installDir ? 'disabled' : ''}>Remove Mods</button>
                            <button class="btn-danger" id="opt-remove-all-mods-and-melon" ${!installDir ? 'disabled' : ''}>Remove Mods &amp; MelonLoader</button>
                        </div>
                    </div>

                </div>
            </div>
        `;

        if (installDir) {
            window.cvrma.melonLoaderStatus(installDir).then(r => {
                const dot = document.getElementById('ml-dot');
                const text = document.getElementById('ml-status-text');
                if (dot && text) {
                    if (r.installed) {
                        dot.classList.add('installed');
                        text.textContent = r.version
                            ? `Installed and detected — v${r.version}`
                            : 'Installed and detected';
                        text.style.color = 'var(--online)';
                    } else {
                        text.textContent = 'Not installed';
                        text.style.color = 'var(--text-3)';
                    }
                }
            });
        }

        // --- Event Listeners ---

        const copyProtonBtn = document.getElementById('copy-proton-cmd');
        if (copyProtonBtn) {
            copyProtonBtn.addEventListener('click', () => {
                navigator.clipboard.writeText('WINEDLLOVERRIDES="version=n,b" %command%');
                copyProtonBtn.textContent = 'Copied!';
                setTimeout(() => { copyProtonBtn.textContent = 'Copy'; }, 2000);
            });
        }

        document.getElementById('opt-select-dir').addEventListener('click', async () => {
            const result = await window.cvrma.selectDir();
            if (!result) return;
            if (result.error) { setStatus(result.error, 'err'); return; }
            await window.cvrma.saveSettings({ installFolder: result.dir, storeType: result.store });
            window.App.setInstallDir(result.dir, result.store);
            render(result.dir, result.store);
            setStatus(`Install directory updated.`, 'ok');
        });

        const openDirBtn = document.getElementById('opt-open-dir');
        if (openDirBtn) {
            openDirBtn.addEventListener('click', () => {
                if (installDir) window.cvrma.openDir(installDir);
            });
        }

        const installMlBtn = document.getElementById('opt-install-ml');
        if (installMlBtn) {
            installMlBtn.addEventListener('click', async () => {
                installMlBtn.disabled = true;
                installMlBtn.innerHTML = '<span class="spinner" style="width:13px;height:13px;"></span> Installing…';
                const result = await window.cvrma.installMelonLoader(installDir);
                if (result.success) {
                    setStatus('MelonLoader installed successfully.', 'ok');
                    render(installDir, storeType);
                } else {
                    setStatus(`MelonLoader install failed: ${result.error}`, 'err');
                    installMlBtn.disabled = false;
                    installMlBtn.textContent = 'Install / Update';
                }
            });
        }

        const removeMlBtn = document.getElementById('opt-remove-ml');
        if (removeMlBtn) {
            removeMlBtn.addEventListener('click', async () => {
                if (!await window.App.confirm({ title: 'Uninstall MelonLoader', body: 'This will delete version.dll, dobby.dll and the MelonLoader folder. This cannot be undone.', confirmLabel: 'Uninstall', danger: true })) return;
                removeMlBtn.disabled = true;
                const result = await window.cvrma.removeMelonLoader(installDir);
                if (result.success) {
                    setStatus('MelonLoader removed.', 'ok');
                    render(installDir, storeType);
                } else {
                    setStatus(`Failed: ${result.error}`, 'err');
                    removeMlBtn.disabled = false;
                }
            });
        }

        // Hide Broken Mods Toggle
        const hideBrokenChk = document.getElementById('opt-hide-broken');
        const hideBrokenRow = document.getElementById('toggle-hide-broken');
        if (hideBrokenChk && hideBrokenRow) {
            const s = await window.cvrma.loadSettings();
            hideBrokenChk.checked = s.hideBroken !== false;

            hideBrokenRow.addEventListener('click', (e) => {
                // If it wasn't the checkbox itself that was clicked, toggle it
                if (e.target !== hideBrokenChk) {
                    hideBrokenChk.checked = !hideBrokenChk.checked;
                    hideBrokenChk.dispatchEvent(new Event('change'));
                }
            });

            hideBrokenChk.addEventListener('change', () => {
                window.cvrma.saveSettings({ hideBroken: hideBrokenChk.checked });
            });
        }

        document.getElementById('opt-export-presets').addEventListener('click', async () => {
            const result = await window.cvrma.exportPresets();
            if (result.cancelled) return;
            if (result.error) { setStatus(`Export failed: ${result.error}`, 'err'); return; }
            setStatus(`Presets exported successfully.`, 'ok');
        });

        document.getElementById('opt-import-presets').addEventListener('click', async () => {
            const mode = await window.App.choice({
                title: 'Import Presets',
                body: 'Replace all existing presets, or add the imported presets to your current ones?',
                buttons: [
                    { label: 'Cancel',  value: null,  style: 'btn-ghost'  },
                    { label: 'Add',     value: false, style: 'btn-ghost'  },
                    { label: 'Replace', value: true,  style: 'btn-danger' },
                ],
            });
            if (mode === null) return;

            const result = await window.cvrma.importPresets();
            if (result.cancelled) return;
            if (result.error) { setStatus(`Import failed: ${result.error}`, 'err'); return; }

            const imported = result.presets || {};

            if (mode === true) {
                // Replace: discard existing, use imported as-is
                await window.cvrma.saveSettings({ presets: imported });
                const count = Object.keys(imported).length;
                setStatus(`Replaced presets — ${count} preset${count !== 1 ? 's' : ''} imported.`, 'ok');
                return;
            }

            // Add: merge with conflict resolution
            const settings = await window.cvrma.loadSettings();
            const existing = settings.presets || {};
            const conflicts = Object.keys(imported).filter(k => k in existing);
            const final = { ...existing };
            let globalDecision = null; // null=ask, true=overwrite all, false=keep all

            for (let i = 0; i < conflicts.length; i++) {
                const name = conflicts[i];
                let overwrite;
                if (globalDecision !== null) {
                    overwrite = globalDecision;
                } else {
                    const { overwrite: ow, applyToAll } = await window.App.conflict({
                        name,
                        existingCount: existing[name].length,
                        importedCount: imported[name].length,
                        remaining: conflicts.length - i,
                    });
                    overwrite = ow;
                    if (applyToAll) globalDecision = overwrite;
                }
                if (overwrite) final[name] = imported[name];
            }

            // Add non-conflicting imports
            for (const [k, v] of Object.entries(imported)) {
                if (!(k in existing)) final[k] = v;
            }

            await window.cvrma.saveSettings({ presets: final });
            const added = Object.keys(imported).filter(k => !(k in existing)).length;
            const overwritten = conflicts.filter(k => final[k] !== existing[k]).length;
            const parts = [];
            if (added) parts.push(`${added} added`);
            if (overwritten) parts.push(`${overwritten} overwritten`);
            if (!parts.length) parts.push('no changes');
            setStatus(`Presets imported — ${parts.join(', ')}.`, 'ok');
        });

        const openGameDirBtn = document.getElementById('opt-open-game-dir');
        if (openGameDirBtn) {
            openGameDirBtn.addEventListener('click', () => {
                if (installDir) window.cvrma.openDir(installDir);
            });
        }

        const openGameAppDataBtn = document.getElementById('opt-open-game-appdata');
        if (openGameAppDataBtn) {
            openGameAppDataBtn.addEventListener('click', () => window.cvrma.openGameAppData());
        }

        document.getElementById('opt-open-appdata').addEventListener('click', () => window.cvrma.openAppData());

        const removeAllBtn = document.getElementById('opt-remove-all-mods');
        if (removeAllBtn) {
            removeAllBtn.addEventListener('click', async () => {
                if (!await window.App.confirm({ title: 'Remove All Mods', body: 'All DLL files in the Mods and Plugins folders will be deleted. This cannot be undone.', confirmLabel: 'Remove Mods', danger: true })) return;
                removeAllBtn.disabled = true;
                const result = await window.cvrma.removeAllMods(installDir);
                if (result.success) {
                    setStatus(`Removed ${result.count} mod file(s).`, 'ok');
                    window.ModsPage.notifyModsWiped(installDir);
                } else {
                    setStatus(`Failed: ${result.error}`, 'err');
                }
                removeAllBtn.disabled = false;
            });
        }

        const removeAllAndMelonBtn = document.getElementById('opt-remove-all-mods-and-melon');
        if (removeAllAndMelonBtn) {
            removeAllAndMelonBtn.addEventListener('click', async () => {
                if (!await window.App.confirm({ title: 'Remove Mods & MelonLoader', body: 'All mods will be deleted and MelonLoader will be uninstalled. This cannot be undone.', confirmLabel: 'Remove All', danger: true })) return;
                removeAllAndMelonBtn.disabled = true;
                const result = await window.cvrma.removeAllModsAndMelon(installDir);
                if (result.success) {
                    setStatus(`Removed ${result.count} mod file(s) and MelonLoader.`, 'ok');
                    window.ModsPage.notifyModsWiped(installDir);
                    render(installDir, storeType);
                } else {
                    setStatus(`Failed: ${result.error}`, 'err');
                    removeAllAndMelonBtn.disabled = false;
                }
            });
        }

        // --- Update Logic ---
        const versionText = document.getElementById('opt-version-text');
        const updateInfo = document.getElementById('update-info-text');
        const checkBtn = document.getElementById('opt-check-update');
        const downloadBtn = document.getElementById('opt-download-update');
        const installBtn = document.getElementById('opt-install-update');
        const progressWrap = document.getElementById('update-progress-wrap');
        const progressBar = document.getElementById('update-progress-bar');

        // Clean up old listeners to prevent memory leaks and double-triggers
        window.cvrma.offUpdateEvents();

        const version = await window.cvrma.getAppVersion();
        if (versionText) versionText.textContent = `v${version}`;

        const updateMode = await window.cvrma.getUpdateMode();
        const openReleasesBtn = document.getElementById('opt-open-releases');

        if (checkBtn) {
            checkBtn.addEventListener('click', () => {
                checkBtn.disabled = true;
                updateInfo.textContent = 'Checking...';
                window.cvrma.checkForUpdates();
            });
        }

        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                downloadBtn.style.display = 'none';
                progressWrap.style.display = 'block';
                window.cvrma.downloadUpdate();
            });
        }

        if (installBtn) {
            installBtn.addEventListener('click', () => {
                window.cvrma.quitAndInstall();
            });
        }

        if (openReleasesBtn) {
            openReleasesBtn.addEventListener('click', () => {
                window.cvrma.openExternal('https://github.com/LensError/CVRModAssistant/releases/latest');
            });
        }

        // Handle generic status messages from the updater
        window.cvrma.onUpdateMessage?.((msg) => {
            if (updateInfo) updateInfo.textContent = msg;
        });

        window.cvrma.onUpdateAvailable((info) => {
            if (updateMode === 'link') {
                updateInfo.textContent = `v${info.version} available — download from GitHub releases`;
                checkBtn.style.display = 'none';
                openReleasesBtn.style.display = 'inline-flex';
            } else {
                updateInfo.textContent = `New version available: v${info.version}`;
                checkBtn.style.display = 'none';
                downloadBtn.style.display = 'inline-flex';
            }
        });

        window.cvrma.onUpdateNotAvailable(() => {
            updateInfo.textContent = 'Application is up to date';
            if (checkBtn) {
                checkBtn.disabled = false;
                checkBtn.style.display = 'inline-flex';
            }
        });

        window.cvrma.onUpdateError((_msg) => {
            updateInfo.textContent = `Update check failed.`;
            if (checkBtn) checkBtn.disabled = false;
        });

        window.cvrma.onUpdateDownloadProgress((p) => {
            progressBar.style.width = `${p}%`;
        });

        window.cvrma.onUpdateDownloaded(() => {
            updateInfo.textContent = 'Update ready to install';
            progressWrap.style.display = 'none';
            installBtn.style.display = 'inline-flex';
        });

        // Populate UI from the startup check result so the user doesn't have
        // to press "Check Now" just to see the status that was already fetched.
        const cached = await window.cvrma.getUpdateState();
        if (cached && cached.state) {
            if (cached.state === 'available' && cached.info) {
                if (updateMode === 'link') {
                    updateInfo.textContent = `v${cached.info.version} available — download from GitHub releases`;
                    checkBtn.style.display = 'none';
                    openReleasesBtn.style.display = 'inline-flex';
                } else {
                    updateInfo.textContent = `New version available: v${cached.info.version}`;
                    checkBtn.style.display = 'none';
                    downloadBtn.style.display = 'inline-flex';
                }
            } else if (cached.state === 'not-available') {
                updateInfo.textContent = 'Application is up to date';
                if (checkBtn) checkBtn.disabled = false;
            } else if (cached.state === 'error') {
                updateInfo.textContent = 'Update check failed.';
                if (checkBtn) checkBtn.disabled = false;
            } else if (cached.state === 'checking') {
                updateInfo.textContent = 'Checking for updates…';
                if (checkBtn) checkBtn.disabled = true;
            }
        }
    }

    function setStatus(text, type = '') {
        const el = document.getElementById('status-text');
        if (!el) return;
        el.textContent = text;
        el.className = type ? `status-${type}` : '';
    }

    function escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    return { render };
})();

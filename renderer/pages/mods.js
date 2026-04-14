// Mods Page Module — presets, sync-based install/uninstall, dirty detection
window.ModsPage = (() => {
    const CVRMG_API = 'https://api.cvrmg.com/v1/mods';
    const FLAGS_API = 'https://gist.githubusercontent.com/Nirv-git/1963e20d855c401349820a93b4d2639b/raw/cvrModFlags.json';

    const BROKEN_CAT    = { name: 'Broken',              desc: 'Broken by a game update — restored automatically when updated.' };
    const RETIRED_CAT   = { name: 'Retired',              desc: 'No longer needed or no longer maintained.' };
    const UNKNOWN_CAT   = { name: 'Unknown / Unverified', desc: 'Not from CVRMG — potentially dangerous.' };
    const UNMANAGED_CAT = { name: 'Unmanaged',            desc: 'Installed DLLs not found in the CVRMG list — cannot be managed by this app.' };
    const TAIL_CATS     = ['Unmanaged', 'Broken', 'Retired', 'Unknown / Unverified'];
    const DEFAULT_MODS  = ['UI Expansion Kit', 'CVRModUpdater.Loader'];

    let state = {
        allMods:          [],
        flagMap:          {},
        installedFiles:      [],
        modList:             [],
        filter:              '',
        hideBroken:       true,
        activeFlyoutMod:  null,
        installDir:       null,
        isDirty:          false,
        presets:          {},
        activePresetName: null,
    };

    // ── Filename matching ──────────────────────────────────────────────────────
    function normName(n) { return n.toLowerCase().replace(/[\s\-_.]/g, ''); }

    function matchInstalledFile(modName, aliases) {
        const norm = normName(modName);
        const aliasNorms = (aliases || []).map(normName);
        for (const f of state.installedFiles) {
            const fn = normName(f.baseName);
            if (fn === norm || aliasNorms.includes(fn)) return f;
        }
        return null;
    }

    // ── Mod list building ──────────────────────────────────────────────────────
    function buildModList(mods) {
        const items = [];
        const matchedFilePaths = new Set();
        const haveInstalled = state.installedFiles.length > 0;
        const presetMods = (state.presets[state.activePresetName] || []);

        for (const mod of mods) {
            const ver = mod.versions[0];
            const installed = matchInstalledFile(ver.name, mod.aliases);
            if (installed) matchedFilePaths.add(installed.filePath);

            const inPreset = presetMods.includes(ver.name);
            const isSelected = presetMods.length > 0
                ? inPreset
                : (DEFAULT_MODS.includes(ver.name) && !haveInstalled) || !!installed;

            let category;
            if (ver.approvalStatus === 2)     category = BROKEN_CAT;
            else if (ver.approvalStatus === 3) category = RETIRED_CAT;
            else                              category = { name: mod.category || 'Uncategorized', desc: '' };

            items.push({
                id:               mod._id,
                name:             ver.name,
                version:          ver.modVersion,
                author:           ver.author || '—',
                description:      (ver.description || '').replace(/[\r\n]+/g, ' '),
                downloadLink:     ver.downloadLink,
                sourceLink:       ver.sourceLink,
                cvrVersion:       ver.ChilloutVRVersion,
                isPlugin:         (ver.modType || '').toLowerCase() === 'plugin',
                isBroken:         ver.approvalStatus === 2,
                isRetired:        ver.approvalStatus === 3,
                isUnmanaged:      false,
                flag:             state.flagMap[mod._id] || 0,
                category,
                isSelected:       (ver.approvalStatus === 2 || ver.approvalStatus === 3) ? false : isSelected,
                installedFile:    installed || null,
                installedVersion: installed ? (installed.version || null) : null,
                needsUpdate:      installed ? (installed.version !== ver.modVersion) : false,
            });
        }

        // Detect unmanaged: installed DLLs not matched to any CVRMG mod
        for (const f of state.installedFiles) {
            if (matchedFilePaths.has(f.filePath)) continue;
            items.push({
                id:               `unmanaged-${f.filePath}`,
                name:             f.baseName,
                version:          '?',
                author:           'Unknown',
                description:      'This file was found in your mods folder but is not listed in the CVRMG mod database.',
                downloadLink:     null,
                sourceLink:       null,
                cvrVersion:       null,
                isPlugin:         f.filePath.toLowerCase().includes('plugins'),
                isBroken:         false,
                isRetired:        false,
                isUnmanaged:      true,
                flag:             0,
                category:         UNMANAGED_CAT,
                isSelected:       true,  // visually checked (installed)
                installedFile:    f,
                installedVersion: f.version || f.baseName,
            });
        }

        return items;
    }

    // ── Presets ────────────────────────────────────────────────────────────────
    async function loadPresets() {
        const s = await window.cvrma.loadSettings();
        state.presets = s.presets || { 'Default': [] };
        state.activePresetName = s.activePresetName || Object.keys(state.presets)[0];
        if (!state.presets[state.activePresetName])
            state.activePresetName = Object.keys(state.presets)[0];
    }

    async function savePresets() {
        await window.cvrma.saveSettings({
            presets: state.presets,
            activePresetName: state.activePresetName,
        });
    }

    function captureSelections() {
        return state.modList.filter(m => m.isSelected).map(m => m.name);
    }

    function saveCurrentToPreset() {
        if (state.activePresetName)
            state.presets[state.activePresetName] = captureSelections();
    }

    function applyPreset(name) {
        if (!state.presets[name]) return;
        state.activePresetName = name;
        const mods = state.presets[name];
        for (const item of state.modList) {
            if (item.isUnmanaged) continue;
            if (item.isBroken || item.isRetired) { item.isSelected = false; continue; }
            item.isSelected = mods.includes(item.name);
        }
    }

    // ── Dirty detection ────────────────────────────────────────────────────────
    function checkDirty() {
        state.isDirty = state.modList.some(m =>
            !m.isUnmanaged && !m.isBroken && !m.isRetired && (
                (m.isSelected && !m.installedFile) ||
                (m.isSelected &&  m.installedFile && m.needsUpdate) ||
                (!m.isSelected && m.installedFile)
            )
        );
        const btn = document.getElementById('btn-install');
        if (btn) btn.classList.toggle('btn-pulse', state.isDirty);
    }

    // ── Preset bar ─────────────────────────────────────────────────────────────
    function injectPresetBar() {
        let bar = document.getElementById('preset-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'preset-bar';
            const pc = document.getElementById('page-content');
            pc.parentNode.insertBefore(bar, pc);
        }
        return bar;
    }

    function renderPresetBar() {
        const bar = injectPresetBar();
        const names = Object.keys(state.presets);
        bar.innerHTML = `
            <span class="preset-bar-label mono">Preset</span>
            <div class="preset-tabs">
                ${names.map(n => `
                    <button class="preset-tab${n === state.activePresetName ? ' active' : ''}"
                            data-preset="${escHtml(n)}">${escHtml(n)}</button>
                `).join('')}
            </div>
            <div class="preset-actions">
                <button class="preset-action-btn" id="pb-new" title="Create new preset from current selection">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg> New
                </button>
                <button class="preset-action-btn" id="pb-rename" title="Rename active preset">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg> Rename
                </button>
                <button class="preset-action-btn preset-action-danger" id="pb-delete"
                        title="Delete active preset" ${names.length <= 1 ? 'disabled' : ''}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                    </svg> Delete
                </button>
            </div>
        `;

        bar.querySelectorAll('.preset-tab').forEach(tab => {
            tab.addEventListener('click', async () => {
                const name = tab.dataset.preset;
                if (name === state.activePresetName) return;
                saveCurrentToPreset();
                applyPreset(name);
                checkDirty();
                refreshCardList();
                updateSyncBtn();
                renderPresetBar();
                await savePresets();
            });
        });

        document.getElementById('pb-new').addEventListener('click', async () => {
            const name = await promptName('New preset name:', '');
            if (!name) return;
            if (state.presets[name]) { setStatus(`Preset "${name}" already exists.`, 'wrn'); return; }
            saveCurrentToPreset();
            state.presets[name] = captureSelections();
            state.activePresetName = name;
            await savePresets();
            renderPresetBar();
            setStatus(`Preset "${name}" created.`, 'ok');
        });

        document.getElementById('pb-rename').addEventListener('click', async () => {
            const newName = await promptName('Rename to:', state.activePresetName);
            if (!newName || newName === state.activePresetName) return;
            if (state.presets[newName]) { setStatus(`"${newName}" already exists.`, 'wrn'); return; }
            // Rebuild object preserving insertion order with the new key in place
            const rebuilt = {};
            for (const [k, v] of Object.entries(state.presets))
                rebuilt[k === state.activePresetName ? newName : k] = v;
            state.presets = rebuilt;
            state.activePresetName = newName;
            await savePresets();
            renderPresetBar();
        });

        document.getElementById('pb-delete')?.addEventListener('click', async () => {
            if (Object.keys(state.presets).length <= 1) return;
            if (!await window.App.confirm({ title: `Delete preset "${state.activePresetName}"?`, body: 'This preset will be permanently removed.', confirmLabel: 'Delete', danger: true })) return;
            delete state.presets[state.activePresetName];
            state.activePresetName = Object.keys(state.presets)[0];
            applyPreset(state.activePresetName);
            checkDirty();
            refreshCardList();
            updateSyncBtn();
            renderPresetBar();
            await savePresets();
            setStatus('Preset deleted.', 'ok');
        });
    }

    function promptName(label, def) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'preset-prompt-overlay';
            overlay.innerHTML = `
                <div class="preset-prompt">
                    <div class="preset-prompt-label">${escHtml(label)}</div>
                    <input class="preset-prompt-input" type="text" value="${escHtml(def)}" maxlength="40" />
                    <div class="preset-prompt-actions">
                        <button class="btn-ghost" id="pp-cancel">Cancel</button>
                        <button class="btn-primary" id="pp-ok">Save</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            const input = overlay.querySelector('.preset-prompt-input');
            requestAnimationFrame(() => { input.select(); input.focus(); });

            const done = v => { document.body.removeChild(overlay); resolve(v); };
            document.getElementById('pp-ok').onclick     = () => done(input.value.trim() || null);
            document.getElementById('pp-cancel').onclick = () => done(null);
            input.onkeydown = e => {
                if (e.key === 'Enter') done(input.value.trim() || null);
                if (e.key === 'Escape') done(null);
            };
            overlay.onclick = e => { if (e.target === overlay) done(null); };
        });
    }

    // ── API ────────────────────────────────────────────────────────────────────
    async function fetchMods() {
        const res = await fetch(CVRMG_API);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        data.forEach(m => { m.category = m.category || 'Uncategorized'; });
        data.sort((a, b) => {
            const cc = a.category.localeCompare(b.category);
            return cc !== 0 ? cc : a.versions[0].name.localeCompare(b.versions[0].name);
        });
        return data;
    }

    async function fetchFlags() {
        try {
            const res = await fetch(FLAGS_API);
            if (!res.ok) return {};
            const data = await res.json();
            const map = {};
            for (const e of data) map[e._id] = e.flag;
            return map;
        } catch { return {}; }
    }

    // ── Render helpers ─────────────────────────────────────────────────────────
    function catId(name) { return 'cat-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

    function flagHtml(flag) {
        if (flag === 1) return `<span class="mod-card-flag" style="color:var(--flag-gold)" title="Recommended">★</span>`;
        if (flag === 2) return `<span class="mod-card-flag" style="color:var(--flag-crim)" title="Community Favourite">♥</span>`;
        if (flag === 3) return `<span class="mod-card-flag" style="color:var(--flag-orange)" title="Informational">ⓘ</span>`;
        return '';
    }

    function versionBadge(item) {
        if (!item.installedFile) return `<span class="badge badge-version">${item.version}</span>`;
        if (!item.needsUpdate)   return `<span class="badge badge-installed" title="Up to date">✓&nbsp;${item.version}</span>`;
        return `<span class="badge badge-installed" title="Installed">${item.installedVersion || '?'}</span>
                <span class="badge badge-version" title="Latest">→&nbsp;${item.version}</span>`;
    }

    function statusBadges(item) {
        const b = [];
        if (item.isBroken)  b.push(`<span class="badge badge-broken">Broken</span>`);
        if (item.isRetired) b.push(`<span class="badge badge-retired">Retired</span>`);
        if (item.isPlugin)  b.push(`<span class="badge badge-plugin">Plugin</span>`);
        return b.join('');
    }

    function renderSkeletons(n = 14) {
        let h = '';
        for (let i = 0; i < n; i++) {
            h += `<div class="mod-skeleton">
                <div class="skeleton mod-skeleton-check"></div>
                <div class="mod-skeleton-body">
                    <div class="skeleton mod-skeleton-name" style="width:${30 + Math.random()*30}%"></div>
                    <div class="skeleton mod-skeleton-desc" style="width:${50 + Math.random()*30}%"></div>
                </div>
                <div class="skeleton mod-skeleton-badge"></div>
            </div>`;
        }
        return h;
    }

    function getFiltered() {
        let list = state.modList;
        if (state.hideBroken)
            list = list.filter(item => !(( item.isBroken || item.isRetired) && !item.isSelected));
        const q = state.filter.trim().toLowerCase().replace(/\s+/g, '');
        if (!q) return list;
        return list.filter(item => {
            const n = item.name.toLowerCase().replace(/\s+/g, '');
            const d = item.description.toLowerCase().replace(/\s+/g, '');
            return n.includes(q) || d.includes(q);
        });
    }

    function renderModList(list) {
        if (!list.length) return `
            <div class="empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <p>No mods match your search.</p>
            </div>`;

        const groups = new Map();
        for (const item of list) {
            const k = item.category.name;
            if (!groups.has(k)) groups.set(k, { info: item.category, items: [] });
            groups.get(k).items.push(item);
        }

        const sorted = [...groups.entries()].sort(([a], [b]) => {
            const ai = TAIL_CATS.indexOf(a), bi = TAIL_CATS.indexOf(b);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return 1; if (bi !== -1) return -1;
            return a.localeCompare(b);
        });

        let html = '<div class="mod-list">';
        for (const [, group] of sorted) {
            html += `<div class="cat-anchor" id="${catId(group.info.name)}"></div>
            <div class="category-header">
                <span class="category-name">${escHtml(group.info.name)}</span>
                ${group.info.desc ? `<span class="category-desc">${escHtml(group.info.desc)}</span>` : ''}
                <span class="category-count mono">${group.items.length}</span>
            </div>`;

            for (const item of group.items) {
                const flyoutOpen = state.activeFlyoutMod?.id === item.id;
                const willRemove = !item.isUnmanaged && !item.isSelected && item.installedFile;
                const cbChecked  = item.isSelected;
                const cbDisabled = item.isBroken || item.isRetired || item.isUnmanaged;
                const wrapClass  = [
                    'mod-card-check-wrap',
                    cbChecked  ? 'is-checked'  : '',
                    cbDisabled ? 'is-disabled' : '',
                ].filter(Boolean).join(' ');
                const cbTitle = item.isUnmanaged
                    ? 'Unmanaged — cannot be controlled here'
                    : (cbChecked ? 'Deselect' : 'Select') + ' ' + escHtml(item.name);
                html += `
                <div class="mod-card${flyoutOpen ? ' flyout-open' : ''}${willRemove ? ' will-remove' : ''}${item.isUnmanaged ? ' unmanaged' : ''}" data-id="${String(item.id).replace(/"/g, '')}">
                    <label class="${wrapClass}" title="${cbTitle}">
                        <input type="checkbox" class="mod-card-check" data-id="${String(item.id).replace(/"/g, '')}"
                            ${cbChecked  ? 'checked'  : ''}
                            ${cbDisabled ? 'disabled' : ''} />
                        <span class="mod-card-check-tick"></span>
                    </label>
                    <div class="mod-card-main">
                        <div class="mod-card-row1">
                            <span class="mod-card-name">${escHtml(item.name)}</span>
                            <span class="mod-card-author">by ${escHtml(item.author)}</span>
                        </div>
                        <div class="mod-card-desc">${escHtml(item.description) || '<em style="color:var(--text-3)">No description.</em>'}</div>
                    </div>
                    <div class="mod-card-badges">
                        ${flagHtml(item.flag)}
                        ${willRemove ? `<span class="badge badge-will-remove">Will Remove</span>` : ''}
                        ${item.isUnmanaged ? `<span class="badge badge-unmanaged">Unmanaged</span>` : ''}
                        ${statusBadges(item)}
                        ${versionBadge(item)}
                    </div>

                </div>`;
            }

        }
        return html + '</div>';
    }

    // ── Flyout ─────────────────────────────────────────────────────────────────
    function ensureFlyout() {
        let flyout = document.getElementById('detail-flyout');
        if (!flyout) {
            flyout = document.createElement('div');
            flyout.id = 'detail-flyout';
            // Append to #main-area so it is a sibling of #page-content.
            // This keeps it fixed relative to the viewport while the mod list scrolls.
            const mainArea = document.getElementById('main-area');
            mainArea.appendChild(flyout);
        }
        return flyout;
    }

    function openFlyout(item) {
        state.activeFlyoutMod = item;
        const flyout = ensureFlyout();
        flyout.innerHTML = `
            <div class="flyout-header">
                <div>
                    <div class="flyout-title">${escHtml(item.name)}</div>
                    <div class="flyout-author">by ${escHtml(item.author)}</div>
                </div>
                <button class="flyout-close" id="flyout-close-btn" title="Close">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="flyout-body">
                <div class="flyout-section">
                    <div class="flyout-label">Description</div>
                    <div class="flyout-value">${escHtml(item.description) || '<em style="color:var(--text-3)">No description.</em>'}</div>
                </div>
                <div class="flyout-section">
                    <div class="flyout-label">Versions</div>
                    <div class="flyout-version-row">
                        ${item.installedFile && !item.needsUpdate
                            ? `<span class="badge badge-installed">✓&nbsp;${escHtml(item.version)}</span>`
                            : `<span class="badge badge-version">Latest: ${escHtml(item.version)}</span>`
                        }
                        ${item.installedFile && item.needsUpdate
                            ? `<span class="badge badge-installed">Installed: ${escHtml(item.installedVersion || '?')}</span>`
                            : !item.installedFile
                                ? `<span class="badge" style="background:var(--bg-5);border:1px solid var(--border);color:var(--text-3)">Not installed</span>`
                                : ''
                        }
                    </div>
                </div>
                <div class="flyout-section">
                    <div class="flyout-label">Category</div>
                    <div class="flyout-value">${escHtml(item.category.name)}</div>
                </div>
                ${item.cvrVersion ? `
                <div class="flyout-section">
                    <div class="flyout-label">CVR Version</div>
                    <div class="flyout-value mono" style="font-size:10px;">${escHtml(item.cvrVersion)}</div>
                </div>` : ''}
                <div class="flyout-section">
                    <div class="flyout-label">Type</div>
                    <div class="flyout-value">
                        ${item.isPlugin ? '<span class="badge badge-plugin">Plugin</span>' : '<span class="badge badge-version">Mod</span>'}
                        ${item.isBroken  ? '<span class="badge badge-broken"  style="margin-left:4px">Broken</span>'  : ''}
                        ${item.isRetired ? '<span class="badge badge-retired" style="margin-left:4px">Retired</span>' : ''}
                    </div>
                </div>
                ${item.sourceLink ? `
                <div class="flyout-section">
                    <div class="flyout-label">Source</div>
                    <div class="flyout-value"><a href="#" data-ext="${escHtml(item.sourceLink)}">GitHub ↗</a></div>
                </div>` : ''}
                ${item.installedFile ? `
                <div class="flyout-section">
                    <div class="flyout-label">File</div>
                    <div class="flyout-value mono" style="font-size:9px;word-break:break-all;">${escHtml(item.installedFile.fileName)}</div>
                </div>` : ''}
            </div>
            <div class="flyout-footer">
                ${item.isUnmanaged ? `
                <button id="flyout-delete-unmanaged-btn" class="btn" style="width:100%;margin-bottom:8px;background:var(--danger,#c0392b);color:#fff;border:none;">
                    Delete File
                </button>` : ''}
                <p style="font-size:11px;color:var(--text-3);line-height:1.55;">
                    ${item.isUnmanaged
                        ? 'This file is not in the CVRMG database and cannot be managed here. Delete it if it\'s no longer needed.'
                        : 'Toggle the checkbox on the card, then click <strong style="color:var(--text)">Sync Mods</strong> to install or remove this mod.'
                    }
                </p>
            </div>
        `;
        requestAnimationFrame(() => flyout.classList.add('open'));
        document.getElementById('flyout-close-btn').onclick = closeFlyout;
        flyout.querySelectorAll('[data-ext]').forEach(el => {
            el.addEventListener('click', e => { e.preventDefault(); window.cvrma.openExternal(el.dataset.ext); });
        });
        const deleteBtn = document.getElementById('flyout-delete-unmanaged-btn');
        if (deleteBtn && item.isUnmanaged && item.installedFile) {
            deleteBtn.addEventListener('click', async () => {
                deleteBtn.disabled = true;
                deleteBtn.textContent = 'Deleting…';
                await window.cvrma.uninstallMod(item.installedFile.filePath);
                closeFlyout();
                try { state.installedFiles = await window.cvrma.scanInstalledMods(state.installDir); }
                catch { state.installedFiles = []; }
                state.modList = buildModList(state.allMods);
                checkDirty();
                refreshCardList();
                updateSyncBtn();
            });
        }
        // Attach a one-time click-outside listener on #page-content
        attachClickOutside();
        refreshCardList();
    }

    function closeFlyout() {
        state.activeFlyoutMod = null;
        const f = document.getElementById('detail-flyout');
        if (f) f.classList.remove('open');
        detachClickOutside();
        refreshCardList();
    }

    let _clickOutsideHandler = null;
    function attachClickOutside() {
        detachClickOutside(); // guard against duplicates
        const pc = document.getElementById('page-content');
        if (!pc) return;
        _clickOutsideHandler = (e) => {
            // Ignore clicks that are inside the flyout element itself
            const flyout = document.getElementById('detail-flyout');
            if (flyout && flyout.contains(e.target)) return;
            // Ignore clicks on the currently active mod-card (let card's own handler toggle)
            if (e.target.closest('.mod-card.flyout-open')) return;
            closeFlyout();
        };
        // Use capture so we fire before card click handlers
        pc.addEventListener('mousedown', _clickOutsideHandler, true);
    }
    function detachClickOutside() {
        if (!_clickOutsideHandler) return;
        const pc = document.getElementById('page-content');
        if (pc) pc.removeEventListener('mousedown', _clickOutsideHandler, true);
        _clickOutsideHandler = null;
    }

    // ── Sync (install selected, remove deselected-installed) ──────────────────
    async function syncMods() {
        if (!state.installDir) { setStatus('No install directory set.', 'err'); return; }

        const btn = document.getElementById('btn-install');
        const isReinstall = btn?.dataset.inSync === '1';
        if (btn) { btn.disabled = true; btn.classList.remove('btn-pulse'); }
        const toInstall   = state.modList.filter(m => !m.isUnmanaged && m.isSelected && !m.isBroken && !m.isRetired && (!m.installedFile || m.needsUpdate || isReinstall));
        const toUninstall = state.modList.filter(m => !m.isUnmanaged && !m.isSelected && m.installedFile);

        // Ask about any installed broken/retired mods that aren't already queued for removal
        const installedBrokenRetired = state.modList.filter(m =>
            !m.isUnmanaged && (m.isBroken || m.isRetired) && m.installedFile &&
            !toUninstall.includes(m)
        );
        if (installedBrokenRetired.length) {
            const names = installedBrokenRetired.map(m => `${m.name} (${m.isBroken ? 'Broken' : 'Retired'})`).join(', ');
            const remove = await window.App.confirm({
                title: 'Remove Broken / Retired Mods?',
                body: `The following installed mods are marked Broken or Retired and will be removed:\n${names}`,
                confirmLabel: 'Remove',
                danger: true,
            });
            if (remove) toUninstall.push(...installedBrokenRetired);
        }

        const total = toInstall.length + toUninstall.length;

        if (total === 0) {
            setStatus('Everything is already in sync.', 'ok');
            if (btn) btn.disabled = false;
            return;
        }

        if (toInstall.length) {
            setStatus('Checking MelonLoader…', '');
            const ml = await window.cvrma.melonLoaderStatus(state.installDir);
            if (!ml.installed) {
                setStatus('Installing MelonLoader…', '');
                const r = await window.cvrma.installMelonLoader(state.installDir);
                if (!r.success) {
                    setStatus(`MelonLoader failed: ${r.error}`, 'err');
                    if (btn) btn.disabled = false;
                    return;
                }
            }
        }

        let done = 0, removed = 0, installed = 0;

        for (const item of toUninstall) {
            setStatus(`Removing ${item.name}…`, '');
            setProgress(done / total * 0.95);
            const r = await window.cvrma.uninstallMod(item.installedFile.filePath);
            if (r.success) removed++;
            done++;
        }

        for (const item of toInstall) {
            setStatus(`Installing ${item.name}… (${done + 1}/${total})`, '');
            setProgress(done / total * 0.95);
            const r = await window.cvrma.installMod(state.installDir, {
                downloadLink: item.downloadLink, name: item.name, version: item.version,
                isPlugin: item.isPlugin, isBroken: item.isBroken, isRetired: item.isRetired,
            });
            if (r.success) installed++;
            done++;
        }

        // Rescan disk to get ground-truth installed state, then rebuild modList
        setStatus('Verifying…', '');
        try {
            state.installedFiles = await window.cvrma.scanInstalledMods(state.installDir);
        } catch { state.installedFiles = []; }

        saveCurrentToPreset();
        state.modList = buildModList(state.allMods);
        applyPreset(state.activePresetName);
        await savePresets();

        setProgress(1);
        setStatus(`Sync complete — ${installed} installed, ${removed} removed.`, 'ok');
        setTimeout(() => setProgress(0), 2500);

        checkDirty();
        refreshCardList();
        updateSyncBtn();
    }

    // ── Sync button label ──────────────────────────────────────────────────────
    function updateSyncBtn() {
        const btn = document.getElementById('btn-install');
        if (!btn) return;

        const toInstall   = state.modList.filter(m => !m.isUnmanaged && m.isSelected && !m.isBroken && !m.isRetired && !m.installedFile).length;
        const toUninstall = state.modList.filter(m => !m.isUnmanaged && !m.isSelected && m.installedFile).length;
        const pending     = toInstall + toUninstall;
        btn.disabled      = false;
        btn.dataset.inSync = pending === 0 ? '1' : '';

        const parts = [];
        if (toInstall   > 0) parts.push(`Install ${toInstall}`);
        if (toUninstall > 0) parts.push(`Remove ${toUninstall}`);

        const svgSync = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>`;
        if (parts.length) {
            btn.innerHTML = `${svgSync} ${parts.join(' · ')}`;
        } else {
            btn.innerHTML = `${svgSync} <span class="btn-label-sync">In Sync ✓</span><span class="btn-label-reinstall">Reinstall</span>`;
        }

        const countEl = document.getElementById('selected-count');
        if (countEl) {
            const sel = state.modList.filter(m => m.isSelected).length;
            countEl.textContent = sel > 0 ? `${sel} selected` : '';
            countEl.style.display = sel > 0 ? '' : 'none';
        }
    }

    // ── Category sidebar ───────────────────────────────────────────────────────
    function updateSidebarActive() {
        const scrollArea = document.getElementById('mods-scroll-area');
        const sidebar    = document.getElementById('cat-sidebar');
        if (!scrollArea || !sidebar) return;

        const areaRect  = scrollArea.getBoundingClientRect();
        const threshold = areaRect.top + scrollArea.clientHeight * 0.4;
        let activeId    = null;
        for (const anchor of scrollArea.querySelectorAll('.cat-anchor[id]')) {
            if (anchor.getBoundingClientRect().top <= threshold) activeId = anchor.id;
        }

        sidebar.querySelectorAll('.cat-sidebar-item').forEach(btn => {
            const isActive = btn.dataset.cat === activeId;
            btn.classList.toggle('active', isActive);
            if (isActive) btn.scrollIntoView({ block: 'nearest' });
        });
    }

    function renderCategorySidebar(list) {
        const sidebar    = document.getElementById('cat-sidebar');
        const scrollArea = document.getElementById('mods-scroll-area');
        if (!sidebar || !scrollArea) return;

        const seen = new Map();
        for (const item of list) {
            const k = item.category.name;
            if (!seen.has(k)) seen.set(k, item.category);
        }
        const sorted = [...seen.entries()].sort(([a], [b]) => {
            const ai = TAIL_CATS.indexOf(a), bi = TAIL_CATS.indexOf(b);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return 1; if (bi !== -1) return -1;
            return a.localeCompare(b);
        });

        sidebar.innerHTML = sorted.map(([name]) =>
            `<button class="cat-sidebar-item" data-cat="${catId(name)}">${escHtml(name)}</button>`
        ).join('');

        sidebar.querySelectorAll('.cat-sidebar-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = document.getElementById(btn.dataset.cat);
                if (!target) return;
                // target is a plain .cat-anchor div (not sticky), so getBoundingClientRect
                // always returns its true visual position — this formula is always correct.
                const areaRect   = scrollArea.getBoundingClientRect();
                const targetRect = target.getBoundingClientRect();
                scrollArea.scrollTop = scrollArea.scrollTop + targetRect.top - areaRect.top;
            });
        });

        if (!scrollArea._spyWired) {
            scrollArea._spyWired = true;
            scrollArea.addEventListener('scroll', updateSidebarActive, { passive: true });
        }
        updateSidebarActive();
    }

    // ── Card list ──────────────────────────────────────────────────────────────
    function refreshCardList() {
        const r = document.getElementById('mods-list-region');
        if (!r) return;
        const filtered = getFiltered();
        r.innerHTML = renderModList(filtered);
        renderCategorySidebar(filtered);
        bindCardEvents();
    }

    function bindCardEvents() {
        const region = document.getElementById('mods-list-region');
        if (!region) return;

        region.querySelectorAll('.mod-card-check').forEach(cb => {
            cb.addEventListener('change', e => {
                e.stopPropagation();
                const id = cb.dataset.id;
                const item = state.modList.find(m => String(m.id) === id);
                if (item) item.isSelected = cb.checked;
                saveCurrentToPreset();
                savePresets();
                checkDirty();
                refreshCardList();
                updateSyncBtn();
            });
        });

        region.querySelectorAll('.mod-card').forEach(card => {
            card.addEventListener('click', e => {
                if (e.target.closest('.mod-card-check-wrap')) return;
                const item = state.modList.find(m => String(m.id) === card.dataset.id);
                if (!item) return;
                if (state.activeFlyoutMod?.id === item.id) closeFlyout();
                else openFlyout(item);
            });
        });


    }

    // ── Status / progress ──────────────────────────────────────────────────────
    function setStatus(text, type = '') {
        const el = document.getElementById('status-text');
        if (!el) return;
        el.textContent = text;
        el.className   = type ? `status-${type}` : '';
    }

    function setProgress(val) {
        const b = document.getElementById('progress-bar');
        if (b) b.style.width = `${Math.round(val * 100)}%`;
    }

    // ── Page render ────────────────────────────────────────────────────────────
    function renderPage() {
        document.getElementById('page-content').innerHTML = `
            <div id="mods-scroll-area">
                ${!state.installDir ? `
                <div class="warn-banner">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    No ChilloutVR install directory detected. Go to <strong>Options</strong> to set it.
                </div>` : ''}
                <div id="mods-list-region">${renderSkeletons()}</div>
            </div>
            <nav id="cat-sidebar"></nav>
        `;
    }

    // ── Init ───────────────────────────────────────────────────────────────────
    async function init(installDir) {
        state.installDir      = installDir;
        state.filter          = '';
        state.activeFlyoutMod = null;

        await loadPresets();
        const savedSettings = await window.cvrma.loadSettings();
        state.hideBroken = savedSettings.hideBroken !== false; // default true
        renderPage();
        renderPresetBar();
        setStatus('Scanning installed mods…', '');

        if (installDir) {
            try { state.installedFiles = await window.cvrma.scanInstalledMods(installDir); }
            catch { state.installedFiles = []; }
        } else {
            state.installedFiles = [];
        }

        setStatus('Fetching mod list…', '');
        try {
            [state.allMods, state.flagMap] = await Promise.all([fetchMods(), fetchFlags()]);
        } catch (e) {
            setStatus(`Failed to load mods: ${e.message}`, 'err');
            document.getElementById('mods-list-region').innerHTML = `
                <div class="empty-state">
                    <p>⚠ Failed to load mod list. Check your internet connection.</p>
                    <p style="font-size:10px;color:var(--text-3)">${e.message}</p>
                </div>`;
            return;
        }

        state.modList = buildModList(state.allMods);

        // First-run: if preset is empty, capture defaults
        if ((state.presets[state.activePresetName] || []).length === 0) {
            saveCurrentToPreset();
            await savePresets();
        }

        checkDirty();
        refreshCardList();
        updateSyncBtn();
        setStatus(`Loaded ${state.modList.length} mods.`, 'ok');

        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.value   = '';
            searchInput.oninput = debounce(() => {
                state.filter = searchInput.value;
                closeFlyout();
                refreshCardList();
            }, 200);
        }

        const installBtn = document.getElementById('btn-install');
        if (installBtn) installBtn.onclick = syncMods;

        const refreshBtn = document.getElementById('btn-refresh');
        if (refreshBtn) refreshBtn.onclick = () => init(state.installDir);

    }

    // ── Util ───────────────────────────────────────────────────────────────────
    function escHtml(s) {
        if (!s) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function debounce(fn, d) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); }; }

    // Called by the options page after a wipe so the install button reflects reality
    // immediately, without requiring the user to navigate away and back.
    async function notifyModsWiped(installDir) {
        if (!state.allMods.length) return; // mods page was never loaded — init will handle it
        state.installDir = installDir;
        try {
            state.installedFiles = await window.cvrma.scanInstalledMods(installDir);
        } catch { state.installedFiles = []; }
        state.modList = buildModList(state.allMods);
        // Preserve selections from the active preset — do NOT wipe checkboxes
        applyPreset(state.activePresetName);
        checkDirty();
        refreshCardList();
        updateSyncBtn();
    }

    return { init, notifyModsWiped };
})();

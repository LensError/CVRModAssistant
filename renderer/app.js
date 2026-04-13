// ─────────────────────────────────────────────────────────────────────────────
// app.js — Main renderer orchestrator
// Handles startup flow, navigation, and app-level state
// ─────────────────────────────────────────────────────────────────────────────

window.App = (() => {
    let appState = {
        page: 'mods',
        installDir: null,
        storeType: null,
        appVersion: null,
        settings: {},
    };

    // ── Startup ───────────────────────────────────────────────────────────────
    async function start() {
        appState.settings = await window.cvrma.loadSettings();
        appState.appVersion = await window.cvrma.getAppVersion();

        // Wire titlebar window controls
        document.getElementById('btn-minimize').addEventListener('click', () => window.cvrma.minimize());
        document.getElementById('btn-maximize').addEventListener('click', () => window.cvrma.maximize());
        document.getElementById('btn-close').addEventListener('click', () => window.cvrma.close());

        window.cvrma.onStatusUpdate(data => {
            const el = document.getElementById('status-text');
            if (el) el.textContent = data.text;
            if (data.progress !== undefined) setProgress(data.progress);
        });

        if (!appState.settings.termsAccepted) {
            showIntro();
        } else {
            enterApp();
        }
    }

    // ── Intro flow ────────────────────────────────────────────────────────────
    function showIntro() {
        hideShell();
        window.IntroPage.render();
    }

    async function enterApp() {
        const detected = await window.cvrma.detectInstallDir();
        if (detected) {
            appState.installDir = detected.dir;
            appState.storeType = detected.store;
        }

        showShell();
        updateVersionDisplay();
        updateInstallDirLabel();
        navigateTo('mods');
    }

    function setInstallDir(dir, store) {
        appState.installDir = dir;
        appState.storeType = store;
        updateInstallDirLabel();
    }

    // ── Shell visibility ──────────────────────────────────────────────────────
    function hideShell() {
        const navRail = document.getElementById('nav-rail');
        const topbar = document.getElementById('topbar');
        const statusbar = document.getElementById('statusbar');
        if (navRail) navRail.style.display = 'none';
        if (topbar) topbar.style.display = 'none';
        if (statusbar) statusbar.style.display = 'none';
    }

    function showShell() {
        const navRail = document.getElementById('nav-rail');
        const topbar = document.getElementById('topbar');
        const statusbar = document.getElementById('statusbar');
        if (navRail) navRail.style.display = '';
        if (topbar) topbar.style.display = '';
        if (statusbar) statusbar.style.display = '';
    }

    // ── Navigation ────────────────────────────────────────────────────────────
    function navigateTo(page) {
        appState.page = page;

        // Update nav rail active state
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === page);
        });

        // Show/hide topbar (only on Mods page)
        const topbar = document.getElementById('topbar');
        if (topbar) {
            topbar.style.display = page === 'mods' ? '' : 'none';
        }

        // Hide preset bar when not on mods
        const presetBar = document.getElementById('preset-bar');
        if (presetBar) presetBar.style.display = page === 'mods' ? '' : 'none';

        const searchInput = document.getElementById('search-input');
        if (searchInput && page !== 'mods') searchInput.value = '';

        // Clear page content
        const content = document.getElementById('page-content');
        content.innerHTML = '';

        // Render target page
        switch (page) {
            case 'mods':
                window.ModsPage.init(appState.installDir);
                break;
            case 'options':
                window.OptionsPage.render(appState.installDir, appState.storeType);
                break;
            case 'about':
                window.AboutPage.render(appState.appVersion);
                break;
        }
    }

    // ── UI helpers ────────────────────────────────────────────────────────────
    function updateVersionDisplay() {
        const el = document.getElementById('app-version-nav');
        if (el) el.textContent = appState.appVersion || '—';
    }

    function updateInstallDirLabel() {
        const el = document.getElementById('install-dir-label');
        if (!el) return;
        if (appState.installDir) {
            el.textContent = appState.installDir;
            el.title = appState.installDir;
        } else {
            el.textContent = 'No install dir';
        }
    }

    function setProgress(val) {
        const bar = document.getElementById('progress-bar');
        if (!bar) return;
        bar.style.width = `${Math.round(val * 100)}%`;
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => navigateTo(btn.dataset.page));
        });
        start();
    });

    // ── Styled confirm dialog ─────────────────────────────────────────────────
    // Returns a Promise<boolean>. Use instead of the native confirm() everywhere.
    function showConfirm({ title, body, confirmLabel = 'Confirm', danger = false }) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = `
                <div class="confirm-dialog">
                    <div class="confirm-title">${escHtml(title)}</div>
                    ${body ? `<div class="confirm-body">${escHtml(body)}</div>` : ''}
                    <div class="confirm-actions">
                        <button class="btn-ghost" id="cd-cancel">Cancel</button>
                        <button class="${danger ? 'btn-danger' : 'btn-primary'}" id="cd-ok">${escHtml(confirmLabel)}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            requestAnimationFrame(() => overlay.querySelector('#cd-ok').focus());

            const done = v => { document.body.removeChild(overlay); resolve(v); };
            overlay.querySelector('#cd-ok').onclick     = () => done(true);
            overlay.querySelector('#cd-cancel').onclick = () => done(false);
            overlay.addEventListener('keydown', e => {
                if (e.key === 'Escape') done(false);
                if (e.key === 'Enter')  done(true);
            });
            overlay.onclick = e => { if (e.target === overlay) done(false); };
        });
    }

    function escHtml(s) {
        if (!s) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    return {
        enterApp,
        navigateTo,
        setInstallDir,
        confirm: showConfirm,
    };
})();

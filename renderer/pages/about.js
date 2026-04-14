window.AboutPage = (() => {
    const CREDITS = [
        {
            name: 'Nirv-git',
            url: 'https://github.com/Nirv-git',
            role: 'CVRMelonAssistant — the WPF app this is forked from',
            donateUrl: null,
        },
        {
            name: 'Umbranox',
            url: 'https://umbranox.carrd.co/',
            role: 'Inspiration — created the original Mod Manager',
            donateUrl: 'https://www.patreon.com/scoresaber',
        },
        {
            name: 'lolPants',
            url: 'https://www.jackbaron.com/',
            role: 'Inspiration — created ModSaber, the first Mod repository',
            donateUrl: 'https://www.paypal.me/jackbarondev',
        },
        {
            name: 'Megalon2D',
            url: 'https://github.com/megalon',
            role: 'BSMG theme & lots of fixes',
            donateUrl: 'https://ko-fi.com/megalon',
        },
    ];

    function render(version) {
        const content = document.getElementById('page-content');
        const creditsHtml = CREDITS.map(c => `
            <div class="credit-card">
                <a class="credit-name" href="#" data-ext="${escHtml(c.url)}">${escHtml(c.name)}</a>
                <span class="credit-role">${escHtml(c.role)}</span>
                ${c.donateUrl ? `<a href="#" data-ext="${escHtml(c.donateUrl)}" style="font-size:10px;color:var(--text-3);margin-top:2px;">Support ↗</a>` : ''}
            </div>
        `).join('');

        content.innerHTML = `
            <div class="about-page fade-in">
                <div class="about-hero">
                    <div class="about-hero-icon">
                        <img src="assets/icons/icon.svg" width="48" height="48" alt="CVR Mod Assistant Logo">
                    </div>
                    <div>
                        <div class="about-app-name">CVR Mod Assistant</div>
                        <div class="about-app-version mono">version ${escHtml(version || '—')}</div>
                        <div style="font-size:11px;color:var(--text-3);margin-top:6px;">
                            Community-made mod manager for ChilloutVR.
                            Not affiliated with the ChilloutVR Team.
                        </div>
                    </div>
                    <div style="margin-left:auto;display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
                        <a href="#" class="btn-ghost" data-ext="https://github.com/LensError/CVRModAssistant" style="display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:28px;text-decoration:none;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                            GitHub
                        </a>
                    </div>
                </div>

                <div>
                    <div class="about-section-title">About</div>
                    <div class="about-desc">
                        CVR Mod Assistant is a community-made mod manager for ChilloutVR.
                        It is a reimagined Electron rewrite, from
                        <a href="#" data-ext="https://github.com/Nirv-git/CVRMelonAssistant" style="color:var(--accent)">CVRMelonAssistant</a>
                        by Nirv-git, which itself descends from
                        <strong style="color:var(--text)">ModAssistant</strong> by Assistant.
                        Not affiliated with the ChilloutVR Team.
                    </div>
                </div>

                <div>
                    <div class="about-section-title">Special Thanks</div>
                    <div class="credits-grid">
                        ${creditsHtml}
                    </div>
                </div>

                <div>
                    <div class="about-section-title">Resources</div>
                    <div class="about-links">
                        <a href="#" class="btn-ghost" data-ext="https://api.cvrmg.com/v1/mods" style="display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:28px;text-decoration:none;">
                            CVRMG Mod API ↗
                        </a>
                        <a href="#" class="btn-ghost" data-ext="https://discord.gg/cvrmg" style="display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:28px;text-decoration:none;">
                            CVRMG Discord ↗
                        </a>
                        <a href="#" class="btn-ghost" data-ext="https://github.com/LavaGang/MelonLoader" style="display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:28px;text-decoration:none;">
                            MelonLoader ↗
                        </a>
                    </div>
                </div>

                <div>
                    <div class="about-section-title">Legal &amp; Disclaimer</div>
                    <div class="about-terms-container">
                        ${window.SharedData.TERMS_HTML}
                    </div>
                </div>
            </div>
        `;

        content.querySelectorAll('[data-ext]').forEach(el => {
            el.addEventListener('click', e => {
                e.preventDefault();
                window.cvrma.openDir(el.dataset.ext);
            });
        });
    }

    function escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    return { render };
})();

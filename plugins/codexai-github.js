'use strict';
 
const axios = require('axios');
const { fmt } = require('../lib/theme');
 
const GH_ORG = 'CodexAI';
 
// ── Hardcoded fallback repo list (used when GitHub API is rate-limited) ───────
const FALLBACK_REPOS = [
    { name: 'CODEX AI',     description: 'Multi-device WhatsApp bot with 1500+ commands',  lang: 'JavaScript', stars: 0, forks: 0, url: 'https://github.com/CodexAI/CODEX AI' },
    { name: 'codex-md-v4',      description: 'CODEX AI WhatsApp Bot v4 — gifted-baileys fork',  lang: 'JavaScript', stars: 0, forks: 0, url: 'https://github.com/CodexAI/codex-md-v4' },
    { name: 'codexai-web',    description: 'CodexAI website and documentation',              lang: 'HTML',       stars: 0, forks: 0, url: 'https://github.com/CodexAI/codexai-web' },
    { name: 'android-app-templete', description: 'Android app template by CodexAI',           lang: 'Java',       stars: 0, forks: 0, url: 'https://github.com/CodexAI/android-app-templete' },
];
 
// ── In-memory cache (5 minute TTL) ───────────────────────────────────────────
let _repoCache = null;
let _repoCacheTs = 0;
const CACHE_TTL = 5 * 60 * 1000;
 
function ghHeaders() {
    const h = { 'User-Agent': 'CODEX AI/2.0', 'Accept': 'application/vnd.github+json' };
    return h;
}
 
function fmtNum(n) {
    if (!n && n !== 0) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return String(n);
}
 
async function fetchRepos() {
    if (_repoCache && Date.now() - _repoCacheTs < CACHE_TTL) return _repoCache;
    try {
        const res = await axios.get(
            `https://api.github.com/users/${GH_ORG}/repos?sort=updated&per_page=30&type=owner`,
            { headers: ghHeaders(), timeout: 8000 }
        );
        _repoCache = res.data;
        _repoCacheTs = Date.now();
        return _repoCache;
    } catch {
        return null; // caller uses FALLBACK_REPOS
    }
}
 
const WRITE_DENY = /\b(create|new\s+repo|init|push|commit|delete|fork\s+to|transfer|rename|archive|publish|release\s+new|deploy|edit\s+file|update\s+file)\b/i;
 
module.exports = {
    commands:    ['ghrepo', 'ghrepos', 'ghfiles', 'svrepo'],
    category: 'downloader',
    description: 'Browse CodexAI GitHub repos — list, stats, read files, download zip (read-only)',
    usage:       '.codexai [repo] [file]  |  .codexai zip <repo>',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo, reply } = ctx;
        const rawInput = args.join(' ').trim();
 
        // ── Block write/mutate intent ────────────────────────────────────────
        if (WRITE_DENY.test(rawInput)) {
            return reply(fmt(
                `⛔ *Read-Only Access*\n\n` +
                `This command only reads from CodexAI GitHub.\n\n` +
                `*What you can do:*\n` +
                `• \`.codexai\` — list all repos\n` +
                `• \`.codexai <repo>\` — repo details\n` +
                `• \`.codexai <repo> <file>\` — read a file\n` +
                `• \`.codexai zip <repo>\` — download link\n\n` +
                `_Write, create, push, delete operations are not permitted._`
            ));
        }
 
        await sock.sendPresenceUpdate('composing', jid);
 
        // ── .codexai zip <repo> ────────────────────────────────────────────
        if (args[0]?.toLowerCase() === 'zip' && args[1]) {
            const repo = args[1];
            reply(fmt(
                `📦 *Download: ${GH_ORG}/${repo}*\n\n` +
                `*⬇️ Choose a branch:*\n` +
                `• Main: https://github.com/${GH_ORG}/${repo}/archive/refs/heads/main.zip\n` +
                `• Master: https://github.com/${GH_ORG}/${repo}/archive/refs/heads/master.zip\n\n` +
                `🔗 View: https://github.com/${GH_ORG}/${repo}\n\n` +
                `_Tap a link above to download the ZIP archive._`
            ));
            await sock.sendPresenceUpdate('paused', jid);
            return;
        }
 
        // ── .codexai <repo> <filepath> ─────────────────────────────────────
        if (args.length >= 2) {
            const repo     = args[0];
            const filePath = args.slice(1).join('/');
            await sock.sendMessage(jid, {
                text: fmt(`📄 _Fetching \`${filePath}\` from *${GH_ORG}/${repo}*..._`),
                contextInfo
            }, { quoted: message });
            try {
                const res = await axios.get(
                    `https://api.github.com/repos/${GH_ORG}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(filePath)}`,
                    { headers: ghHeaders(), timeout: 10000 }
                );
                const data = res.data;
 
                // Directory listing
                if (Array.isArray(data)) {
                    const listing = data.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`).join('\n');
                    return reply(fmt(`📁 *${GH_ORG}/${repo}/${filePath}*\n\n${listing || '_(empty)_'}`));
                }
 
                // File content
                if (data.encoding === 'base64' && data.content) {
                    const content = Buffer.from(data.content, 'base64').toString('utf8');
                    const preview = content.length > 3000
                        ? content.slice(0, 3000) + `\n\n_...truncated — full file: ${data.html_url}_`
                        : content;
                    return reply(fmt(
                        `📄 *${GH_ORG}/${repo}/${filePath}*\n` +
                        `📏 ${fmtNum(data.size)} bytes  ` +
                        `🔗 ${data.html_url}\n\n` +
                        `\`\`\`\n${preview}\n\`\`\``
                    ));
                }
 
                return reply(fmt(
                    `📄 *${GH_ORG}/${repo}/${filePath}*\n` +
                    `📏 ${fmtNum(data.size)} bytes\n` +
                    `🔗 ${data.html_url}\n` +
                    `⬇️ ${data.download_url || 'N/A'}`
                ));
            } catch (err) {
                if (err.response?.status === 404) {
                    return reply(fmt(`❌ Not found: \`${GH_ORG}/${repo}/${filePath}\`\n\n_Try \`.codexai ${repo}\` to browse available files._`));
                }
                return reply(fmt(`❌ Could not fetch file: ${err.message}`));
            }
        }
 
        // ── .codexai <repo> — repo details ─────────────────────────────────
        if (args.length === 1) {
            const repo = args[0];
            await sock.sendMessage(jid, {
                text: fmt(`🔍 _Loading *${GH_ORG}/${repo}*..._`),
                contextInfo
            }, { quoted: message });
            try {
                const [repoRes, langRes, contRes] = await Promise.allSettled([
                    axios.get(`https://api.github.com/repos/${GH_ORG}/${encodeURIComponent(repo)}`, { headers: ghHeaders(), timeout: 8000 }),
                    axios.get(`https://api.github.com/repos/${GH_ORG}/${encodeURIComponent(repo)}/languages`, { headers: ghHeaders(), timeout: 6000 }),
                    axios.get(`https://api.github.com/repos/${GH_ORG}/${encodeURIComponent(repo)}/contents`, { headers: ghHeaders(), timeout: 6000 }),
                ]);
 
                if (repoRes.status === 'rejected') {
                    if (repoRes.reason?.response?.status === 404)
                        return reply(fmt(`❌ Repo *${GH_ORG}/${repo}* not found.\n\nUse \`.codexai\` to list all repos.`));
                    throw repoRes.reason;
                }
 
                const r     = repoRes.value.data;
                const langs = langRes.status === 'fulfilled' ? Object.keys(langRes.value.data).slice(0, 5) : [];
                const files = contRes.status === 'fulfilled' && Array.isArray(contRes.value.data)
                    ? contRes.value.data.slice(0, 8).map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`).join('\n')
                    : '';
 
                const lines = [
                    `🐙 *${r.full_name}*`,
                    '',
                    r.description ? `📝 ${r.description}` : null,
                    '',
                    `*📊 Stats*`,
                    `• ⭐ Stars: *${fmtNum(r.stargazers_count)}*`,
                    `• 🍴 Forks: *${fmtNum(r.forks_count)}*`,
                    `• 👁️ Watchers: *${fmtNum(r.watchers_count)}*`,
                    `• 🐛 Issues: *${fmtNum(r.open_issues_count)}*`,
                    `• 🌿 Branch: *${r.default_branch}*`,
                    `• 📅 Created: *${new Date(r.created_at).toLocaleDateString('en-GB')}*`,
                    langs.length ? `• 💻 Languages: *${langs.join(', ')}*` : null,
                    r.license?.name ? `• 📜 License: *${r.license.name}*` : null,
                    '',
                    files ? `*📁 Root Files*\n${files}` : null,
                    '',
                    `*🔗 Links*`,
                    `• Repo: ${r.html_url}`,
                    `• ZIP: https://github.com/${GH_ORG}/${repo}/archive/refs/heads/${r.default_branch}.zip`,
                    '',
                    `_\`.codexai ${repo} README.md\` — read the README_`,
                    `_\`.codexai zip ${repo}\` — download links_`,
                ].filter(l => l !== null);
 
                return reply(fmt(lines.join('\n')));
            } catch (err) {
                return reply(fmt(`❌ Error: ${err.message}\n\nCheck the repo name with \`.codexai\``));
            }
        }
 
        // ── .codexai — list all repos ───────────────────────────────────────
        await sock.sendMessage(jid, {
            text: fmt(`🔍 _Loading CodexAI repos..._`),
            contextInfo
        }, { quoted: message });
 
        const repos = await fetchRepos();
        const usesFallback = !repos;
        const list = repos || FALLBACK_REPOS;
 
        const totalStars = repos ? repos.reduce((s, r) => s + (r.stargazers_count || 0), 0) : '—';
        const totalForks = repos ? repos.reduce((s, r) => s + (r.forks_count      || 0), 0) : '—';
 
        const lines = [
            `🐙 *CodexAI GitHub*`,
            `🔗 https://github.com/${GH_ORG}`,
            usesFallback ? `_⚠️ Live API unavailable — showing cached repos_` : '',
            '',
            `*📊 Overview*`,
            `• 📦 Repos: *${list.length}+*`,
            `• ⭐ Total Stars: *${fmtNum(totalStars)}*`,
            `• 🍴 Total Forks: *${fmtNum(totalForks)}*`,
            '',
            `*📦 Repositories*`,
        ];
 
        for (const r of list.slice(0, 12)) {
            const name  = r.name || r.full_name?.split('/')?.pop();
            const lang  = (r.language || r.lang)       ? ` · ${r.language || r.lang}` : '';
            const stars = (r.stargazers_count || r.stars) ? ` ⭐${fmtNum(r.stargazers_count || r.stars)}` : '';
            const forks = (r.forks_count       || r.forks) ? ` 🍴${fmtNum(r.forks_count || r.forks)}` : '';
            lines.push(`• *${name}*${lang}${stars}${forks}`);
            if (r.description) lines.push(`  _${r.description.slice(0, 80)}_`);
        }
 
        lines.push('');
        lines.push(`*💡 Commands*`);
        lines.push(`• \`.codexai <repo>\` — details & stats`);
        lines.push(`• \`.codexai <repo> <file>\` — read any file`);
        lines.push(`• \`.codexai zip <repo>\` — download link`);
        lines.push(`_Read-only · No writes allowed_`);
 
        const avatarUrl = `https://avatars.githubusercontent.com/${GH_ORG}`;
        try {
            await sock.sendMessage(jid, {
                image:      { url: avatarUrl },
                caption:    fmt(lines.filter(Boolean).join('\n')),
                contextInfo,
            }, { quoted: message });
        } catch {
            await reply(fmt(lines.filter(Boolean).join('\n')));
        }
 
        await sock.sendPresenceUpdate('paused', jid);
    }
};

'use strict';
 
const axios = require('axios');
const { fmt } = require('../../lib/theme');
 
const GH_ORG = 'CodexAI';
 
// â”€â”€ Hardcoded fallback repo list (used when GitHub API is rate-limited) â”€â”€â”€â”€â”€â”€â”€
const FALLBACK_REPOS = [
    { name: 'CODEX AI',     description: 'Multi-device WhatsApp bot with 1500+ commands',  lang: 'JavaScript', stars: 0, forks: 0, url: 'https://github.com/CodexAI/CODEX AI' },
    { name: 'codex-md-v4',      description: 'CODEX AI WhatsApp Bot v4 â€” gifted-baileys fork',  lang: 'JavaScript', stars: 0, forks: 0, url: 'https://github.com/CodexAI/codex-md-v4' },
    { name: 'codexai-web',    description: 'CodexAI website and documentation',              lang: 'HTML',       stars: 0, forks: 0, url: 'https://github.com/CodexAI/codexai-web' },
    { name: 'android-app-templete', description: 'Android app template by CodexAI',           lang: 'Java',       stars: 0, forks: 0, url: 'https://github.com/CodexAI/android-app-templete' },
];
 
// â”€â”€ In-memory cache (5 minute TTL) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    description: 'Browse CodexAI GitHub repos â€” list, stats, read files, download zip (read-only)',
    usage:       '.codexai [repo] [file]  |  .codexai zip <repo>',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo, reply } = ctx;
        const rawInput = args.join(' ').trim();
 
        // â”€â”€ Block write/mutate intent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (WRITE_DENY.test(rawInput)) {
            return reply(fmt(
                `â›” *Read-Only Access*\n\n` +
                `This command only reads from CodexAI GitHub.\n\n` +
                `*What you can do:*\n` +
                `â€¢ \`.codexai\` â€” list all repos\n` +
                `â€¢ \`.codexai <repo>\` â€” repo details\n` +
                `â€¢ \`.codexai <repo> <file>\` â€” read a file\n` +
                `â€¢ \`.codexai zip <repo>\` â€” download link\n\n` +
                `_Write, create, push, delete operations are not permitted._`
            ));
        }
 
        await sock.sendPresenceUpdate('composing', jid);
 
        // â”€â”€ .codexai zip <repo> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (args[0]?.toLowerCase() === 'zip' && args[1]) {
            const repo = args[1];
            reply(fmt(
                `ðŸ“¦ *Download: ${GH_ORG}/${repo}*\n\n` +
                `*â¬‡ï¸ Choose a branch:*\n` +
                `â€¢ Main: https://github.com/${GH_ORG}/${repo}/archive/refs/heads/main.zip\n` +
                `â€¢ Master: https://github.com/${GH_ORG}/${repo}/archive/refs/heads/master.zip\n\n` +
                `ðŸ”— View: https://github.com/${GH_ORG}/${repo}\n\n` +
                `_Tap a link above to download the ZIP archive._`
            ));
            await sock.sendPresenceUpdate('paused', jid);
            return;
        }
 
        // â”€â”€ .codexai <repo> <filepath> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (args.length >= 2) {
            const repo     = args[0];
            const filePath = args.slice(1).join('/');
            await sock.sendMessage(jid, {
                text: fmt(`ðŸ“„ _Fetching \`${filePath}\` from *${GH_ORG}/${repo}*..._`),
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
                    const listing = data.map(f => `${f.type === 'dir' ? 'ðŸ“' : 'ðŸ“„'} ${f.name}`).join('\n');
                    return reply(fmt(`ðŸ“ *${GH_ORG}/${repo}/${filePath}*\n\n${listing || '_(empty)_'}`));
                }
 
                // File content
                if (data.encoding === 'base64' && data.content) {
                    const content = Buffer.from(data.content, 'base64').toString('utf8');
                    const preview = content.length > 3000
                        ? content.slice(0, 3000) + `\n\n_...truncated â€” full file: ${data.html_url}_`
                        : content;
                    return reply(fmt(
                        `ðŸ“„ *${GH_ORG}/${repo}/${filePath}*\n` +
                        `ðŸ“ ${fmtNum(data.size)} bytes  ` +
                        `ðŸ”— ${data.html_url}\n\n` +
                        `\`\`\`\n${preview}\n\`\`\``
                    ));
                }
 
                return reply(fmt(
                    `ðŸ“„ *${GH_ORG}/${repo}/${filePath}*\n` +
                    `ðŸ“ ${fmtNum(data.size)} bytes\n` +
                    `ðŸ”— ${data.html_url}\n` +
                    `â¬‡ï¸ ${data.download_url || 'N/A'}`
                ));
            } catch (err) {
                if (err.response?.status === 404) {
                    return reply(fmt(`âŒ Not found: \`${GH_ORG}/${repo}/${filePath}\`\n\n_Try \`.codexai ${repo}\` to browse available files._`));
                }
                return reply(fmt(`âŒ Could not fetch file: ${err.message}`));
            }
        }
 
        // â”€â”€ .codexai <repo> â€” repo details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (args.length === 1) {
            const repo = args[0];
            await sock.sendMessage(jid, {
                text: fmt(`ðŸ” _Loading *${GH_ORG}/${repo}*..._`),
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
                        return reply(fmt(`âŒ Repo *${GH_ORG}/${repo}* not found.\n\nUse \`.codexai\` to list all repos.`));
                    throw repoRes.reason;
                }
 
                const r     = repoRes.value.data;
                const langs = langRes.status === 'fulfilled' ? Object.keys(langRes.value.data).slice(0, 5) : [];
                const files = contRes.status === 'fulfilled' && Array.isArray(contRes.value.data)
                    ? contRes.value.data.slice(0, 8).map(f => `${f.type === 'dir' ? 'ðŸ“' : 'ðŸ“„'} ${f.name}`).join('\n')
                    : '';
 
                const lines = [
                    `ðŸ™ *${r.full_name}*`,
                    '',
                    r.description ? `ðŸ“ ${r.description}` : null,
                    '',
                    `*ðŸ“Š Stats*`,
                    `â€¢ â­ Stars: *${fmtNum(r.stargazers_count)}*`,
                    `â€¢ ðŸ´ Forks: *${fmtNum(r.forks_count)}*`,
                    `â€¢ ðŸ‘ï¸ Watchers: *${fmtNum(r.watchers_count)}*`,
                    `â€¢ ðŸ› Issues: *${fmtNum(r.open_issues_count)}*`,
                    `â€¢ ðŸŒ¿ Branch: *${r.default_branch}*`,
                    `â€¢ ðŸ“… Created: *${new Date(r.created_at).toLocaleDateString('en-GB')}*`,
                    langs.length ? `â€¢ ðŸ’» Languages: *${langs.join(', ')}*` : null,
                    r.license?.name ? `â€¢ ðŸ“œ License: *${r.license.name}*` : null,
                    '',
                    files ? `*ðŸ“ Root Files*\n${files}` : null,
                    '',
                    `*ðŸ”— Links*`,
                    `â€¢ Repo: ${r.html_url}`,
                    `â€¢ ZIP: https://github.com/${GH_ORG}/${repo}/archive/refs/heads/${r.default_branch}.zip`,
                    '',
                    `_\`.codexai ${repo} README.md\` â€” read the README_`,
                    `_\`.codexai zip ${repo}\` â€” download links_`,
                ].filter(l => l !== null);
 
                return reply(fmt(lines.join('\n')));
            } catch (err) {
                return reply(fmt(`âŒ Error: ${err.message}\n\nCheck the repo name with \`.codexai\``));
            }
        }
 
        // â”€â”€ .codexai â€” list all repos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        await sock.sendMessage(jid, {
            text: fmt(`ðŸ” _Loading CodexAI repos..._`),
            contextInfo
        }, { quoted: message });
 
        const repos = await fetchRepos();
        const usesFallback = !repos;
        const list = repos || FALLBACK_REPOS;
 
        const totalStars = repos ? repos.reduce((s, r) => s + (r.stargazers_count || 0), 0) : 'â€”';
        const totalForks = repos ? repos.reduce((s, r) => s + (r.forks_count      || 0), 0) : 'â€”';
 
        const lines = [
            `ðŸ™ *CodexAI GitHub*`,
            `ðŸ”— https://github.com/${GH_ORG}`,
            usesFallback ? `_âš ï¸ Live API unavailable â€” showing cached repos_` : '',
            '',
            `*ðŸ“Š Overview*`,
            `â€¢ ðŸ“¦ Repos: *${list.length}+*`,
            `â€¢ â­ Total Stars: *${fmtNum(totalStars)}*`,
            `â€¢ ðŸ´ Total Forks: *${fmtNum(totalForks)}*`,
            '',
            `*ðŸ“¦ Repositories*`,
        ];
 
        for (const r of list.slice(0, 12)) {
            const name  = r.name || r.full_name?.split('/')?.pop();
            const lang  = (r.language || r.lang)       ? ` Â· ${r.language || r.lang}` : '';
            const stars = (r.stargazers_count || r.stars) ? ` â­${fmtNum(r.stargazers_count || r.stars)}` : '';
            const forks = (r.forks_count       || r.forks) ? ` ðŸ´${fmtNum(r.forks_count || r.forks)}` : '';
            lines.push(`â€¢ *${name}*${lang}${stars}${forks}`);
            if (r.description) lines.push(`  _${r.description.slice(0, 80)}_`);
        }
 
        lines.push('');
        lines.push(`*ðŸ’¡ Commands*`);
        lines.push(`â€¢ \`.codexai <repo>\` â€” details & stats`);
        lines.push(`â€¢ \`.codexai <repo> <file>\` â€” read any file`);
        lines.push(`â€¢ \`.codexai zip <repo>\` â€” download link`);
        lines.push(`_Read-only Â· No writes allowed_`);
 
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

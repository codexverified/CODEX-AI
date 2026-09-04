'use strict';
 
const { listThemes, setActiveTheme, getActiveTheme } = require('../../lib/theme');
 
module.exports = {
    commands:    ['theme', 'themes', 'settheme'],
    category: 'owner',
    description: 'List available themes or switch the bot theme at runtime',
    usage:       '.theme list  |  .theme set <name>  |  .theme info',
    permission:  'owner',
    group:       false,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
 
        const sub  = (args[0] || '').toLowerCase();
        const name = (args[1] || args[0] || '').toLowerCase();
 
        // â”€â”€ .theme / .themes / .theme list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (!sub || sub === 'list' || sub === 'themes') {
            const all     = listThemes();
            const current = (getActiveTheme()?.global?.botName) || 'CODEX AI';
            const lines   = all.map((t, i) => `  ${i + 1}. *${t}*`).join('\n');
            return sock.sendMessage(jid, {
                text: [
                    `ðŸŽ¨ *Bot Themes* (${all.length} available)`,
                    ``,
                    `*Active theme:* ${current}`,
                    ``,
                    lines,
                    ``,
                    `*Usage:* \`.theme set <name>\``,
                    `_Example:_ \`.theme set naruto\``,
                ].join('\n'),
                contextInfo
            }, { quoted: message });
        }
 
        // â”€â”€ .theme info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (sub === 'info') {
            const t = getActiveTheme();
            if (!t) return sock.sendMessage(jid, { text: 'âš ï¸ No theme loaded.', contextInfo }, { quoted: message });
            const g = t.global || {};
            return sock.sendMessage(jid, {
                image: { url: g.pic1 || '' },
                caption: [
                    `ðŸŽ¨ *Current Theme Info*`,
                    ``,
                    `*Name:* ${g.botName || 'â€”'}`,
                    `*Greeting:* ${g.greet || 'â€”'}`,
                    `*Body:* ${g.body || 'â€”'}`,
                    `*Footer:* ${g.footer || 'â€”'}`,
                    `*Wait msg:* ${g.wait || 'â€”'}`,
                ].join('\n'),
                contextInfo
            }, { quoted: message });
        }
 
        // â”€â”€ .theme set <name> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (sub === 'set' || sub === 'change' || sub === 'switch') {
            const target = (args[1] || '').toLowerCase().trim();
            if (!target) {
                return sock.sendMessage(jid, {
                    text: `Usage: \`.theme set <name>\`\n\nRun \`.theme list\` to see available themes.`,
                    contextInfo
                }, { quoted: message });
            }
            const ok = setActiveTheme(target);
            if (!ok) {
                const all = listThemes();
                return sock.sendMessage(jid, {
                    text: [
                        `âŒ Theme *${target}* not found.`,
                        ``,
                        `Available themes:`,
                        all.map((t, i) => `  ${i + 1}. ${t}`).join('\n'),
                    ].join('\n'),
                    contextInfo
                }, { quoted: message });
            }
            const g = getActiveTheme()?.global || {};
            return sock.sendMessage(jid, {
                image: { url: g.pic1 || '' },
                caption: [
                    `âœ… *Theme changed to: ${target}*`,
                    ``,
                    `*Bot name:*  ${g.botName || target}`,
                    `*Greeting:* ${g.greet || 'â€”'}`,
                    `*Body:*     ${g.body || 'â€”'}`,
                    ``,
                    `_Theme is active immediately â€” no restart needed._`,
                ].join('\n'),
                contextInfo
            }, { quoted: message });
        }
 
        // â”€â”€ Catch-all: treat the whole arg as a direct theme name â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const ok = setActiveTheme(sub);
        if (ok) {
            const g = getActiveTheme()?.global || {};
            return sock.sendMessage(jid, {
                image: { url: g.pic1 || '' },
                caption: `âœ… *Theme changed to: ${sub}*\n\n*Bot name:* ${g.botName || sub}`,
                contextInfo
            }, { quoted: message });
        }
 
        return sock.sendMessage(jid, {
            text: `â“ Unknown subcommand.\n\nUsage:\nâ€¢ \`.theme list\` â€” see all themes\nâ€¢ \`.theme set <name>\` â€” switch theme\nâ€¢ \`.theme info\` â€” view current theme`,
            contextInfo
        }, { quoted: message });
    }
};

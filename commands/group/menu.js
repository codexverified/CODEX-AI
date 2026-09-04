'use strict';
 
const fs      = require('fs');
const path    = require('path');
const config  = require('../../config');
const { getStr } = require('../../lib/theme');
const moment  = require('moment-timezone');
 
const WEBSITE = 'https://codexai.co.ke';
const TZ      = 'Africa/Nairobi';
 
// â”€â”€ Category definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Each has a numeric ID for `.menu 3` style read-more
const CATEGORIES = [
    { id: 1,  icon: 'â¬‡ï¸',  name: 'Downloaders',        cmds: ['yt','ytmp3','ytmp4','tiktok','instagram','facebook','spotify','soundcloud','capcut','apk','catbox','tourl','pinterest','reddit','twitter','threads','gdrive'] },
    { id: 2,  icon: 'ðŸŽµ',  name: 'Music & Audio',       cmds: ['play','shazam','lyrics','toaudio','bgm','addbgm','setbgm','clearbgm','transcribe','tts'] },
    { id: 3,  icon: 'ðŸ¤–',  name: 'AI & Intelligence',   cmds: ['ai','gpt4','gpt4o','gemini','bard','venice','openai','letmegpt','ask','codex','assistant','imagine','translate','define','calc','shorten','gitclone','anime','manga','describe','caption','carbon'] },
    { id: 4,  icon: 'ðŸ”',  name: 'Search & Info',       cmds: ['wiki','country','ip','currency','time','weather','numberfact','stalk','whois','dns','speedtest','ipinfo','screenshot','fetch','githubstalk'] },
    { id: 5,  icon: 'ðŸ–¼ï¸', name: 'Media & Stickers',    cmds: ['sticker','stickersearch','togif','tojpeg','emojimix','textsticker','qrcode','react','ocr','ascii','color','getpp','togstatus','statussave','captionimage','quotly','viewonce'] },
    { id: 6,  icon: 'ðŸ‘¥',  name: 'Group Management',    cmds: ['kick','promote','demote','ban','unban','banlist','tagall','hidetag','poll','multipoll','pollresult','lock','unlock','link','revoke','setname','setdesc','broadcast','purge','dmall','warn','mute','unmute','pin','unpin','edit','groupinfo','grouprules','groupstatus','setbio'] },
    { id: 7,  icon: 'ðŸ‘‹',  name: 'Welcome & Events',    cmds: ['welcome','goodbye','setwelcome','setgoodbye','welcomequiz','setquiz'] },
    { id: 8,  icon: 'ðŸ›¡ï¸', name: 'Protection',          cmds: ['antidemote','antidelete','antilink','anticall','antivv','antiscam','antibadwords','antibot','antifake','antiflood','antigm','antispam','afk','auditlog','blocklist','block','unblock','warn','warnlist','clearwarn'] },
    { id: 9,  icon: 'ðŸ˜„',  name: 'Fun & Entertainment', cmds: ['joke','fact','riddle','meme','quote','advice','compliment','flip','bible','pickup','roast','truth','dare','ship','pair','marry','divorce','slots','8ball'] },
    { id: 10, icon: 'ðŸ”§',  name: 'Text & Dev Tools',    cmds: ['reverse','upper','lower','mock','binary','rot13','json','timestamp','regex','httpcode','password','hash','encode','decode','wordcount','urlencode','urldecode','morse','base64','carbon','cron','chmod','ascii'] },
    { id: 11, icon: 'ðŸ“Š',  name: 'Leveling & Analytics',cmds: ['level','rank','xp','leaderboard','analytics','topusers','peakhours','presence'] },
    { id: 12, icon: 'ðŸ“°',  name: 'Channels',            cmds: ['newsletter','followchannel','unfollowchannel','channelinfo'] },
    { id: 13, icon: 'ðŸŽ®',  name: 'Games',               cmds: ['rps','hangman','ttt','trivia','slots','8ball','scramble','flagquiz','mathquiz','wordchain','emojiguess','numberguess','wordgame','capitalquiz','tictactoe','typerace','dailychallenge','challenge'] },
    { id: 14, icon: 'ðŸ’°',  name: 'Finance & Crypto',    cmds: ['crypto','loan','savings','tax','split','salary','discount','currency','budget','expense','balances','networth','inflation','invest','bitcoin'] },
    { id: 15, icon: 'ðŸ“š',  name: 'Education',           cmds: ['element','planet','zodiac','vocab','acronym','flag','nato','phrasebook','define','bible'] },
    { id: 16, icon: 'ðŸ“',  name: 'Productivity',        cmds: ['remind','rremind','myreminders','bookmark','save','saved','notes','addnote','todo','autoreply','awaymsg','schedule','timer','expense'] },
    { id: 17, icon: 'ðŸ’ª',  name: 'Health & Fitness',    cmds: ['workout','stretching','calories','water','sleep','meditation','steps','yoga','bmi'] },
    { id: 18, icon: 'ðŸ¤',  name: 'Lend & Sub-bot',      cmds: ['lend','approvelend','rejectlend','revokelend','lendlist','lendstatus','subbot','subbots','mybotinfo','getcode','paircode','getpair','sessioncode','connectbot'] },
    { id: 19, icon: 'ðŸ•µï¸', name: 'Stalk & Lookup',      cmds: ['stalk','devicecheck','whois','githubstalk','tiktokstalk','checkscam','virus','tempmail','dns','ipinfo'] },
    { id: 20, icon: 'â„¹ï¸', name: 'Bot Info',            cmds: ['alive','ping','uptime','owner','getjid','repo','menu','help','support','call','botinfo'] },
    { id: 21, icon: 'ðŸ‘‘',  name: 'Owner & Sudo',        cmds: ['sudo','setsudo','delsudo','getsudo','resetsudo','block','unblock','setmode','setprefix','setbotname','join','cmd','restart','shutdown','backupgroup','restoregroup','broadcast','eval','dmall','autojoin','cleanup','lendlimit'] },
];
 
// â”€â”€ Box drawing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function hline(n = 38) { return 'â”€'.repeat(n); }
 
function box(title, lines) {
    return `â•­â”€ã€Œ ${title} ã€\n${lines.map(l => `â”‚  ${l}`).join('\n')}\nâ•°${hline()}`;
}
 
// â”€â”€ Load all active plugins â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function loadPlugins() {
    const dir = path.join(__dirname);
    const out = [];
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
        try {
            const p = require(path.join(dir, f));
            if (Array.isArray(p.commands) && p.commands.length) out.push(p);
        } catch { }
    }
    return out;
}
 
// â”€â”€ Compact overview (`.menu`) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildCompactMenu(plugins, pfx, botName, mode) {
    const allCmds   = new Set(plugins.flatMap(p => p.commands || []));
    const modeEmoji = mode === 'PUBLIC' ? 'ðŸŸ¢' : mode === 'PRIVATE' ? 'ðŸ”’' : 'ðŸ”µ';
    const now       = moment().tz(TZ);
    let totalAssigned = 0;
 
    const header =
        `\nâ•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n` +
        `â•‘  âš¡  *${botName.toUpperCase().slice(0,26).padEnd(26)}*  âš¡  â•‘\n` +
        `â•‘   _The Ultimate WhatsApp Bot_    â•‘\n` +
        `â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n`;
 
    const statusBlock = box(`ðŸ“‹ Bot Status`, [
        `â—† *Bot:*      ${botName}`,
        `â—† *Prefix:*   \`${pfx}\``,
        `â—† *Mode:*     ${modeEmoji} ${mode}`,
        `â—† *Commands:* ${allCmds.size}`,
        `â—† *Date:*     ${now.format('ddd D MMM YYYY')}`,
        `â—† *Time:*     ${now.format('hh:mm A')} EAT`,
    ]);
 
    // Numbered category list with command counts
    const catLines = [];
    for (const cat of CATEGORIES) {
        const found = [...new Set(cat.cmds.filter(c => allCmds.has(c)))];
        if (!found.length) continue;
        totalAssigned += found.length;
        const num = String(cat.id).padStart(2, ' ');
        catLines.push(`â”‚  *${num}.* ${cat.icon}  ${cat.name.padEnd(22)} *(${found.length})*`);
    }
 
    const catBlock =
        `\nâ•­${hline()}\n` +
        `â”‚  ðŸ“‹ *COMMAND CATEGORIES*\n` +
        `â”‚  _(type \`.menu <number>\` for full list)_\n` +
        `â”œ${hline()}\n` +
        catLines.join('\n') +
        `\nâ•°${hline()}`;
 
    const footer =
        `\nâ•­â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â•®\n` +
        `â”‚  ðŸ“– *Read More Examples:*         â”‚\n` +
        `â”‚  \`${pfx}menu 3\`  â†’ AI & Intelligence â”‚\n` +
        `â”‚  \`${pfx}menu 6\`  â†’ Group Management  â”‚\n` +
        `â”‚  \`${pfx}menu 18\` â†’ Lend & Sub-bot    â”‚\n` +
        `â”‚  \`${pfx}help <cmd>\` â†’ Command help   â”‚\n` +
        `â•°â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â•¯\n` +
        `\n> ðŸŒ _${WEBSITE}_\n` +
        `> âš¡ _Made by CodexAI Â© ${now.year()}_`;
 
    return `${header}${statusBlock}\n${catBlock}\n${footer}`;
}
 
// â”€â”€ Category detail page (`.menu <id>`) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildCategoryMenu(cat, plugins, pfx) {
    const allCmds = new Set(plugins.flatMap(p => p.commands || []));
    const descMap = new Map(
        plugins.flatMap(p => (p.commands || []).map(c => [c, { desc: p.description || '', usage: p.usage || '', perm: p.permission || 'public' }]))
    );
    const found = [...new Set(cat.cmds.filter(c => allCmds.has(c)))];
    if (!found.length) return `âŒ No commands found in *${cat.name}*.`;
 
    const PERM_ICON = { owner: 'ðŸ‘‘', admin: 'âš™ï¸', public: 'ðŸŒ' };
    const lines = found.map(c => {
        const info    = descMap.get(c) || {};
        const pIcon   = PERM_ICON[(info.perm || 'public').toLowerCase()] || 'ðŸŒ';
        const shortD  = (info.desc || '').slice(0, 45);
        return `â”‚  ${pIcon} \`${pfx}${c}\`${shortD ? `\nâ”‚     _${shortD}_` : ''}`;
    });
 
    const header =
        `\n${cat.icon} *${cat.name.toUpperCase()}*\n` +
        `_${found.length} command${found.length !== 1 ? 's' : ''} available_\n`;
 
    const cmdBlock =
        `â•­${hline()}\n` +
        lines.join('\nâ”‚\n') +
        `\nâ•°${hline()}`;
 
    const footer =
        `\nâ•­â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â•®\n` +
        `â”‚ \`${pfx}help <cmd>\` for details â”‚\n` +
        `â”‚ \`${pfx}menu\` for overview      â”‚\n` +
        `â•°â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â”„â•¯\n` +
        `\n_ðŸŒ Public  âš™ï¸ Admin  ðŸ‘‘ Owner_`;
 
    return `${header}${cmdBlock}${footer}`;
}
 
// â”€â”€ Individual command help (`.help <cmd>`) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildCommandHelp(cmdName, plugins, pfx) {
    const plugin = plugins.find(p => (p.commands || []).includes(cmdName));
    if (!plugin) {
        return `âŒ Command \`${pfx}${cmdName}\` not found.\n\nUse \`${pfx}menu\` to browse all commands.`;
    }
    const aliases = (plugin.commands || []).filter(c => c !== cmdName);
    const perm    = (plugin.permission || 'public').toLowerCase();
    const permTag = perm === 'owner' ? 'ðŸ‘‘ Owner only' : perm === 'admin' ? 'âš™ï¸ Admin only' : 'ðŸŒ Public';
 
    return [
        ``,
        `ðŸ“– *Command Help*`,
        ``,
        box(`${pfx}${cmdName}`, [
            `â—† *Description:*`,
            `   ${plugin.description || 'No description available.'}`,
            ``,
            `â—† *Usage:*`,
            `   ${plugin.usage ? plugin.usage.replace(/\./g, pfx) : `\`${pfx}${cmdName}\``}`,
            ``,
            `â—† *Permission:*  ${permTag}`,
            `â—† *Group:*       ${plugin.group ? 'âœ… Yes' : 'âŒ No'}`,
            `â—† *Private:*     ${plugin.private !== false ? 'âœ… Yes' : 'âŒ No'}`,
            ...(aliases.length ? [`â—† *Aliases:*     ${aliases.map(a => `\`${pfx}${a}\``).join(' â€¢ ')}`] : []),
        ]),
        ``,
        `> _Use \`${pfx}menu\` to browse all commands_`
    ].join('\n');
}
 
// â”€â”€ Plugin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
module.exports = {
    commands:    ['menu', 'help', 'list', 'cmds', 'commands'],
    category: 'group',
    description: 'Show all commands in a categorized menu â€” use .menu <number> for a category deep-dive',
    usage:       '.menu | .menu <1-21> | .menu <category name> | .help <command>',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { prefix, contextInfo, safeSend } = ctx;
        const plugins = loadPlugins();
        const botName = getStr('botName') || config.BOT_NAME || 'CODEX AI';
        const mode    = (config.MODE || 'public').toUpperCase();
        const pfx     = prefix || '.';
        const imgUrl  = getStr('pic1') || config.ALIVE_IMG || 'https://files.catbox.moe/5uli5p.jpeg';
 
        const rawCmd = (
            message.message?.extendedTextMessage?.text ||
            message.message?.conversation || ''
        ).trim().split(/\s+/)[0].replace(/^[^\w]/, '').toLowerCase();
 
        // â”€â”€ .help <command> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (rawCmd === 'help' && args.length) {
            const cmdName = args[0].replace(/^\./, '').toLowerCase();
            return safeSend({ text: buildCommandHelp(cmdName, plugins, pfx), contextInfo }, { quoted: message });
        }
 
        // â”€â”€ .menu <id|name> â€” read-more for a specific category â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (args.length) {
            const query = args.join(' ').toLowerCase().trim();
 
            const byNum  = /^\d+$/.test(query) ? CATEGORIES.find(c => c.id === parseInt(query, 10)) : null;
            const byName = !byNum ? CATEGORIES.find(c => c.name.toLowerCase().includes(query)) : null;
            const cat    = byNum || byName;
 
            if (cat) {
                return safeSend({ text: buildCategoryMenu(cat, plugins, pfx), contextInfo }, { quoted: message });
            }
 
            const cmdName = query.replace(/^\./, '');
            const plugin  = plugins.find(p => (p.commands || []).includes(cmdName));
            if (plugin) {
                return safeSend({ text: buildCommandHelp(cmdName, plugins, pfx), contextInfo }, { quoted: message });
            }
 
            const examples = CATEGORIES.slice(0, 6).map(c => `  \`${pfx}menu ${c.id}\` â€” ${c.icon} ${c.name}`).join('\n');
            return safeSend({
                text: `âŒ *"${query}"* didn't match any category or command.\n\nðŸ“‹ *Try:*\n${examples}\n\nOr use \`${pfx}menu\` for the full overview.`,
                contextInfo
            }, { quoted: message });
        }
 
        // â”€â”€ .menu â€” compact overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const menuText = buildCompactMenu(plugins, pfx, botName, mode);
 
        // Try image + caption first, fall back to plain text
        try {
            await safeSend({ image: { url: imgUrl }, caption: menuText, contextInfo }, { quoted: message });
        } catch {
            await safeSend({ text: menuText, contextInfo }, { quoted: message });
        }
    }
};

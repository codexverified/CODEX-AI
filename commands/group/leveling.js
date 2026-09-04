'use strict';
 
const fs = require('fs');
const path = require('path');
const dataFile = path.join(__dirname, '..', 'data', 'levels.json');
 
function loadLevels() {
    try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch { return {}; }
}
function saveLevels(data) {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}
 
const levelData = loadLevels();
global.levelData = levelData;
 
const titles = [
    { level: 0, title: 'ðŸŒ± Seedling' },
    { level: 5, title: 'ðŸŒ¿ Sprout' },
    { level: 10, title: 'ðŸŒ³ Sapling' },
    { level: 15, title: 'â­ Rising Star' },
    { level: 20, title: 'ðŸŒŸ Star' },
    { level: 30, title: 'ðŸ’« Superstar' },
    { level: 40, title: 'ðŸ”¥ Fire' },
    { level: 50, title: 'ðŸ‘‘ Legend' },
    { level: 75, title: 'ðŸ† Champion' },
    { level: 100, title: 'ðŸ’Ž Diamond' },
];
 
function getTitle(level) {
    let t = titles[0].title;
    for (const entry of titles) {
        if (level >= entry.level) t = entry.title;
    }
    return t;
}
 
function xpForLevel(level) {
    return 100 + (level * 50);
}
 
function makeProgressBar(current, max, len = 10) {
    const filled = Math.round((current / max) * len);
    return 'â–ˆ'.repeat(filled) + 'â–‘'.repeat(len - filled);
}
 
let saveTimer = null;
global.addXP = function (jid, sender, amount = null) {
    if (!jid.endsWith('@g.us')) return null;
    const key = `${jid}:${sender}`;
    if (!levelData[key]) levelData[key] = { xp: 0, level: 0, messages: 0, lastXP: 0 };
    const user = levelData[key];
 
    const now = Date.now();
    if (now - user.lastXP < 30000) { user.messages++; return null; }
 
    const xpGain = amount || (Math.floor(Math.random() * 15) + 5);
    user.xp += xpGain;
    user.messages++;
    user.lastXP = now;
 
    const needed = xpForLevel(user.level);
    if (user.xp >= needed) {
        user.xp -= needed;
        user.level++;
        if (!saveTimer) { saveTimer = setTimeout(() => { saveLevels(levelData); saveTimer = null; }, 30000); }
        return { level: user.level, title: getTitle(user.level), sender };
    }
 
    if (!saveTimer) { saveTimer = setTimeout(() => { saveLevels(levelData); saveTimer = null; }, 60000); }
    return null;
};
 
module.exports = {
    commands: ['level', 'rank', 'xp', 'leaderboard', 'lb', 'levels'],
    category: 'group',
    description: 'XP leveling system â€” earn XP by chatting, unlock titles',
    usage: '.level | .leaderboard',
    permission: 'public',
    group: true,
    private: false,
 
    run: async (sock, message, args, ctx) => {
        const { jid, sender, contextInfo } = ctx;
        const rawCmd = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
 
        if (['leaderboard', 'lb', 'levels'].includes(rawCmd)) {
            const groupUsers = Object.entries(levelData)
                .filter(([key]) => key.startsWith(jid + ':'))
                .map(([key, data]) => ({ sender: key.split(':')[1], ...data }))
                .sort((a, b) => b.level - a.level || b.xp - a.xp)
                .slice(0, 15);
 
            if (!groupUsers.length) {
                return sock.sendMessage(jid, { text: 'ðŸ“Š No leveling data yet. Keep chatting!', contextInfo }, { quoted: message });
            }
 
            const list = groupUsers.map((u, i) => {
                const num = u.sender.split('@')[0];
                const title = getTitle(u.level);
                const medal = i === 0 ? 'ðŸ¥‡' : i === 1 ? 'ðŸ¥ˆ' : i === 2 ? 'ðŸ¥‰' : `${i + 1}.`;
                return `${medal} @${num}\n   Level ${u.level} ${title} â€¢ ${u.xp} XP â€¢ ${u.messages} msgs`;
            }).join('\n\n');
 
            const mentions = groupUsers.map(u => u.sender);
 
            return sock.sendMessage(jid, {
                text: `ðŸ† *Leaderboard*\n\n${list}`,
                mentions,
                contextInfo
            }, { quoted: message });
        }
 
        const key = `${jid}:${sender}`;
        const user = levelData[key] || { xp: 0, level: 0, messages: 0 };
        const needed = xpForLevel(user.level);
        const progress = makeProgressBar(user.xp, needed);
        const title = getTitle(user.level);
        const nextTitle = titles.find(t => t.level > user.level);
        const num = sender.split('@')[0];
 
        let text = `ðŸ“Š *Your Level*\n\n`;
        text += `ðŸ‘¤ @${num}\n`;
        text += `ðŸ… *Level:* ${user.level}\n`;
        text += `${title}\n\n`;
        text += `âœ¨ *XP:* ${user.xp}/${needed}\n`;
        text += `${progress}\n\n`;
        text += `ðŸ’¬ *Messages:* ${user.messages}\n`;
        if (nextTitle) text += `\nâ¬†ï¸ *Next title:* ${nextTitle.title} at level ${nextTitle.level}`;
 
        return sock.sendMessage(jid, {
            text,
            mentions: [sender],
            contextInfo
        }, { quoted: message });
    }
};

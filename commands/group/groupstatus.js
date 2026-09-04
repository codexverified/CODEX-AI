'use strict';
 
const fs   = require('fs');
const path = require('path');
 
// â”€â”€ In-memory stores (populated by codex.js event hooks) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// global.groupMsgMap   = Map<groupJid, Map<memberNum, count>>
// global.groupJoinLog  = Map<groupJid, [{action,num,name,ts}]>  (last 50 per group)
 
function getMsgMap(gid) {
    if (!global.groupMsgMap) global.groupMsgMap = new Map();
    if (!global.groupMsgMap.has(gid)) global.groupMsgMap.set(gid, new Map());
    return global.groupMsgMap.get(gid);
}
 
function getJoinLog(gid) {
    if (!global.groupJoinLog) global.groupJoinLog = new Map();
    if (!global.groupJoinLog.has(gid)) global.groupJoinLog.set(gid, []);
    return global.groupJoinLog.get(gid);
}
 
function pushJoinLog(gid, entry) {
    if (!global.groupJoinLog) global.groupJoinLog = new Map();
    if (!global.groupJoinLog.has(gid)) global.groupJoinLog.set(gid, []);
    const log = global.groupJoinLog.get(gid);
    log.unshift(entry);
    if (log.length > 50) log.length = 50;
}
global.pushGroupJoinLog = pushJoinLog;   // exported for codex.js
 
function fmtAge(creationUnix) {
    if (!creationUnix) return 'Unknown';
    const ms  = Date.now() - creationUnix * 1000;
    const d   = Math.floor(ms / 86400000);
    const mo  = Math.floor(d / 30);
    const yr  = Math.floor(d / 365);
    if (yr > 0)  return `${yr} year${yr > 1 ? 's' : ''}, ${mo % 12} month${mo % 12 !== 1 ? 's' : ''}`;
    if (mo > 0)  return `${mo} month${mo > 1 ? 's' : ''}, ${d % 30} day${d % 30 !== 1 ? 's' : ''}`;
    return `${d} day${d !== 1 ? 's' : ''}`;
}
 
function fmtDate(unixSec) {
    if (!unixSec) return 'Unknown';
    return new Date(unixSec * 1000).toLocaleString('en-US', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}
 
function fmtTs(ts) {
    const d = new Date(ts);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
 
function hline(n = 36) { return 'â”€'.repeat(n); }
function box(title, lines) {
    return `â•­â”€ã€Œ ${title} ã€\n${lines.map(l => `â”‚  ${l}`).join('\n')}\nâ•°${hline()}`;
}
 
module.exports = {
    commands:    ['groupstatus', 'ginfo', 'groupinfo', 'grpinfo', 'gstatus',
                  'adminlist', 'gadmins', 'groupstats', 'gstats',
                  'joinlog', 'gjoinlog', 'groupage', 'gage',
                  'exportgroup', 'gexport'],
    category: 'group',
    description: 'Detailed group info, admin list, activity stats, join/leave log, age and export',
    usage:       '.ginfo | .adminlist | .groupstats | .joinlog | .groupage | .exportgroup',
    permission:  'public',
    group:       true,
    private:     false,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo, isAdmin, isOwner } = ctx;
 
        const rawCmd = (
            message.message?.extendedTextMessage?.text ||
            message.message?.conversation || ''
        ).trim().split(/\s+/)[0].replace(/^[^\w]/, '').toLowerCase();
 
        // Fetch group metadata
        let meta;
        try {
            meta = ctx.groupMetadata || await sock.groupMetadata(jid);
        } catch {
            return sock.sendMessage(jid, { text: 'âŒ Could not fetch group info.', contextInfo }, { quoted: message });
        }
 
        const participants  = meta.participants || [];
        const admins        = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
        const superAdmins   = participants.filter(p => p.admin === 'superadmin');
        const members       = participants.filter(p => !p.admin);
        const ownerNum      = meta.owner?.split('@')[0] || superAdmins[0]?.id.split('@')[0] || 'Unknown';
 
        const announce  = meta.announce ? 'ðŸ”’ Admins only' : 'ðŸŒ All members';
        const restrict  = meta.restrict ? 'ðŸ”’ Admins only' : 'ðŸŒ All members';
        const joinApproval = meta.joinApprovalMode ? 'âœ… Required' : 'âŒ Off';
        const ephemeral = meta.ephemeral ? `â³ ${meta.ephemeral / 86400}d` : 'âŒ Off';
 
        // â”€â”€ .adminlist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (['adminlist', 'gadmins'].includes(rawCmd)) {
            if (!admins.length) return sock.sendMessage(jid, { text: 'â„¹ï¸ This group has no admins.', contextInfo }, { quoted: message });
 
            const superLines = superAdmins.map(p =>
                `â”‚  ðŸ‘‘ @${p.id.split('@')[0]}  _(Super Admin)_`
            );
            const adminLines = admins
                .filter(p => p.admin !== 'superadmin')
                .map(p => `â”‚  ðŸ›¡ï¸ @${p.id.split('@')[0]}`);
 
            const text =
                `â•­â”€ã€Œ ðŸ›¡ï¸ Admin List â€” ${meta.subject} ã€\n` +
                `â”‚  Total admins: *${admins.length}* of ${participants.length} members\n` +
                `â”œ${hline()}\n` +
                [...superLines, ...adminLines].join('\n') +
                `\nâ•°${hline()}`;
 
            return sock.sendMessage(jid, {
                text,
                mentions: admins.map(p => p.id || p.jid || p.phoneNumber).filter(Boolean),
                contextInfo
            }, { quoted: message });
        }
 
        // â”€â”€ .groupstats â€” activity leaderboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (['groupstats', 'gstats'].includes(rawCmd)) {
            const msgMap = getMsgMap(jid);
            if (!msgMap.size) {
                return sock.sendMessage(jid, {
                    text: `ðŸ“Š *Group Activity*\n\nNo message data collected yet.\n_Activity tracking starts from the moment the bot is active in this group._`,
                    contextInfo
                }, { quoted: message });
            }
 
            const sorted = [...msgMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
            const total  = [...msgMap.values()].reduce((s, n) => s + n, 0);
            const medals = ['ðŸ¥‡', 'ðŸ¥ˆ', 'ðŸ¥‰'];
 
            const lines = sorted.map(([num, count], i) => {
                const pct  = Math.round((count / total) * 100);
                const bar  = 'â–ˆ'.repeat(Math.round(pct / 5)) + 'â–‘'.repeat(20 - Math.round(pct / 5));
                const icon = medals[i] || `${i + 1}.`;
                return `â”‚  ${icon} @${num}\nâ”‚     ${bar} ${count} msgs (${pct}%)`;
            });
 
            const text =
                `â•­â”€ã€Œ ðŸ“Š Group Activity â€” ${meta.subject} ã€\n` +
                `â”‚  Total messages tracked: *${total}*\n` +
                `â”‚  Active members: *${msgMap.size}*\n` +
                `â”œ${hline()}\n` +
                lines.join('\nâ”‚\n') +
                `\nâ•°${hline()}\n` +
                `\n_Tracking since bot joined. Resets on restart._`;
 
            return sock.sendMessage(jid, {
                text,
                mentions: sorted.map(([num]) => `${num}@s.whatsapp.net`),
                contextInfo
            }, { quoted: message });
        }
 
        // â”€â”€ .joinlog â€” join/leave history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (['joinlog', 'gjoinlog'].includes(rawCmd)) {
            const log = getJoinLog(jid);
            if (!log.length) {
                return sock.sendMessage(jid, {
                    text: `ðŸ“‹ *Join/Leave Log*\n\nNo join or leave events recorded yet.\n_Events are tracked from when the bot is active._`,
                    contextInfo
                }, { quoted: message });
            }
 
            const limit = 20;
            const lines = log.slice(0, limit).map(e => {
                const icon = e.action === 'add' ? 'âž•' : e.action === 'remove' ? 'âŒ' : 'ðŸšª';
                const label = e.action === 'add' ? 'joined' : e.action === 'remove' ? 'was removed' : 'left';
                return `â”‚  ${icon} @${e.num} ${label}\nâ”‚     _${fmtTs(e.ts)}_`;
            });
 
            const text =
                `â•­â”€ã€Œ ðŸ“‹ Join/Leave Log â€” ${meta.subject} ã€\n` +
                `â”‚  Showing last ${Math.min(log.length, limit)} events\n` +
                `â”œ${hline()}\n` +
                lines.join('\nâ”‚\n') +
                `\nâ•°${hline()}`;
 
            return sock.sendMessage(jid, {
                text,
                mentions: log.slice(0, limit).map(e => `${e.num}@s.whatsapp.net`),
                contextInfo
            }, { quoted: message });
        }
 
        // â”€â”€ .groupage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (['groupage', 'gage'].includes(rawCmd)) {
            const createdAt = meta.creation ? fmtDate(meta.creation) : 'Unknown';
            const age       = fmtAge(meta.creation);
            const text = box(`ðŸ“… Group Age â€” ${meta.subject}`, [
                `â—† *Created:*  ${createdAt}`,
                `â—† *Age:*      ${age}`,
                `â—† *Members:*  ${participants.length}`,
                `â—† *Group JID:* \`${jid}\``,
            ]);
            return sock.sendMessage(jid, { text, contextInfo }, { quoted: message });
        }
 
        // â”€â”€ .exportgroup â€” send full info as text file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (['exportgroup', 'gexport'].includes(rawCmd)) {
            if (!isAdmin && !isOwner) {
                return sock.sendMessage(jid, { text: 'â›” Only admins can export group info.', contextInfo }, { quoted: message });
            }
 
            let inviteLink = '';
            try { inviteLink = `https://chat.whatsapp.com/${await sock.groupInviteCode(jid)}`; } catch { }
 
            const msgMap = getMsgMap(jid);
            const topSenders = [...msgMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
                .map(([num, c], i) => `  ${i + 1}. +${num} â€” ${c} messages`).join('\n');
 
            const adminList = admins.map(p =>
                `  ${p.admin === 'superadmin' ? '[SUPERADMIN]' : '[ADMIN]'} +${p.id.split('@')[0]}`
            ).join('\n');
 
            const memberList = members.map(p => `  +${p.id.split('@')[0]}`).join('\n');
 
            const content = [
                `â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`,
                ` GROUP EXPORT â€” ${meta.subject}`,
                `â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`,
                ``,
                `Group JID    : ${jid}`,
                `Owner        : +${ownerNum}`,
                `Created      : ${fmtDate(meta.creation)}`,
                `Age          : ${fmtAge(meta.creation)}`,
                ``,
                `Members      : ${participants.length}`,
                `  Super Admins: ${superAdmins.length}`,
                `  Admins      : ${admins.length - superAdmins.length}`,
                `  Regular     : ${members.length}`,
                ``,
                `Settings`,
                `  Messages    : ${announce}`,
                `  Edit Info   : ${restrict}`,
                `  Join Approval: ${joinApproval}`,
                `  Disappearing: ${ephemeral}`,
                ``,
                `Invite Link  : ${inviteLink || 'N/A (not admin)'}`,
                ``,
                `Description`,
                `  ${meta.desc ? meta.desc.trim().replace(/\n/g, '\n  ') : 'None'}`,
                ``,
                `â”€â”€â”€ Admins (${admins.length}) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`,
                adminList || '  None',
                ``,
                `â”€â”€â”€ Top Active Members â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`,
                topSenders || '  No data collected yet',
                ``,
                `â”€â”€â”€ All Members (${participants.length}) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`,
                memberList,
                ``,
                `Exported at: ${new Date().toLocaleString()}`,
                `Export by  : CODEX AI`,
            ].join('\n');
 
            const tmpPath = `/tmp/groupexport_${Date.now()}.txt`;
            fs.writeFileSync(tmpPath, content, 'utf8');
 
            try {
                await sock.sendMessage(jid, {
                    document: { url: `file://${tmpPath}` },
                    mimetype: 'text/plain',
                    fileName: `${(meta.subject || 'group').replace(/[^a-z0-9]/gi, '_')}_export.txt`,
                    caption:  `ðŸ“¤ *Group Export*\n${meta.subject}\n_${participants.length} members â€¢ ${admins.length} admins_`,
                    contextInfo
                }, { quoted: message });
            } finally {
                try { fs.unlinkSync(tmpPath); } catch { }
            }
            return;
        }
 
        // â”€â”€ .groupstatus / .ginfo â€” main overview (enhanced) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let inviteLink = '';
        try {
            const code = await sock.groupInviteCode(jid);
            inviteLink = `\nðŸ”— *Invite Link:* https://chat.whatsapp.com/${code}`;
        } catch { }
 
        const desc     = meta.desc ? `\nðŸ“„ *Description:*\n${meta.desc.trim()}` : '';
        const age      = fmtAge(meta.creation);
        const msgMap   = getMsgMap(jid);
        const joinLog  = getJoinLog(jid);
        const topSend  = [...msgMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([n, c], i) => ['ðŸ¥‡','ðŸ¥ˆ','ðŸ¥‰'][i] + ` @${n} (${c})`).join('  ');
 
        const lastEvent = joinLog[0]
            ? `${joinLog[0].action === 'add' ? 'âž•' : 'ðŸšª'} @${joinLog[0].num} â€” ${fmtTs(joinLog[0].ts)}`
            : 'None recorded';
 
        const text =
            `â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n` +
            `  ðŸ“Š *Group Status*\n` +
            `â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n` +
            `ðŸ·ï¸ *Name:* ${meta.subject || 'N/A'}\n` +
            `ðŸ†” *JID:* \`${jid}\`\n` +
            `ðŸ‘‘ *Owner:* @${ownerNum}\n` +
            `ðŸ“… *Created:* ${fmtDate(meta.creation)}\n` +
            `â³ *Age:* ${age}\n` +
            `${desc}\n` +
            `\nðŸ‘¥ *Members:* ${participants.length}\n` +
            `   â”œ ðŸ‘‘ Super Admins: ${superAdmins.length}\n` +
            `   â”œ ðŸ›¡ï¸ Admins: ${admins.length}\n` +
            `   â”” ðŸ‘¤ Members: ${members.length}\n` +
            `\nâš™ï¸ *Settings:*\n` +
            `   â”œ ðŸ’¬ Send Msgs: ${announce}\n` +
            `   â”œ âœï¸ Edit Info: ${restrict}\n` +
            `   â”œ ðŸ”‘ Join Approval: ${joinApproval}\n` +
            `   â”” â³ Disappearing: ${ephemeral}\n` +
            `\nðŸ“Š *Activity (session):*\n` +
            `   â”œ ðŸ“¨ Messages tracked: ${[...msgMap.values()].reduce((s,n)=>s+n,0)}\n` +
            `   â”œ ðŸ‘¤ Active members: ${msgMap.size}\n` +
            `   â”œ ðŸ† Top: ${topSend || 'No data yet'}\n` +
            `   â”” ðŸ“‹ Last event: ${lastEvent}\n` +
            `${inviteLink}\n\n` +
            `_Commands: \`.adminlist\` Â· \`.groupstats\` Â· \`.joinlog\` Â· \`.groupage\` Â· \`.exportgroup\`_`;
 
        const mentions = [meta.owner, ...superAdmins.map(p => p.id)].filter(Boolean);
 
        try {
            const pp = await sock.profilePictureUrl(jid, 'image');
            await sock.sendMessage(jid, { image: { url: pp }, caption: text, mentions, contextInfo }, { quoted: message });
        } catch {
            await sock.sendMessage(jid, { text, mentions, contextInfo }, { quoted: message });
        }
    }
};

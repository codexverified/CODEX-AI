'use strict';
 
const moment = require('moment-timezone');
const { getCountry, resolvePhoneJid } = require('../../lib/phone-utils');
 
const TZ = 'Africa/Nairobi';
 
// â”€â”€â”€ Presence helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Subscribes to presence for a JID and waits up to `timeoutMs` for the first
// presence.update event.  Returns { lastKnownPresence, lastSeen } or null.
function waitForPresence(sock, jid, timeoutMs = 6000) {
    return new Promise(resolve => {
        const bare = jid.split('@')[0] + '@s.whatsapp.net';
        let done = false;
 
        const cleanup = (result) => {
            if (done) return;
            done = true;
            sock.ev.off('presence.update', handler);
            clearTimeout(timer);
            resolve(result);
        };
 
        const handler = ({ id, presences }) => {
            // Presence events may carry the bare JID or device-suffixed variant
            const normId = id?.split('@')[0] + '@s.whatsapp.net';
            if (normId !== bare) return;
            const entry = presences[Object.keys(presences)[0]];
            cleanup(entry || null);
        };
 
        const timer = setTimeout(() => cleanup(null), timeoutMs);
 
        sock.ev.on('presence.update', handler);
        // Fire the subscribe after attaching the listener
        sock.presenceSubscribe(jid).catch(() => cleanup(null));
    });
}
 
// â”€â”€â”€ Plugin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
module.exports = {
    commands:    ['stalk', 'userinfo', 'lookup', 'wa'],
    category: 'search',
    description: 'Full profile card: picture, status, last seen, devices, country',
    usage:       '.stalk @user  |  reply a message  |  .stalk 2547XXXXXXXX',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, { sender, contextInfo, mentionedJid }) => {
 
        // â”€â”€ Resolve target â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let targetJid   = null;
        let lidNotCached = false;
 
        const ctxInfo   = message.message?.extendedTextMessage?.contextInfo;
        const rawQuoted = ctxInfo?.participant || ctxInfo?.remoteJid;
 
        if (rawQuoted) {
            targetJid = resolvePhoneJid(rawQuoted);
            if (!targetJid && rawQuoted.endsWith('@lid')) lidNotCached = true;
        }
        if (!targetJid && mentionedJid?.length) {
            targetJid = resolvePhoneJid(mentionedJid[0]);
        }
        if (!targetJid && args[0]) {
            const digits = args[0].replace(/\D/g, '');
            if (digits.length >= 7) targetJid = `${digits}@s.whatsapp.net`;
        }
        if (!targetJid) {
            const from = message.key.participant || message.key.remoteJid;
            targetJid  = resolvePhoneJid(from);
        }
 
        if (!targetJid) {
            return sock.sendMessage(sender, {
                text: lidNotCached
                    ? 'âš ï¸ That user\'s number isn\'t cached yet â€” ask them to send a message first, then retry.'
                    : 'âŒ Mention someone, reply to their message, or provide a phone number.',
                contextInfo
            }, { quoted: message });
        }
 
        const number = targetJid.split('@')[0];
 
        await sock.sendMessage(sender, {
            text: `ðŸ” Fetching profile for +${number}â€¦`,
            contextInfo
        }, { quoted: message });
 
        // â”€â”€ Fire all queries in parallel (presence runs concurrently) â”€â”€â”€â”€â”€â”€
        const [
            statusResult,
            bizResult,
            picResult,
            devResult,
            presenceResult,
        ] = await Promise.allSettled([
            sock.fetchStatus(targetJid),
            sock.getBusinessProfile(targetJid),
            sock.profilePictureUrl(targetJid, 'image', 6000),
            typeof sock.getUSyncDevices === 'function'
                ? sock.getUSyncDevices([targetJid], false, false)
                : Promise.resolve([]),
            waitForPresence(sock, targetJid, 6000),
        ]);
 
        // â”€â”€ Parse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const statusList  = statusResult.status  === 'fulfilled' ? (statusResult.value  || []) : [];
        const biz         = bizResult.status      === 'fulfilled' ? bizResult.value      : null;
        const picUrl      = picResult.status      === 'fulfilled' ? picResult.value      : null;
        const devJids     = devResult.status       === 'fulfilled' ? (devResult.value    || []) : [];
        const presence    = presenceResult.status  === 'fulfilled' ? presenceResult.value : null;
 
        // Status / about
        const statusEntry = statusList.find?.(e => e?.status)?.status;
        const statusText  = statusEntry?.status || null;
 
        // Push name
        const pushName = global.pushNameCache?.get(number)
                      || global.pushNameCache?.get(targetJid)
                      || null;
 
        // Country
        const country = getCountry(number);
 
        // Devices
        const companions = devJids.filter(d => d.device !== 0).length;
        let deviceLine;
        if (devJids.length === 0) {
            deviceLine = 'ðŸ“± Phone only (or data unavailable)';
        } else if (companions === 0) {
            deviceLine = 'ðŸ“± Phone only';
        } else {
            deviceLine = `ðŸ“± Phone + ${companions} companion${companions > 1 ? 's' : ''} (Web / Desktop)`;
        }
 
        // Account type
        const isBiz = !!(biz?.wid);
 
        // â”€â”€ Last seen / presence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let presenceLine;
        if (!presence) {
            presenceLine = 'ðŸ• Hidden / Privacy restricted';
        } else if (presence.lastKnownPresence === 'available') {
            presenceLine = 'ðŸŸ¢ Online right now';
        } else if (presence.lastSeen) {
            const ts  = moment.unix(presence.lastSeen).tz(TZ);
            const now = moment().tz(TZ);
            const diff = now.diff(ts, 'minutes');
            let ago;
            if (diff < 1)          ago = 'Just now';
            else if (diff < 60)    ago = `${diff}m ago`;
            else if (diff < 1440)  ago = `${Math.floor(diff / 60)}h ${diff % 60}m ago`;
            else                   ago = ts.format('D MMM YYYY, h:mm A');
            presenceLine = `ðŸ• Last seen: ${ago}`;
        } else {
            presenceLine = `âšª Offline (last seen hidden)`;
        }
 
        // â”€â”€ Business extras â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let bizBlock = '';
        if (biz?.wid) {
            const rows = [];
            if (biz.description) rows.push(`ðŸ“ *About:*    ${biz.description.slice(0, 100)}${biz.description.length > 100 ? 'â€¦' : ''}`);
            if (biz.email)        rows.push(`ðŸ“§ *Email:*    ${biz.email}`);
            if (biz.website?.[0]) rows.push(`ðŸŒ *Website:*  ${biz.website[0]}`);
            if (biz.address)      rows.push(`ðŸ“ *Address:*  ${biz.address}`);
            if (rows.length)      bizBlock = '\nâ”‚\nâ”‚ ' + rows.join('\nâ”‚ ');
        }
 
        // â”€â”€ Build card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const now        = moment().tz(TZ);
        const fetchedAt  = now.format('D MMM YYYY, h:mm A');
        const accountTag = isBiz ? 'ðŸ¢ WhatsApp Business' : 'ðŸ‘¤ Personal';
 
        const lines = [
            `â•­â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`,
            `â”‚ ðŸ”Ž *User Profile Card*`,
            `â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`,
            `â”‚ ðŸ“ž *Number:*    +${number}`,
        ];
        if (pushName)   lines.push(`â”‚ ðŸ‘¤ *Name:*      ${pushName}`);
        lines.push(
            `â”‚ ðŸŒ *Country:*   ${country}`,
            `â”‚ ðŸ·ï¸ *Account:*   ${accountTag}`,
            `â”‚ ${presenceLine}`,
            `â”‚ ðŸ’» *Devices:*   ${deviceLine}`,
        );
        if (statusText) lines.push(`â”‚ ðŸ’¬ *Status:*    "${statusText.slice(0, 90)}${statusText.length > 90 ? 'â€¦' : ''}"`);
        if (bizBlock)   lines.push(bizBlock);
        lines.push(
            `â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`,
            `â”‚ ðŸ•‘ _Fetched: ${fetchedAt}_`,
            `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`,
        );
 
        const caption = lines.join('\n');
 
        if (picUrl) {
            try {
                await sock.sendMessage(sender, {
                    image:   { url: picUrl },
                    caption,
                    contextInfo
                }, { quoted: message });
                return;
            } catch { /* fall through to text */ }
        }
 
        await sock.sendMessage(sender, { text: caption, contextInfo }, { quoted: message });
    }
};

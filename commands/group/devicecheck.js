'use strict';
 
const { getCountry, resolvePhoneJid } = require('../../lib/phone-utils');
 
function phoneNum(jid) {
    return jid ? jid.split('@')[0] : '?';
}
 
// â”€â”€â”€ Plugin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
module.exports = {
    commands:    ['device', 'devicecheck', 'checkdevice', 'wainfo'],
    category: 'group',
    description: 'Check WhatsApp account type, linked devices, status and more',
    usage:       '.device @user  |  reply a message  |  .device 2547XXXXXXXX',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, { sender, contextInfo, mentionedJid }) => {
 
        // â”€â”€ Resolve target JID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let targetJid   = null;
        let lidNotCached = false;
 
        const ctxInfo    = message.message?.extendedTextMessage?.contextInfo;
        const rawQuoted  = ctxInfo?.participant || ctxInfo?.remoteJid;
 
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
                    ? 'âš ï¸ That user\'s phone number isn\'t cached yet â€” ask them to send a message first, then retry.'
                    : 'âŒ Provide a number, mention someone, or reply to their message.',
                contextInfo
            }, { quoted: message });
        }
 
        const number = phoneNum(targetJid);
 
        await sock.sendMessage(sender, {
            text: `ðŸ” Fetching info for +${number}â€¦`,
            contextInfo
        }, { quoted: message });
 
        // â”€â”€ Parallel queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const [
            bizResult,
            devResult,
            statusResult,
            picResult,
        ] = await Promise.allSettled([
            sock.getBusinessProfile(targetJid),
            // getUSyncDevices is the same internal function used when sending messages
            typeof sock.getUSyncDevices === 'function'
                ? sock.getUSyncDevices([targetJid], false, false)
                : Promise.resolve([]),
            sock.fetchStatus(targetJid),
            sock.profilePictureUrl(targetJid, 'preview', 5000),
        ]);
 
        // â”€â”€ Parse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const biz      = bizResult.status    === 'fulfilled' ? bizResult.value    : null;
        const devJids  = devResult.status     === 'fulfilled' ? (devResult.value || []) : [];
        const statusL  = statusResult.status  === 'fulfilled' ? (statusResult.value || []) : [];
        const picUrl   = picResult.status     === 'fulfilled' ? picResult.value   : null;
 
        // Device count: devJids = [{user, device}, ...]
        // device 0 = primary phone, 1+ = companions
        const companions  = devJids.filter(d => d.device !== 0).length;
        const totalDev    = devJids.length; // includes the primary phone
 
        // Status text
        const statusEntry = statusL.find(e => e.status)?.status;
        const statusText  = statusEntry?.status || null;
 
        // Push name
        const pushName = global.pushNameCache?.get(number)
                      || global.pushNameCache?.get(targetJid)
                      || null;
 
        // Account type
        const isBiz = !!(biz?.wid);
 
        // â”€â”€ Build device line â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let deviceLine;
        if (totalDev === 0) {
            deviceLine = 'ðŸ“± Unknown (query returned no data)';
        } else if (companions === 0) {
            deviceLine = 'ðŸ“± Phone only';
        } else {
            deviceLine = `ðŸ“± Phone + ${companions} companion${companions > 1 ? 's' : ''} (Web/Desktop)`;
        }
 
        // â”€â”€ Account type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let accountLine, platformLine;
        if (biz?.wid) {
            accountLine  = 'ðŸ¢ WhatsApp Business';
            platformLine = 'ðŸ“² WhatsApp Business App';
        } else {
            accountLine  = 'ðŸ‘¤ Personal (WhatsApp)';
            platformLine = 'ðŸ“² WhatsApp (Android / iPhone)';
        }
 
        // â”€â”€ Country â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const country = getCountry(number);
 
        // â”€â”€ Business details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let bizBlock = '';
        if (biz?.wid) {
            const rows = [];
            if (biz.description) rows.push(`ðŸ“ *About:*    ${biz.description.slice(0, 100)}${biz.description.length > 100 ? 'â€¦' : ''}`);
            if (biz.email)        rows.push(`ðŸ“§ *Email:*    ${biz.email}`);
            if (biz.website?.[0]) rows.push(`ðŸŒ *Website:*  ${biz.website[0]}`);
            if (biz.address)      rows.push(`ðŸ“ *Address:*  ${biz.address}`);
            if (rows.length)      bizBlock = '\nâ”‚\nâ”‚ ' + rows.join('\nâ”‚ ');
        }
 
        // â”€â”€ Compose reply â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const lines = [
            `â•­â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`,
            `â”‚ ðŸ”Ž *WhatsApp Info*`,
            `â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`,
            `â”‚ ðŸ“ž *Number:*    +${number}`,
        ];
        if (pushName)    lines.push(`â”‚ ðŸ‘¤ *Name:*      ${pushName}`);
        lines.push(
            `â”‚ ðŸŒ *Country:*   ${country}`,
            `â”‚ ${accountLine.split(' ')[0]} *Account:*   ${accountLine.split(' ').slice(1).join(' ')}`,
            `â”‚ ðŸ“² *Platform:*  ${platformLine}`,
            `â”‚ ðŸ’» *Devices:*   ${deviceLine}`,
        );
        if (statusText)  lines.push(`â”‚ ðŸ’¬ *Status:*    ${statusText.slice(0, 80)}${statusText.length > 80 ? 'â€¦' : ''}`);
        lines.push(`â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`);
        lines.push('');
        lines.push('_â„¹ï¸ WhatsApp does not share exact OS (iOS/Android). Companion count = linked Web/Desktop sessions._');
 
        const text = lines.join('\n');
 
        if (picUrl) {
            try {
                await sock.sendMessage(sender, {
                    image:    { url: picUrl },
                    caption:  text,
                    contextInfo
                }, { quoted: message });
                return;
            } catch { /* fall through to text-only */ }
        }
 
        await sock.sendMessage(sender, { text, contextInfo }, { quoted: message });
    }
};

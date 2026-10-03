/**
 * .url — reply to a photo to get a public URL for it.
 *
 * Uses Catbox as the upload target so the image becomes a public URL.
 */
const axios    = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage, getContentType } = require('../../lib/baileys');

module.exports = {
    name: 'url',
    aliases: ['tourl', 'imgurl'],
    description: 'Reply to a photo to get a public URL for it',
    usage: '.url (reply to an image)',
    category: 'general',
    reactions: { start: '🔎' },

    async execute(bot, m, args) {
        const ctx       = m.msg?.contextInfo || m.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = ctx?.quotedMessage;

        let mediaMsg  = null;
        let mediaType = null;

        if (quotedMsg) {
            let resolved = quotedMsg;
            for (const vt of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
                if (quotedMsg[vt]) { resolved = quotedMsg[vt]?.message || quotedMsg[vt]; break; }
            }
            mediaType = getContentType(resolved);
            mediaMsg  = resolved?.[mediaType];
        } else if (m.type === 'imageMessage') {
            mediaType = m.type;
            mediaMsg  = m.msg;
        }

        if (!mediaMsg || mediaType !== 'imageMessage') {
            return await m.reply(`⚉ Reply to a photo with ${bot.prefix}url`);
        }

        try {
            const stream = await downloadContentFromMessage(mediaMsg, 'image');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);

            if (!buffer.length) return await m.reply('✘ Download failed. Try again.');

            const ext = (mediaMsg.mimetype || 'image/jpeg').split('/')[1] || 'jpg';
            const form = new FormData();
            form.append('fileToUpload', buffer, { filename: `image.${ext}` });

            const { data } = await axios.post('https://catbox.moe/user/api.php', form, {
                headers: form.getHeaders(),
                timeout: 30000,
            });

            const url = String(data || '').trim();
            if (!url.startsWith('http')) {
                return await m.reply('✘ Upload failed: ' + url.slice(0, 200));
            }

            await m.reply(`🔗 *URL:*\n${url}`);
        } catch (e) {
            console.error('url command error:', e);
            await m.reply('✘ Failed: ' + e.message);
        }
    }
};

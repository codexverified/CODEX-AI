'use strict';
 
const { getStr, fmt } = require('../../lib/theme');
const { dlBuffer }    = require('../../lib/dlmedia');
 
module.exports = {
    commands:    ['save', 'nitumie', 'statussave'],
    category: 'media',
    description: 'Save a WhatsApp status (reply to a status with this command)',
    permission:  'public',
    group:       false,
    private:     true,
 
    run: async (sock, message, args, { sender, contextInfo, reply }) => {
        try {
            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) {
                return reply(fmt('ðŸ“Œ *Reply to a status* to save it.\nExample: reply to a status image/video with `.save`'));
            }
 
            const isImage = !!quoted.imageMessage;
            const isVideo = !!quoted.videoMessage;
 
            if (!isImage && !isVideo) {
                return reply(fmt('âŒ Only *image* and *video* statuses can be saved.'));
            }
 
            const mediaType  = isImage ? 'image' : 'video';
            const msgContent = isImage ? quoted.imageMessage : quoted.videoMessage;
 
            await sock.sendPresenceUpdate('composing', sender);
 
            const buffer = await dlBuffer(msgContent, mediaType);
 
            const caption = msgContent.caption
                || `ðŸ“¥ *Status saved by ${getStr('botName') || 'CODEX AI'}*`;
 
            await sock.sendMessage(sender, {
                [mediaType]: buffer,
                caption,
                contextInfo: {
                    ...contextInfo,
                    externalAdReply: {
                        title:        'Status Saved âœ…',
                        body:         (getStr('botName') || 'CODEX AI') + ' Â· Status Downloader',
                        thumbnailUrl: getStr('pic1') || 'https://files.catbox.moe/5uli5p.jpeg',
                        mediaType:    1
                    }
                }
            }, { quoted: message });
 
            await sock.sendPresenceUpdate('paused', sender);
 
        } catch (err) {
            console.error('[StatusSave]', err.message);
            await reply(fmt(`âŒ Failed to save status: ${err.message}`));
        }
    }
};

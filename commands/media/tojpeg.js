'use strict';
const { downloadContentFromMessage } = require('../../lib/baileys');
 
module.exports = {
    commands:    ['tojpeg', 'toimg', 'stickertoimg', 'unwebp'],
    category: 'media',
    description: 'Convert sticker to JPEG image',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        const ctx        = message.message?.extendedTextMessage?.contextInfo;
        const quoted     = ctx?.quotedMessage;
        const stickerMsg = quoted?.stickerMessage || message.message?.stickerMessage;
        if (!stickerMsg) {
            return sock.sendMessage(sender, {
                text: 'ðŸ–¼ï¸ Reply to a sticker with .tojpeg to convert it.',
                contextInfo
            }, { quoted: message });
        }
        try {
            const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
            let buf = Buffer.from([]);
            for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
            await sock.sendMessage(sender, {
                image:    buf,
                mimetype: 'image/webp',
                caption:  'ðŸ–¼ï¸ *Sticker converted to image*\n_Powered by CODEX AI_',
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(sender, { text: `âŒ Conversion failed: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};

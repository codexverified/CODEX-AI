'use strict';
const axios = require('axios');
 
module.exports = {
    commands:    ['emojimix', 'mixemoji', 'emojiblend'],
    category: 'group',
    description: 'Mix two emojis together using Google Kitchen',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, groupId, contextInfo }) => {
        const chatId = groupId || sender;
        const parts  = args.join(' ').split(/\s+/);
        const e1     = parts[0];
        const e2     = parts[1];
        if (!e1 || !e2) {
            return sock.sendMessage(chatId, {
                text: 'ðŸŽ¨ Usage: .emojimix <emoji1> <emoji2>\nExample: .emojimix ðŸ˜‚ ðŸ”¥',
                contextInfo
            }, { quoted: message });
        }
        try {
            const cp1 = [...e1][0].codePointAt(0).toString(16).toLowerCase();
            const cp2 = [...e2][0].codePointAt(0).toString(16).toLowerCase();
            const url = `https://www.gstatic.com/android/keyboard/emojikitchen/20201001/u${cp1}/u${cp1}_u${cp2}.png`;
            const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
            await sock.sendMessage(chatId, {
                image:   Buffer.from(data),
                caption: `ðŸŽ¨ *Emoji Mix: ${e1} + ${e2}*\n_Powered by CODEX AI_`,
                contextInfo
            }, { quoted: message });
        } catch {
            await sock.sendMessage(chatId, {
                text: `âŒ This emoji combination is not available.\nTry other emojis like: ðŸ˜‚ ðŸ”¥, ðŸ± ðŸŒˆ, ðŸŽƒ ðŸ‘»`,
                contextInfo
            }, { quoted: message });
        }
    }
};

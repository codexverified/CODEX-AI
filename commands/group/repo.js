'use strict';
 
const axios  = require('axios');
const moment = require('moment-timezone');
 
const REPO_URL    = 'https://github.com/CodexAI/CODEX AI';
const WEBSITE_URL = 'https://codexai.co.ke';
const WA_CHANNEL  = 'https://whatsapp.com/channel/0029VaksrRh6GcGnT0J05n0j';
const SUPPORT_URL = 'https://chat.whatsapp.com/GzCZZxVnAHMINWdPQkGwJR';
 
module.exports = {
    commands:    ['repo', 'repository', 'github'],
    category: 'group',
    description: 'Show CODEX AI repository info',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { contextInfo } = ctx;
        const jid = message.key.remoteJid;
 
        let data = null;
        try {
            const res = await axios.get(
                'https://api.github.com/repos/CodexAI/CODEX AI',
                { timeout: 10000 }
            );
            data = res.data;
        } catch { /* use fallback */ }
 
        const caption = data
            ? `*âœ¨ CODEX AI â€” REPOSITORY INFO*\n\n` +
              `ðŸ“¦ *Repo:* ${data.name}\n` +
              `ðŸ“ *About:* ${data.description || 'WhatsApp MD Bot'}\n\n` +
              `â­ *Stars:* ${data.stargazers_count.toLocaleString()}\n` +
              `ðŸ´ *Forks:* ${data.forks_count.toLocaleString()}\n` +
              `ðŸ’» *Language:* ${data.language || 'JavaScript'}\n` +
              `ðŸ“¦ *Size:* ${(data.size / 1024).toFixed(1)} MB\n` +
              `ðŸ“œ *License:* ${data.license?.name || 'MIT'}\n` +
              `âš ï¸ *Open Issues:* ${data.open_issues}\n` +
              `ðŸ•’ *Updated:* ${moment(data.updated_at).fromNow()}\n\n` +
              `ðŸ”— *GitHub:* ${REPO_URL}\n` +
              `ðŸŒ *Website:* ${WEBSITE_URL}\n` +
              `ðŸ“¢ *Newsletter:* ${WA_CHANNEL}\n` +
              `ðŸ’¬ *Support:* ${SUPPORT_URL}\n\n` +
              `âš¡ _Powered by Codex Tech Inc_`
            : `*âœ¨ CODEX AI â€” REPOSITORY*\n\n` +
              `ðŸ“¦ *Repo:* CODEX AI\n` +
              `ðŸ’» *Language:* JavaScript\n` +
              `ðŸ“œ *License:* MIT\n\n` +
              `ðŸ”— *GitHub:* ${REPO_URL}\n` +
              `ðŸŒ *Website:* ${WEBSITE_URL}\n` +
              `ðŸ“¢ *Newsletter:* ${WA_CHANNEL}\n` +
              `ðŸ’¬ *Support:* ${SUPPORT_URL}\n\n` +
              `âš¡ _Powered by Codex Tech Inc_`;
 
        const imgUrl = 'https://files.catbox.moe/5uli5p.jpeg';
 
        await sock.sendMessage(jid, {
            image:   { url: imgUrl },
            caption,
            contextInfo: {
                ...contextInfo,
                externalAdReply: {
                    title:                 'CODEX AI â€” Open Source Bot',
                    body:                  'Star us on GitHub!',
                    thumbnailUrl:          imgUrl,
                    sourceUrl:             REPO_URL,
                    mediaType:             1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: message });
    }
};

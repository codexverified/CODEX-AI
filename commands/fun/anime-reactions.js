'use strict';
 
const axios = require('axios');
 
// waifu.pics SFW reaction endpoints
const REACTIONS = {
    hug:    'hug',
    kiss:   'kiss',
    pat:    'pat',
    slap:   'slap',
    poke:   'poke',
    bite:   'bite',
    bonk:   'bonk',
    cuddle: 'cuddle',
    wave:   'wave',
    blush:  'blush',
    smile:  'smile',
    cry:    'cry',
    laugh:  'laugh',
    dance:  'dance',
    wink:   'wink',
    shoot:  'shoot',
    kick:   'kick',
    happy:  'happy',
    baka:   'baka',
    nod:    'nod',
};
 
const REACTION_MESSAGES = {
    hug:    (sender, target) => target ? `ðŸ¤— *${sender}* hugs *${target}*!` : `ðŸ¤— *${sender}* wants a hug!`,
    kiss:   (sender, target) => target ? `ðŸ˜˜ *${sender}* kisses *${target}*!` : `ðŸ˜˜ *${sender}* blows a kiss!`,
    pat:    (sender, target) => target ? `ðŸ˜Š *${sender}* pats *${target}*!` : `ðŸ˜Š *${sender}* pats the air!`,
    slap:   (sender, target) => target ? `ðŸ‘‹ *${sender}* slaps *${target}*!` : `ðŸ‘‹ *${sender}* slaps the air!`,
    poke:   (sender, target) => target ? `ðŸ‘‰ *${sender}* pokes *${target}*!` : `ðŸ‘‰ *${sender}* pokes around!`,
    bite:   (sender, target) => target ? `ðŸ˜¬ *${sender}* bites *${target}*!` : `ðŸ˜¬ *${sender}* bites the air!`,
    bonk:   (sender, target) => target ? `ðŸ”¨ *${sender}* bonks *${target}*! Go to horny jail!` : `ðŸ”¨ *${sender}* bonks!`,
    cuddle: (sender, target) => target ? `ðŸ¥° *${sender}* cuddles with *${target}*!` : `ðŸ¥° *${sender}* wants cuddles!`,
    wave:   (sender, target) => target ? `ðŸ‘‹ *${sender}* waves at *${target}*!` : `ðŸ‘‹ *${sender}* waves hello!`,
    blush:  (sender, _)      => `ðŸ˜³ *${sender}* is blushing!`,
    smile:  (sender, _)      => `ðŸ˜Š *${sender}* smiles!`,
    cry:    (sender, _)      => `ðŸ˜¢ *${sender}* is crying!`,
    laugh:  (sender, _)      => `ðŸ˜‚ *${sender}* is laughing!`,
    dance:  (sender, _)      => `ðŸ’ƒ *${sender}* is dancing!`,
    wink:   (sender, target) => target ? `ðŸ˜‰ *${sender}* winks at *${target}*!` : `ðŸ˜‰ *${sender}* winks!`,
    shoot:  (sender, target) => target ? `ðŸ”« *${sender}* shoots *${target}*!` : `ðŸ”« *${sender}* shoots!`,
    kick:   (sender, target) => target ? `ðŸ¦µ *${sender}* kicks *${target}*!` : `ðŸ¦µ *${sender}* kicks!`,
    happy:  (sender, _)      => `ðŸŽ‰ *${sender}* is happy!`,
    baka:   (sender, target) => target ? `ðŸ˜¤ *${sender}* calls *${target}* a baka!` : `ðŸ˜¤ Baka!`,
    nod:    (sender, _)      => `ðŸ™‚ *${sender}* nods!`,
};
 
async function fetchReactionGif(type) {
    const resp = await axios.get(`https://api.waifu.pics/sfw/${type}`, { timeout: 10000 });
    return resp.data?.url;
}
 
module.exports = {
    commands:   Object.keys(REACTIONS),
    category:   'fun',
    description: 'Anime reaction GIFs â€” hug, kiss, pat, slap, poke, bite, bonk, cuddle, wave, blush, smile, cry, laugh, dance, wink, shoot, kick, happy, baka, nod',
    usage:      '.hug @user | .kiss @user | .pat | .cry',
    permission: 'public',
    group:      true,
    private:    true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo, sender } = ctx;
 
        const rawCmd = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
 
        const type = REACTIONS[rawCmd];
        if (!type) return;
 
        // Resolve sender display name
        const senderName = ctx.pushName || sender?.split('@')[0] || 'Someone';
 
        // Resolve mentioned target name
        const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        let targetName = null;
        if (mentionedJid) {
            try {
                const meta = await sock.groupMetadata(jid).catch(() => null);
                const participant = meta?.participants?.find(p => p.id === mentionedJid);
                targetName = participant?.notify || participant?.name || mentionedJid.split('@')[0];
            } catch {
                targetName = mentionedJid.split('@')[0];
            }
        } else if (args.length > 0 && !args[0].startsWith('@')) {
            targetName = args.join(' ');
        }
 
        const caption = (REACTION_MESSAGES[rawCmd] || ((s, t) => `${s} ${rawCmd}s${t ? ` ${t}` : ''}!`))(senderName, targetName);
 
        try {
            await sock.sendPresenceUpdate('composing', jid);
            const gifUrl = await fetchReactionGif(type);
 
            if (gifUrl) {
                const imgResp = await axios.get(gifUrl, { responseType: 'arraybuffer', timeout: 15000 });
                await sock.sendMessage(jid, {
                    video:    Buffer.from(imgResp.data),
                    caption,
                    gifPlayback: true,
                    contextInfo
                }, { quoted: message });
            } else {
                await sock.sendMessage(jid, { text: caption, contextInfo }, { quoted: message });
            }
        } catch (e) {
            await sock.sendMessage(jid, { text: caption, contextInfo }, { quoted: message });
        }
    }
};

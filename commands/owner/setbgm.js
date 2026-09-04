'use strict';
 
/**
 * Word-triggered audio autoresponder ("BGM Triggers")
 *
 * Owner commands:
 *   .setbgm <word>     â€” reply to an audio/voice note to register it as the trigger audio
 *   .delbgm <word>     â€” remove a trigger word
 *   .listbgm           â€” list all active trigger words
 *   .clearbgm          â€” remove ALL trigger words
 *
 * Behaviour:
 *   When anyone sends a message containing a registered trigger word,
 *   the bot automatically replies with the saved audio for that word.
 *   Cooldown: one reply per chat per word every 30 seconds (anti-spam).
 */
 
const { fmt }        = require('../../lib/theme');
const { setTrigger, delTrigger, listTriggers, matchTrigger } = require('../../lib/bgmTrigger');
const baileys        = require('../../lib/baileys');
 
// â”€â”€â”€ Per-chat cooldown tracker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Key: `${jid}:${word}` â†’ timestamp of last send
const cooldowns = new Map();
const COOLDOWN_MS = 30_000; // 30 seconds
 
function onCooldown(jid, word) {
    const key  = `${jid}:${word}`;
    const last = cooldowns.get(key) || 0;
    if (Date.now() - last < COOLDOWN_MS) return true;
    cooldowns.set(key, Date.now());
    return false;
}
 
// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 
/** Extract the audio message object from a quoted message (reply context). */
function extractQuotedAudio(message) {
    const ctxInfo = message.message?.extendedTextMessage?.contextInfo;
    const quoted  = ctxInfo?.quotedMessage;
    if (!quoted) return null;
    if (quoted.audioMessage) {
        const mimetype = quoted.audioMessage.mimetype || 'audio/mp4';
        return { msg: quoted, type: 'audio', mimetype };
    }
    return null;
}
 
/** Build a proper message object from a quoted payload so Baileys can download it. */
function buildMsgObj(originalMessage, quotedContent) {
    const ctxInfo = originalMessage.message?.extendedTextMessage?.contextInfo;
    return {
        key: {
            remoteJid:   originalMessage.key.remoteJid,
            fromMe:      ctxInfo?.participant
                ? ctxInfo.participant === (originalMessage.key.participant || originalMessage.key.remoteJid)
                : false,
            id:          ctxInfo?.stanzaId || originalMessage.key.id,
            participant: ctxInfo?.participant,
        },
        message: quotedContent,
    };
}
 
// â”€â”€â”€ Plugin export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
module.exports = {
    commands:    ['setbgm', 'delbgm', 'listbgm', 'clearbgm', 'bgmlist', 'removebgm'],
    category: 'owner',
    description: 'Word-triggered audio autoresponder. Set audios that play when trigger words are detected.',
    permission:  'owner',
    group:       true,
    private:     true,
 
    // â”€â”€ Management commands â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    run: async (sock, message, args, { jid, reply, command }) => {
        const cmd  = command || '';
        const word = args[0]?.toLowerCase().trim();
 
        // â”€â”€ .listbgm / .bgmlist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (cmd === 'listbgm' || cmd === 'bgmlist') {
            const list = listTriggers();
            if (!list.length)
                return reply(fmt('ðŸ”‡ No BGM triggers set yet.\n\nUse `.setbgm <word>` while replying to an audio.'));
 
            return reply(fmt(
                `ðŸŽµ *BGM Trigger Words (${list.length})*\n\n` +
                list.map((w, i) => `${i + 1}. \`${w}\``).join('\n') +
                `\n\n_Anyone who says one of these words will get an auto audio reply._`
            ));
        }
 
        // â”€â”€ .clearbgm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (cmd === 'clearbgm') {
            const list = listTriggers();
            if (!list.length) return reply(fmt('âš ï¸ No triggers to clear.'));
            list.forEach(w => delTrigger(w));
            return reply(fmt(`ðŸ—‘ï¸ Cleared all *${list.length}* BGM trigger(s).`));
        }
 
        // â”€â”€ .delbgm / .removebgm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (cmd === 'delbgm' || cmd === 'removebgm') {
            if (!word) return reply(fmt('âŒ Usage: `.delbgm <word>`'));
            const removed = delTrigger(word);
            return reply(removed
                ? fmt(`âœ… Removed trigger: \`${word}\``)
                : fmt(`âš ï¸ No trigger found for: \`${word}\``)
            );
        }
 
        // â”€â”€ .setbgm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (cmd === 'setbgm') {
            if (!word)
                return reply(fmt(
                    `âŒ *Usage:* Reply to an audio/voice note and type:\n` +
                    `\`.setbgm <trigger word>\`\n\n` +
                    `*Example:* \`.setbgm hello\`\n` +
                    `Whenever someone says *hello*, the bot will auto-send that audio.`
                ));
 
            const found = extractQuotedAudio(message);
            if (!found)
                return reply(fmt(
                    `âš ï¸ *No audio found!*\n\n` +
                    `Please *reply to a voice note or audio* while using this command.\n` +
                    `Example: reply to an audio then type \`.setbgm ${word}\``
                ));
 
            await reply(fmt(`â³ Saving audio for trigger: \`${word}\`â€¦`));
 
            try {
                const msgObj = buildMsgObj(message, found.msg);
                const buf = await baileys.downloadMediaMessage(
                    msgObj,
                    'buffer',
                    {},
                    { reuploadRequest: sock.updateMediaMessage }
                );
 
                const savedWord = setTrigger(word, buf, found.mimetype);
 
                return reply(fmt(
                    `âœ… *BGM Trigger Set!*\n\n` +
                    `ðŸŽµ *Word:* \`${savedWord}\`\n` +
                    `ðŸ“¦ *Audio:* ${(buf.length / 1024).toFixed(1)} KB\n\n` +
                    `_Whenever anyone says "${savedWord}", I'll auto-send this audio._\n` +
                    `_Use \`.delbgm ${savedWord}\` to remove it._`
                ));
            } catch (err) {
                console.error('[setbgm] download error:', err.message);
                return reply(fmt(`âŒ Failed to save audio: ${err.message}`));
            }
        }
    },
 
    // â”€â”€ onMessage â€” fires on every incoming message, checks for trigger words â”€â”€
    onMessage: async (sock, message, text, { jid, isGroup, contextInfo }) => {
        // Skip empty text
        if (!text || !text.trim()) return;
 
        // Skip messages sent by the bot itself
        if (message.key.fromMe) return;
 
        const match = matchTrigger(text);
        if (!match) return;
 
        // Cooldown guard â€” don't spam the same word in the same chat
        if (onCooldown(jid, match.word)) return;
 
        try {
            await sock.sendMessage(jid, {
                audio:    match.audioBuffer,
                mimetype: match.mimetype,
                ptt:      false,
                contextInfo,
            }, { quoted: message });
        } catch (err) {
            console.error(`[bgm-trigger] send failed (${match.word}):`, err.message);
        }
    },
};

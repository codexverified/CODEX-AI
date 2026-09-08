/**
 * gcstatus — Post text, link, image, video, audio or document to a
 * group's WhatsApp Status feed (native groupStatusMessageV2).
 *
 * ✅ No admin required — works as a regular group member
 * ✅ Uses the official groupStatusMessageV2 API (Baileys), with a manual
 *    relay fallback if the high-level `groupStatus:true` shortcut fails
 * ✅ Background colors for text status ("|bg:blue")
 * ✅ Broadcast to every group the bot is in, or target one specific group
 * ✅ Tracks every status it posts so they can all be pulled down at once
 *
 * Usage:
 *   .gcstatus Hello world!                      → text status (in the current group)
 *   .gcstatus Hello world!|blue                  → text status with a named color
 *   .gcstatus Hello world!|bg:#00FF88           → text with a raw background color
 *   .gcstatus Hello world!|all                    → broadcast text to every group
 *   .gcstatus Hello world!|bg:blue|all           → broadcast with background color
 *   .gcstatus Hello world!|12036...@g.us          → post to one specific group (works from DM)
 *   .gcstatus Hello world!|blue|12036...@g.us     → ...with a color too, any order works
 *   .gcstatus https://example.com                 → link status (with preview)
 *   .gcstatus clear                               → delete every status this bot posted here
 *   .gcstatus clear|12036...@g.us                 → ...for a specific group (works from DM)
 *   Reply to a message + .gcstatus                → posts that message to group status
 *   Reply to a photo    + .gcstatus [caption]      → image group status
 *   Reply to a video    + .gcstatus [caption]      → video group status
 *   Reply to an audio   + .gcstatus                → voice-note group status
 *   Reply to a document + .gcstatus [caption]      → document group status
 *
 *   Every content type above also accepts "|bg:color", "|all" and
 *   "|<groupJid>" pipe modifiers, in any order.
 *
 * Only have an invite link, not the JID? Use .gclinkstatus instead — it's a
 * separate command that resolves the group from a chat.whatsapp.com link.
 *
 * Colors:
 *   blue, green, yellow, orange, red, purple, gray, black, white, cyan,
 *   teal, lime, pink, indigo, navy, gold, brown, silver
 *   — or any raw hex code like #FF00AA.
 */

const {
    getQuoted,
    downloadMedia,
    encodeOpus,
    fetchLinkPreview,
    deleteTrackedStatuses,
    parsePipeArgs,
    deliver,
    TEXT_BG_COLOR,
} = require('../../lib/gcstatsus-core');

/** Works out where the status should go, without any invite-link support:
 *  - "|all" or "|<groupJid>" is used if present.
 *  - Otherwise, in a group, defaults to the current group.
 *  - Otherwise (DM, no target) — asks for one (or points at .gclinkstatus). */
async function resolveTarget(bot, m, { rawText, target }) {
    const sock = bot.sock;

    if (target === 'all') return { mode: 'broadcast', strippedRaw: rawText };
    if (target) {
        try { await sock.groupMetadata(target); }
        catch { return { mode: 'error', message: "❌ I'm not in that group (or the JID is wrong)." }; }
        return { mode: 'single', jid: target, strippedRaw: rawText };
    }
    if (m.isGroup) return { mode: 'single', jid: m.chat, strippedRaw: rawText };

    return {
        mode: 'error',
        message:
`This isn't a group, so I need to know which group to post to.

Add the target after a "|":
${bot.prefix}gcstatus Hello world!|all
${bot.prefix}gcstatus Hello world!|12036xxxxxxxxxx@g.us

Only have an invite link, not the JID? Use ${bot.prefix}gclinkstatus instead.`,
    };
}

module.exports = {
    name: 'gcstatus',
    aliases: ['groupstatus', 'gstatus', 'poststatus'],
    category: 'general',
    reactions: { start: '👥' },
    description: "Post text, link, image, video, audio or document to a group's status feed. Target the current group, \"all\", or a specific group JID. Supports colors and clearing tracked statuses. For invite-link targeting, use .gclinkstatus instead.",
    groupOnly: false,

    async execute(bot, m, args) {
        const sock   = bot.sock;
        const quoted = getQuoted(m);
        const rawFull = args.join(' ').trim();

        const quotedText    = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
        const quotedCaption = quoted?.imageMessage?.caption || quoted?.videoMessage?.caption
                            || quoted?.documentMessage?.caption || '';
        void quotedCaption; // not used for target resolution in this command

        const { text: parsedText, backgroundColor, target } = parsePipeArgs(rawFull);

        const imgMsg   = quoted?.imageMessage || quoted?.stickerMessage;
        const hasMedia = !!(imgMsg || quoted?.videoMessage || quoted?.audioMessage || quoted?.documentMessage);
        const isClear  = parsedText.toLowerCase() === 'clear';

        // Nothing to do yet — show usage instead of demanding a target first.
        if (!isClear && !hasMedia && !quotedText && !parsedText) {
            return m.reply(
`📊 GCStatus — Post to Group Status

Usage:
${bot.prefix}gcstatus Hello world!               — text status
${bot.prefix}gcstatus Hello world!|bg:blue — colored background status
${bot.prefix}gcstatus https://link.com            — link/preview status
${bot.prefix}gcstatus Hello world!|all            — broadcast to every group
${bot.prefix}gcstatus Hello world!|12036...@g.us  — post to one specific group
${bot.prefix}gcstatus clear                       — delete every status posted here
${bot.prefix}gcstatus clear|12036...@g.us         — ...for a specific group (works from DM)
Reply to 📷 photo    + ${bot.prefix}gcstatus [caption]
Reply to 🎥 video    + ${bot.prefix}gcstatus [caption]
Reply to 🎵 audio    + ${bot.prefix}gcstatus
Reply to 📄 document + ${bot.prefix}gcstatus [caption]
Reply to 💬 any message + ${bot.prefix}gcstatus

Only have an invite link, not the JID? Use ${bot.prefix}gclinkstatus instead.

Colors: use bg: with named colors or raw hex codes, e.g. bg:blue
Color and target can be combined, in either order: "Hello|blue|all".

No admin role needed.`
            );
        }

        const targetInfo = await resolveTarget(bot, m, { rawText: rawFull, target });
        if (targetInfo.mode === 'error') return m.reply(targetInfo.message);

        const bgColor = backgroundColor || TEXT_BG_COLOR;

        // ── CLEAR — delete every status this bot has posted to a group ─────
        if (isClear) {
            if (targetInfo.mode === 'broadcast') {
                return m.reply(`"clear" can't be broadcast — name one group, e.g. ${bot.prefix}gcstatus clear|12036...@g.us`);
            }
            const { deleted, failed, hadAny } = await deleteTrackedStatuses(sock, targetInfo.jid);
            if (!hadAny) return m.reply('No tracked statuses to delete for that group.');
            return m.reply(`🧹 Cleared ${deleted} status(es)` + (failed ? `, ${failed} failed` : '') + '.');
        }

        // ── IMAGE (or sticker treated as image) ───────────────────────────
        if (imgMsg) {
            await m.reply(targetInfo.mode === 'broadcast' ? '⏳ Broadcasting image to all your groups…' : '⏳ Posting image to group status…');
            try {
                const type = quoted.imageMessage ? 'image' : 'sticker';
                const buf  = await downloadMedia(imgMsg, type);
                const result = await deliver(sock, targetInfo, async () => ({ image: buf, caption: parsedText || '' }));
                return m.reply(result.broadcast
                    ? `✅ Broadcast done.\nSuccess: ${result.success}\nFailed: ${result.failed}`
                    : `✅ Posted to group status!\n📸 Type: Image` + (parsedText ? `\n💬 Caption: ${parsedText}` : ''));
            } catch (err) {
                return m.reply(`❌ Failed to post image: ${err.message}`);
            }
        }

        // ── VIDEO ──────────────────────────────────────────────────────────
        if (quoted?.videoMessage) {
            await m.reply(targetInfo.mode === 'broadcast' ? '⏳ Broadcasting video to all your groups…' : '⏳ Posting video to group status…');
            try {
                const buf = await downloadMedia(quoted.videoMessage, 'video');
                const result = await deliver(sock, targetInfo, async () => ({ video: buf, caption: parsedText || '' }));
                return m.reply(result.broadcast
                    ? `✅ Broadcast done.\nSuccess: ${result.success}\nFailed: ${result.failed}`
                    : `✅ Posted to group status!\n🎥 Type: Video` + (parsedText ? `\n💬 Caption: ${parsedText}` : ''));
            } catch (err) {
                return m.reply(`❌ Failed to post video: ${err.message}`);
            }
        }

        // ── AUDIO ────────────────────────────────────────────────────────
        if (quoted?.audioMessage) {
            await m.reply(targetInfo.mode === 'broadcast' ? '⏳ Broadcasting audio to all your groups…' : '⏳ Posting audio to group status…');
            try {
                const rawAudio = await downloadMedia(quoted.audioMessage, 'audio');
                const buf = await encodeOpus(rawAudio);
                const result = await deliver(sock, targetInfo, async () => ({ audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true }));
                return m.reply(result.broadcast
                    ? `✅ Broadcast done.\nSuccess: ${result.success}\nFailed: ${result.failed}`
                    : '✅ Posted to group status!\n🎵 Type: Audio');
            } catch (err) {
                return m.reply(`❌ Failed to post audio: ${err.message}`);
            }
        }

        // ── DOCUMENT ───────────────────────────────────────────────────────
        if (quoted?.documentMessage) {
            await m.reply(targetInfo.mode === 'broadcast' ? '⏳ Broadcasting document to all your groups…' : '⏳ Posting document to group status…');
            try {
                const doc = quoted.documentMessage;
                const buf = await downloadMedia(doc, 'document');
                const result = await deliver(sock, targetInfo, async () => ({
                    document: buf,
                    mimetype: doc.mimetype || 'application/octet-stream',
                    fileName: doc.fileName || 'document',
                    caption: parsedText || '',
                }));
                return m.reply(result.broadcast
                    ? `✅ Broadcast done.\nSuccess: ${result.success}\nFailed: ${result.failed}`
                    : `✅ Posted to group status!\n📄 Type: Document` + (parsedText ? `\n💬 Caption: ${parsedText}` : ''));
            } catch (err) {
                return m.reply(`❌ Failed to post document: ${err.message}`);
            }
        }

        // ── TEXT / LINK — either typed, or from a quoted text message ──────
        const messageText = parsedText || quotedText;
        if (!messageText) {
            return m.reply('❌ Please provide a message to post (or reply to something).');
        }

        const isUrl = /https?:\/\//i.test(messageText);
        await m.reply(targetInfo.mode === 'broadcast' ? '⏳ Broadcasting to your groups…' : '⏳ Posting to group status…');
        try {
            const result = await deliver(sock, targetInfo, async () => {
                if (isUrl) {
                    const preview = await fetchLinkPreview(messageText);
                    return {
                        text: messageText,
                        richPreview: true,
                        ...(preview.title       ? { previewTitle: preview.title }             : {}),
                        ...(preview.description ? { previewDescription: preview.description } : {}),
                        ...(preview.imageBuffer ? { previewImage: preview.imageBuffer }        : {}),
                    };
                }
                return { text: messageText, backgroundColor: bgColor };
            });
            return m.reply(result.broadcast
                ? `✅ Broadcast done.\nSuccess: ${result.success}\nFailed: ${result.failed}`
                : `✅ Posted to group status!\n${isUrl ? '🔗 Type: Link' : '💬 Type: Text'}\n📝 "${messageText.slice(0, 60)}${messageText.length > 60 ? '…' : ''}"`);
        } catch (err) {
            return m.reply(`❌ Failed to post: ${err.message}`);
        }
    },
};
                        

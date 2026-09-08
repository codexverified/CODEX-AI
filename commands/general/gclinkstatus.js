/**
 * gclinkstatus — Post to a group's WhatsApp Status feed, targeting the
 * group by its invite link instead of a JID (native groupStatusMessageV2).
 *
 * ✅ No admin required — works as a regular group member
 * ✅ Works from DM — as long as the bot is already a member of that group
 * ✅ Same text/link/image/video/audio/document + dual-color support as .gcstatus
 *
 * Usage:
 *   .gclinkstatus Hello everyone!                              (reply to a message containing the link)
 *   .gclinkstatus https://chat.whatsapp.com/XXXXXXXX Hello!    (paste the link directly)
 *   .gclinkstatus Hello everyone!|bg:blue|fg:white
 *   Reply to a photo    + .gclinkstatus [caption]   (link in the same replied-to message, or in your command text)
 *   Reply to a video    + .gclinkstatus [caption]
 *   Reply to an audio   + .gclinkstatus
 *   Reply to a document + .gclinkstatus [caption]
 *
 * Need the JID instead, or want to broadcast to every group / clear tracked
 * statuses? Use .gcstatus.
 *
 * Colors:
 *   blue, green, yellow, orange, red, purple, gray, black, white, cyan,
 *   teal, lime, pink, indigo, navy, gold, brown, silver
 *   — or any raw hex code like #FF00AA, using bg: and fg: prefixes.
 */

const {
    LINK_RE,
    getQuoted,
    downloadMedia,
    encodeOpus,
    fetchLinkPreview,
    parsePipeArgs,
    deliver,
    TEXT_BG_COLOR,
} = require('../../lib/gcstatsus-core');

/** Finds an invite link in the typed text or the quoted message, resolves
 *  it to a group JID, confirms the bot is a member, and strips the link
 *  out of whichever text held it so it isn't treated as caption/status text. */
async function resolveTarget(bot, m, { rawText, quotedText, quotedCaption }) {
    const sock = bot.sock;

    const link = rawText.match(LINK_RE)?.[0]
              || quotedText.match(LINK_RE)?.[0]
              || quotedCaption.match(LINK_RE)?.[0];

    if (!link) {
        return {
            mode: 'error',
            message:
`I need an invite link to know which group to post to.

Paste it directly, or reply to a message that contains it:
${bot.prefix}gclinkstatus https://chat.whatsapp.com/XXXXXXXX Hello world!

Have the group JID or want "|all"/clear instead? Use ${bot.prefix}gcstatus.`,
        };
    }

    let jid;
    try {
        const code = link.replace(/^https?:\/\/chat\.whatsapp\.com\//i, '').split('?')[0];
        const info = await sock.groupGetInviteInfo(code);
        jid = info.id;
    } catch (err) {
        return { mode: 'error', message: `❌ Couldn't resolve that invite link: ${err.message}` };
    }
    try {
        await sock.groupMetadata(jid);
    } catch {
        return { mode: 'error', message: "❌ I'm not a member of that group, so I can't post its status." };
    }

    const strippedRaw = rawText.includes(link) ? rawText.replace(link, '').trim() : rawText;
    return { mode: 'single', jid, strippedRaw };
}

module.exports = {
    name: 'gclinkstatus',
    aliases: ['glinkstatus', 'linkstatus'],
    category: 'general',
    reactions: { start: '👥' },
    description: "Post text, link, image, video, audio or document to a group's status feed, targeting the group via its invite link. Works from DM as long as the bot is already a member. For JID/\"all\"/clear, use .gcstatus instead.",
    groupOnly: false,

    async execute(bot, m, args) {
        const sock   = bot.sock;
        const quoted = getQuoted(m);
        const rawFull = args.join(' ').trim();

        const quotedText    = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
        const quotedCaption = quoted?.imageMessage?.caption || quoted?.videoMessage?.caption
                            || quoted?.documentMessage?.caption || '';

        const imgMsg   = quoted?.imageMessage || quoted?.stickerMessage;
        const hasMedia = !!(imgMsg || quoted?.videoMessage || quoted?.audioMessage || quoted?.documentMessage);

        if (!hasMedia && !quotedText && !rawFull.match(LINK_RE)) {
            return m.reply(
`📊 GCLinkStatus — Post to Group Status via Invite Link

Usage:
${bot.prefix}gclinkstatus https://chat.whatsapp.com/XXXXXXXX Hello world!
${bot.prefix}gclinkstatus Hello everyone!|bg:blue|fg:white   (reply to a message containing the link)
Reply to 📷 photo    + ${bot.prefix}gclinkstatus [caption]
Reply to 🎥 video    + ${bot.prefix}gclinkstatus [caption]
Reply to 🎵 audio    + ${bot.prefix}gclinkstatus
Reply to 📄 document + ${bot.prefix}gclinkstatus [caption]

Only need to target the current group, "all", or a JID — or want to clear
tracked statuses? Use ${bot.prefix}gcstatus instead.

Colors: use bg: and fg: with named colors or raw hex codes, e.g. bg:blue|fg:white`
            );
        }

        const targetInfo = await resolveTarget(bot, m, { rawText: rawFull, quotedText, quotedCaption });
        if (targetInfo.mode === 'error') return m.reply(targetInfo.message);

        // The caption/color comes from the link-stripped text, since the
        // original text may have swallowed link characters if parsed as-is.
        const { text: parsedText, backgroundColor, textColor } = parsePipeArgs(targetInfo.strippedRaw);
        const bgColor = backgroundColor || TEXT_BG_COLOR;

        // ── IMAGE (or sticker treated as image) ───────────────────────────
        if (imgMsg) {
            await m.reply('⏳ Posting image to group status…');
            try {
                const type = quoted.imageMessage ? 'image' : 'sticker';
                const buf  = await downloadMedia(imgMsg, type);
                await deliver(sock, targetInfo, async () => ({ image: buf, caption: parsedText || '' }));
                return m.reply(`✅ Posted to group status!\n📸 Type: Image` + (parsedText ? `\n💬 Caption: ${parsedText}` : ''));
            } catch (err) {
                return m.reply(`❌ Failed to post image: ${err.message}`);
            }
        }

        // ── VIDEO ──────────────────────────────────────────────────────────
        if (quoted?.videoMessage) {
            await m.reply('⏳ Posting video to group status…');
            try {
                const buf = await downloadMedia(quoted.videoMessage, 'video');
                await deliver(sock, targetInfo, async () => ({ video: buf, caption: parsedText || '' }));
                return m.reply(`✅ Posted to group status!\n🎥 Type: Video` + (parsedText ? `\n💬 Caption: ${parsedText}` : ''));
            } catch (err) {
                return m.reply(`❌ Failed to post video: ${err.message}`);
            }
        }

        // ── AUDIO ────────────────────────────────────────────────────────
        if (quoted?.audioMessage) {
            await m.reply('⏳ Posting audio to group status…');
            try {
                const rawAudio = await downloadMedia(quoted.audioMessage, 'audio');
                const buf = await encodeOpus(rawAudio);
                await deliver(sock, targetInfo, async () => ({ audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true }));
                return m.reply('✅ Posted to group status!\n🎵 Type: Audio');
            } catch (err) {
                return m.reply(`❌ Failed to post audio: ${err.message}`);
            }
        }

        // ── DOCUMENT ───────────────────────────────────────────────────────
        if (quoted?.documentMessage) {
            await m.reply('⏳ Posting document to group status…');
            try {
                const doc = quoted.documentMessage;
                const buf = await downloadMedia(doc, 'document');
                await deliver(sock, targetInfo, async () => ({
                    document: buf,
                    mimetype: doc.mimetype || 'application/octet-stream',
                    fileName: doc.fileName || 'document',
                    caption: parsedText || '',
                }));
                return m.reply(`✅ Posted to group status!\n📄 Type: Document` + (parsedText ? `\n💬 Caption: ${parsedText}` : ''));
            } catch (err) {
                return m.reply(`❌ Failed to post document: ${err.message}`);
            }
        }

        // ── TEXT / LINK — either typed, or from a quoted text message ──────
        const messageText = parsedText || quotedText;
        if (!messageText) {
            return m.reply("Found the group, but there's nothing to post — add a caption, or reply to an image, video, audio, or document instead.");
        }

        const isUrl = /https?:\/\//i.test(messageText);
        await m.reply('⏳ Posting to group status…');
        try {
            await deliver(sock, targetInfo, async () => {
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
                return { text: messageText, backgroundColor: bgColor, textColor, font: 0 };
            });
            return m.reply(`✅ Posted to group status!\n${isUrl ? '🔗 Type: Link' : '💬 Type: Text'}\n📝 "${messageText.slice(0, 60)}${messageText.length > 60 ? '…' : ''}"`);
        } catch (err) {
            return m.reply(`❌ Failed to post: ${err.message}`);
        }
    },
};

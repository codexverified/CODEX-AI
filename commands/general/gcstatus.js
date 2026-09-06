/**
 * gcstatus — Post text, link, image, video, audio or document to a
 * group's WhatsApp Status feed (native groupStatusMessageV2).
 *
 * ✅ No admin required — works as a regular group member
 * ✅ Uses the official groupStatusMessageV2 API (Baileys), with a manual
 *    relay fallback if the high-level `groupStatus:true` shortcut fails
 * ✅ Works from DM too — either name a group JID/"all", or just point at
 *    a group invite link and it'll resolve the group for you
 * ✅ Named background colors for text status ("|blue"), or a raw hex code
 * ✅ Broadcast to every group the bot is in, or target one specific group
 * ✅ Tracks every status it posts so they can all be pulled down at once
 *
 * Usage:
 *   .gcstatus Hello world!                      → text status (in the current group)
 *   .gcstatus Hello world!|blue                  → text status with a named color
 *   .gcstatus Hello world!|#00FF88                → text status with a raw hex color
 *   .gcstatus Hello world!|all                    → broadcast text to every group
 *   .gcstatus Hello world!|blue|all               → broadcast, colored
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
 *   Every content type above also accepts the "|color", "|all" and
 *   "|<groupJid>" pipe modifiers, in any order.
 *
 * Invite-link targeting (alias: .gclinkstatus / .glinkstatus / .linkstatus):
 *   Only have an invite link, not the JID? Point at it instead of a JID —
 *   works from DM as long as the bot is already a member of that group.
 *     .gclinkstatus Hello everyone!                              (reply to a message containing the link)
 *     .gclinkstatus https://chat.whatsapp.com/XXXXXXXX Hello!    (paste the link directly)
 *     .gclinkstatus Hello everyone!|blue
 *   Same media/color support as above — the link just picks the target.
 *
 * Colors:
 *   blue, green, yellow, orange, red, purple, gray, black, white, cyan
 *   — or any raw hex code like #FF00AA.
 */

const crypto = require('crypto');
const axios  = require('axios');
const fs     = require('fs-extra');
const path   = require('path');
const { spawn } = require('child_process');
// Loaded through lib/baileys.js's CJS↔ESM bridge — this IS @crysnovax/baileys
// (the package the whole project already depends on); requiring the package
// directly here would throw ERR_REQUIRE_ESM, same reason every other file
// that touches Baileys internals goes through this shim instead.
const {
    downloadContentFromMessage,
    generateWAMessageContent,
    generateWAMessageFromContent,
} = require('../../lib/baileys');

let ffmpegPath = null;
try { ffmpegPath = require('ffmpeg-static'); } catch { ffmpegPath = null; }

// ── Named background colors for text status ────────────────────────────────
const COLORS = {
    blue: '#34B7F1',
    green: '#25D366',
    yellow: '#FFD700',
    orange: '#FF8C00',
    red: '#FF3B30',
    purple: '#9C27B0',
    gray: '#9E9E9E',
    black: '#000000',
    white: '#FFFFFF',
    cyan: '#00BCD4',
};
const TEXT_BG_COLOR = COLORS.purple; // default when no color is specified

const GROUP_JID_RE = /^\d+@g\.us$/i;
const HEX_RE       = /^#?[0-9a-f]{6}$/i;
const LINK_RE      = /https?:\/\/chat\.whatsapp\.com\/\S+/i;

// ── Status ID store — lets .gcstatus clear find what to delete later ──────
const ID_DB   = path.join(process.cwd(), 'database/gstatus-ids.json');
const loadIds = () => { try { return JSON.parse(fs.readFileSync(ID_DB, 'utf8')); } catch { return {}; } };
const saveId  = (jid, msgId) => {
    if (!msgId) return;
    fs.ensureDirSync(path.dirname(ID_DB));
    const db = loadIds();
    if (!db[jid]) db[jid] = [];
    db[jid].push(msgId);
    fs.writeFileSync(ID_DB, JSON.stringify(db, null, 2));
};
const clearIds = (jid) => {
    const db  = loadIds();
    const ids = db[jid] || [];
    delete db[jid];
    fs.ensureDirSync(path.dirname(ID_DB));
    fs.writeFileSync(ID_DB, JSON.stringify(db, null, 2));
    return ids;
};

// ── helpers ──────────────────────────────────────────────────────────────

async function downloadMedia(mediaMsg, type) {
    const stream = await downloadContentFromMessage(mediaMsg, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

/** MP3/AAC/etc → OGG/Opus, same ffmpeg-static pattern used by lib/ttsHelper.js. */
function encodeOpus(buffer) {
    return new Promise((resolve) => {
        if (!ffmpegPath) return resolve(buffer);
        const args = [
            '-hide_banner', '-loglevel', 'error',
            '-i', 'pipe:0',
            '-vn', '-c:a', 'libopus', '-b:a', '64k',
            '-ar', '48000', '-ac', '1', '-f', 'ogg', 'pipe:1',
        ];
        const ff = spawn(ffmpegPath, args);
        const chunks = [];
        ff.stdout.on('data', c => chunks.push(c));
        ff.on('error', () => resolve(buffer));
        ff.on('close', code => resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : buffer));
        ff.stdin.on('error', () => {});
        ff.stdin.end(buffer);
    });
}

/** Best-effort OG title/description/image scrape for a nicer link status. Never throws. */
async function fetchLinkPreview(url) {
    const result = { title: null, description: null, imageBuffer: null };
    try {
        const res = await axios.get(url, {
            timeout: 10000,
            responseType: 'text',
            headers: { 'User-Agent': 'WhatsApp/2.23.20.0 A' },
            maxRedirects: 5,
        });
        const html = res.data || '';

        const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
                      || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
        if (ogTitle) result.title = ogTitle.trim().slice(0, 120);

        const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
                     || html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
        if (ogDesc) result.description = ogDesc.trim().slice(0, 300);

        const imgUrl = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
        if (imgUrl) {
            const absImg = imgUrl.startsWith('http') ? imgUrl : new URL(imgUrl, url).href;
            try {
                const imgRes = await axios.get(absImg, {
                    timeout: 12000,
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'WhatsApp/2.23.20.0 A' },
                });
                if (imgRes.data?.length > 1000) result.imageBuffer = Buffer.from(imgRes.data);
            } catch {}
        }
    } catch {}
    return result;
}

async function getGroupParticipantJids(sock, groupJid) {
    try {
        const meta = await sock.groupMetadata(groupJid);
        return (meta?.participants || []).map(p => p.id).filter(Boolean);
    } catch {
        return [];
    }
}

/** Posts `content` to groupJid's status feed. Tries the high-level shortcut
 *  first, falls back to a manual groupStatusMessageV2 relay if unsupported.
 *  `content` is passed through untouched in both paths — `backgroundColor`
 *  and `font` are genuine Baileys text-message fields (it converts the hex
 *  itself internally), so they must stay ON the message content object,
 *  not get pulled out into a separate options bag. Pulling them out (or
 *  force-adding `richPreview` to every text post, color or not) is exactly
 *  what silently ate the color before: richPreview overrides how the
 *  status renders, so it must only be set by the caller for real links.
 *  Returns the sent message (so callers can track its id for .gcstatus clear). */
async function postGroupStatus(sock, groupJid, content) {
    try {
        return await sock.sendMessage(groupJid, { ...content, groupStatus: true });
    } catch (e) {
        console.error('[gcstatus] groupStatus:true path failed, falling back to relay:', e.message);
    }

    const inner = await generateWAMessageContent(content, {
        upload: sock.waUploadToServer,
    });

    const secret = crypto.randomBytes(32);
    const msg = generateWAMessageFromContent(
        groupJid,
        {
            messageContextInfo: { messageSecret: secret },
            groupStatusMessageV2: { message: { ...inner, messageContextInfo: { messageSecret: secret } } },
        },
        {}
    );

    const statusJidList = await getGroupParticipantJids(sock, groupJid);
    await sock.relayMessage(groupJid, msg.message, {
        messageId: msg.key.id,
        statusJidList,
        additionalAttributes: { messageId: msg.key.id },
    });
    return msg;
}

/** Resolve the quoted message the same way CODEX's own sticker.js does,
 *  including unwrapping view-once wrappers. */
function getQuoted(m) {
    const ctx = m.msg?.contextInfo || m.message?.extendedTextMessage?.contextInfo;
    let quoted = ctx?.quotedMessage;
    if (!quoted) return null;
    for (const vt of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
        if (quoted[vt]) { quoted = quoted[vt]?.message || quoted[vt]; break; }
    }
    return quoted;
}

/** Deletes every tracked status for one group. Uses sock.deleteGroupStatus
 *  if this Baileys build has it, otherwise falls back to a normal message
 *  delete — both are tried per-id so one missing API doesn't sink the rest. */
async function deleteTrackedStatuses(sock, groupJid) {
    const ids = clearIds(groupJid);
    if (!ids.length) return { deleted: 0, failed: 0, hadAny: false };

    let deleted = 0, failed = 0;
    for (const msgId of ids) {
        try {
            if (typeof sock.deleteGroupStatus === 'function') {
                await sock.deleteGroupStatus(groupJid, { remoteJid: groupJid, fromMe: true, id: msgId });
            } else {
                await sock.sendMessage(groupJid, { delete: { remoteJid: groupJid, fromMe: true, id: msgId } });
            }
            deleted++;
        } catch { failed++; }
        await new Promise(r => setTimeout(r, 300));
    }
    return { deleted, failed, hadAny: true };
}

/** Splits "<text>|<color-or-target>|<color-or-target>" into its parts.
 *  Color and target can appear in either order (or be omitted) — each
 *  pipe segment after the first is classified by what it looks like. */
function parsePipeArgs(raw) {
    const segments = raw.split('|').map(s => s.trim());
    const text = segments[0] || '';
    let color = null;
    let target = null;
    for (const seg of segments.slice(1)) {
        if (!seg) continue;
        if (seg.toLowerCase() === 'all') { target = 'all'; continue; }
        if (GROUP_JID_RE.test(seg))      { target = seg; continue; }
        if (COLORS[seg.toLowerCase()])   { color = COLORS[seg.toLowerCase()]; continue; }
        if (HEX_RE.test(seg))            { color = seg.startsWith('#') ? seg : `#${seg}`; continue; }
        // unrecognized segment — ignored rather than treated as an error
    }
    return { text, color, target };
}

/** Works out where the status should go.
 *  - An invite link anywhere in the typed text or the quoted message wins
 *    first — it's resolved to a JID and membership is confirmed.
 *  - Otherwise "|all" or "|<groupJid>" is used if present.
 *  - Otherwise, in a group, defaults to the current group.
 *  - Otherwise (DM, no target, no link) — asks for one. */
async function resolveTarget(bot, m, { rawText, quotedText, quotedCaption, target }) {
    const sock = bot.sock;

    const link = rawText.match(LINK_RE)?.[0]
              || quotedText.match(LINK_RE)?.[0]
              || quotedCaption.match(LINK_RE)?.[0];

    if (link) {
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
        // Strip the link out of whichever text held it, so it isn't
        // treated as part of the caption/status text.
        const strippedRaw = rawText.includes(link) ? rawText.replace(link, '').trim() : rawText;
        return { mode: 'single', jid, link, strippedRaw };
    }

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

Only have an invite link, not the JID? Just include the link instead:
${bot.prefix}gcstatus https://chat.whatsapp.com/XXXXXXXX Hello world!`,
    };
}

/** Posts one piece of content to wherever resolveTarget() decided —
 *  a single group, or every group the bot is in. buildContent() is called
 *  once and reused for every group when broadcasting. */
async function deliver(sock, targetInfo, buildContent) {
    if (targetInfo.mode === 'single') {
        const content = await buildContent();
        const res = await postGroupStatus(sock, targetInfo.jid, content);
        saveId(targetInfo.jid, res?.key?.id);
        return { broadcast: false, success: 1, failed: 0 };
    }

    let groupIds;
    try {
        const groups = await sock.groupFetchAllParticipating();
        groupIds = Object.keys(groups);
    } catch (err) {
        throw new Error(`Couldn't list groups: ${err.message}`);
    }
    if (!groupIds.length) throw new Error('Bot is not in any groups.');

    const content = await buildContent();
    let success = 0, failed = 0;
    for (const gid of groupIds) {
        try {
            const res = await postGroupStatus(sock, gid, content);
            saveId(gid, res?.key?.id);
            success++;
        } catch { failed++; }
        await new Promise(r => setTimeout(r, 500));
    }
    return { broadcast: true, success, failed };
}

// ── command ───���──────────────────────────────────────────────────────────

module.exports = {
    name: 'gcstatus',
    aliases: ['gcstatsus', 'groupstatus', 'gstatus', 'poststatus', 'gclinkstatus', 'glinkstatus', 'linkstatus'],
    category: 'general',
    reactions: { start: '👥' },
    description: "Post text, link, image, video, audio or document to a group's status feed. Works from DM too — via a group JID, \"all\", or an invite link. Supports colors and clearing tracked statuses.",
    groupOnly: false,

    async execute(bot, m, args) {
        const sock   = bot.sock;
        const quoted = getQuoted(m);
        const rawFull = args.join(' ').trim();

        const quotedText    = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
        const quotedCaption = quoted?.imageMessage?.caption || quoted?.videoMessage?.caption
                            || quoted?.documentMessage?.caption || '';

        // Pipe-parse the typed text first (used when there's no invite link).
        const { text: pipeText, color, target } = parsePipeArgs(rawFull);

        const imgMsg   = quoted?.imageMessage || quoted?.stickerMessage;
        const hasMedia = !!(imgMsg || quoted?.videoMessage || quoted?.audioMessage || quoted?.documentMessage);
        const isClear  = pipeText.toLowerCase() === 'clear';

        // Nothing to do yet — show usage instead of demanding a target first.
        if (!isClear && !hasMedia && !quotedText && !pipeText && !rawFull.match(LINK_RE)) {
            return m.reply(
`📊 GCStatus — Post to Group Status

Usage:
${bot.prefix}gcstatus Hello world!               — text status
${bot.prefix}gcstatus Hello world!|blue           — colored text status
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

Only have an invite link, not the JID? Just include it — works the same
from DM, as long as I'm already a member of that group:
${bot.prefix}gcstatus https://chat.whatsapp.com/XXXXXXXX Hello world!
(alias: ${bot.prefix}gclinkstatus)

Colors: blue, green, yellow, orange, red, purple, gray, black, white, cyan (or a raw hex code)
Color and target can be combined, in either order: "Hello|blue|all".

No admin role needed.`
            );
        }

        const targetInfo = await resolveTarget(bot, m, { rawText: rawFull, quotedText, quotedCaption, target });
        if (targetInfo.mode === 'error') return m.reply(targetInfo.message);

        // If an invite link was used, the caption/color comes from the
        // link-stripped text instead of the original pipe-parse (which ran
        // on the un-stripped text and may have swallowed link characters).
        const { text: parsedText, color: parsedColor } = targetInfo.link
            ? parsePipeArgs(targetInfo.strippedRaw)
            : { text: pipeText, color };
        const bgColor = parsedColor || color || TEXT_BG_COLOR;

        // ── CLEAR — delete every status this bot has posted to a group ─────
        if (isClear && !targetInfo.link) {
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
            return m.reply(targetInfo.link
                ? "Found the group, but there's nothing to post — add a caption, or reply to an image, video, audio, or document instead."
                : '❌ Please provide a message to post (or reply to something).');
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
                return { text: messageText, backgroundColor: bgColor, font: 0 };
            });
            return m.reply(result.broadcast
                ? `✅ Broadcast done.\nSuccess: ${result.success}\nFailed: ${result.failed}`
                : `✅ Posted to group status!\n${isUrl ? '🔗 Type: Link' : '💬 Type: Text'}\n📝 "${messageText.slice(0, 60)}${messageText.length > 60 ? '…' : ''}"`);
        } catch (err) {
            return m.reply(`❌ Failed to post: ${err.message}`);
        }
    },
};

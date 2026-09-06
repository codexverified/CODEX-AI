/**
 * gcstatus-core — shared internals for .gcstatus and .gclinkstatus.
 *
 * Both commands post to a group's WhatsApp Status feed (native
 * groupStatusMessageV2); the only thing that differs between them is how
 * they figure out *which* group to target. Everything else — media
 * download/encode, link-preview scraping, the actual send/relay call,
 * status-id tracking for "clear", and pipe-arg parsing — lives here so
 * neither command file duplicates it.
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
} = require('./baileys');

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

// ── Status ID store — lets "clear" find what to delete later ──────────────
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
 *  Baileys expects `backgroundColor` and `font` in the send-options object,
 *  not inside the message content object. Keeping them in the content object
 *  makes the message send successfully but silently drops the colour.
 *  `richPreview` is only added by the caller for real links, because it can
 *  override normal text-status rendering.
 *  Returns the sent message (so callers can track its id for "clear"). */
async function postGroupStatus(sock, groupJid, content) {
    const { backgroundColor, font, ...messageContent } = content;
    const sendOptions = {
        ...(backgroundColor ? { backgroundColor } : {}),
        ...(Number.isInteger(font) ? { font } : {}),
    };

    try {
        // This Baileys fork reads `groupStatus` off the message CONTENT
        // (2nd arg), not the send-options object — unlike backgroundColor/font,
        // which do belong in options. Putting it in options makes sendMessage
        // silently post a normal group chat message instead of a status.
        return await sock.sendMessage(groupJid, { ...messageContent, groupStatus: true }, sendOptions);
    } catch (e) {
        console.error('[gcstatus] groupStatus:true path failed, falling back to relay:', e.message);
    }

    const inner = await generateWAMessageContent(messageContent, {
        upload: sock.waUploadToServer,
    });

    // The manual relay does not receive sendOptions, so put the same fields
    // on the generated extended-text proto before relaying it.
    if (inner?.extendedTextMessage) {
        if (backgroundColor) inner.extendedTextMessage.backgroundColor = backgroundColor;
        if (Number.isInteger(font)) inner.extendedTextMessage.font = font;
    }

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

/** Posts one piece of content to wherever the caller's target resolution
 *  decided — a single group, or every group the bot is in. buildContent()
 *  is called once and reused for every group when broadcasting. */
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

module.exports = {
    COLORS,
    TEXT_BG_COLOR,
    GROUP_JID_RE,
    HEX_RE,
    LINK_RE,
    downloadMedia,
    encodeOpus,
    fetchLinkPreview,
    getGroupParticipantJids,
    postGroupStatus,
    getQuoted,
    deleteTrackedStatuses,
    parsePipeArgs,
    deliver,
};
  

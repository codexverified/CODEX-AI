const axios = require('axios');
const { resolveLookupTarget } = require('../../lib/lookupTarget');

const QUERY_TIMEOUT_MS = 15000;
const DOWNLOAD_TIMEOUT_MS = 20000;
const CDN = 'https://mmg.whatsapp.net';

const asList = (content) => (Array.isArray(content) ? content : []);
const asText = (content) => {
    if (typeof content === 'string') return content;
    if (content && typeof content === 'object' && typeof content.length === 'number' && content.toString) {
        try { return content.toString('utf8'); } catch { return ''; }
    }
    return '';
};

function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    visit(node);
    for (const child of asList(node.content)) walk(child, visit);
}

function findChild(node, tag) {
    return asList(node?.content).find((c) => c?.tag === tag) || null;
}

function dump(node, depth = 0) {
    if (!node || typeof node !== 'object') return '';
    const pad = '  '.repeat(depth);
    const attrs = Object.entries(node.attrs || {}).map(([k, v]) => `${k}="${String(v).slice(0, 90)}"`).join(' ');
    let line = `${pad}<${node.tag}${attrs ? ' ' + attrs : ''}>`;
    const kids = asList(node.content);
    if (!kids.length && node.content != null) {
        const text = asText(node.content);
        line += text ? ` ${text.slice(0, 80).replace(/\s+/g, ' ')}` : ` [${node.content.length || 0} bytes]`;
    }
    return [line, ...kids.map((c) => dump(c, depth + 1))].join('\n');
}

function candidateUrls(coverNode) {
    const urls = [];
    const add = (u) => { if (u && !urls.includes(u)) urls.push(u); };
    walk(coverNode, (n) => {
        const a = n.attrs || {};
        for (const key of ['url', 'src', 'link']) if (typeof a[key] === 'string' && /^https?:\/\//i.test(a[key])) add(a[key]);
        const dp = a.direct_path || a.directPath || a.path;
        if (typeof dp === 'string' && dp.startsWith('/')) add(`${CDN}${dp}`);
        const text = asText(n.content).trim();
        if (/^https?:\/\//i.test(text)) add(text);
        if (text.startsWith('/v/') || text.startsWith('/o1/')) add(`${CDN}${text}`);
    });
    return urls;
}

function extractCover(response) {
    const businessProfile = findChild(response, 'business_profile');
    const profile = findChild(businessProfile, 'profile');
    if (!profile) return { isBusiness: false, covers: [] };
    const covers = [];
    walk(profile, (n) => { if (/cover/i.test(String(n.tag || ''))) covers.push(n); });
    return {
        isBusiness: true,
        covers: covers.map((node) => ({
            node,
            id: node.attrs?.id || node.attrs?.fbid || null,
            urls: candidateUrls(node),
        })),
    };
}

function looksLikeImage(buf) {
    if (!buf || buf.length < 12) return false;
    const jpg = buf[0] === 0xff && buf[1] === 0xd8;
    const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const webp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
    return jpg || png || webp;
}

async function download(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxContentLength: 25 * 1024 * 1024,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        validateStatus: (s) => s >= 200 && s < 300,
    });
    const buf = Buffer.from(res.data);
    if (!looksLikeImage(buf)) throw new Error('not an image');
    return buf;
}

async function toPhoneJid(bot, jid) {
    const clean = String(jid).replace(/:[0-9]+@/, '@');
    if (!clean.endsWith('@lid')) return clean;
    try {
        const pn = await bot.sock.signalRepository?.lidMapping?.getPNForLID?.(clean);
        if (pn) return String(pn).replace(/:[0-9]+@/, '@');
    } catch {}
    return clean;
}

async function fetchBusinessNode(bot, jid) {
    let timer;
    try {
        return await Promise.race([
            bot.sock.query({
                tag: 'iq',
                attrs: { to: 's.whatsapp.net', xmlns: 'w:biz', type: 'get' },
                content: [{ tag: 'business_profile', attrs: { v: '244' }, content: [{ tag: 'profile', attrs: { jid } }] }],
            }),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('WhatsApp did not answer in time')), QUERY_TIMEOUT_MS); }),
        ]);
    } finally { clearTimeout(timer); }
}

module.exports = {
    name: 'getbizcover',
    aliases: ['getcover', 'bizcoverget', 'coverget'],
    category: 'business',
    reactions: { start: '🖼️' },
    description: 'Get the cover photo of a WhatsApp Business account — .getbizcover 234xxxxxxxxxx | .getbizcover @user | reply to their message. Add -p to send it to the owner DM.',

    extractCover,
    dump,
    candidateUrls,

    async execute(bot, m, args) {
        const P = bot.prefix || '.';
        const { jid: target, flags, invalid } = resolveLookupTarget(m, args);
        if (invalid) return m.reply(`That number doesn't look right.\nExample: ${P}getbizcover 2349035671379`);

        const debug = flags.has('debug');
        const toDM = flags.has('-p');
        const jid = await toPhoneJid(bot, target);
        const who = `@${target.split('@')[0]}`;
        const mentions = [target];
        const say = (text) => m.reply(text, { mentions });

        let response;
        try {
            response = await fetchBusinessNode(bot, jid);
        } catch (err) {
            return say(`❌ Couldn't look up ${who}: ${err.message}`);
        }

        if (debug) {
            const text = dump(response) || '(empty response)';
            return say(`🔎 *Raw WhatsApp answer for ${who}*\n\n\`\`\`${text.slice(0, 3500)}\`\`\``);
        }

        const { isBusiness, covers } = extractCover(response);
        if (!isBusiness) {
            return say(`ℹ️ ${who} has no WhatsApp Business profile, so there's no cover photo.`);
        }
        if (!covers.length) {
            return say(`ℹ️ No cover photo found for ${who}. They may not have set one, or WhatsApp doesn't include it in this answer — add "debug" to the command (${P}getbizcover debug) and send me the result.`);
        }

        let lastError = null;
        for (const cover of covers) {
            for (const url of cover.urls) {
                try {
                    const image = await download(url);
                    const content = { image, caption: `_bizcover of_ ${who}\n\n\n*DOWNLOADED VIA CODEX AI*`, mentions };
                    const sent = toDM
                        ? await bot.sendMessage(bot.config.owner.number, content)
                        : await bot.sendMessage(m.chat, content, { quoted: m });
                    if (!sent) return say('❌ Found the cover photo but WhatsApp would not let me send it.');
                    if (toDM) await m.reply('_BUSINESS COVER PHOTO SENT TO YOUR DM_');
                    return;
                } catch (err) {
                    lastError = err;
                }
            }
        }

        const ids = covers.map((c) => c.id).filter(Boolean);
        if (!covers.some((c) => c.urls.length)) {
            return say(`⚠️ ${who} has a cover photo${ids.length ? ` (id ${ids[0]})` : ''}, but WhatsApp didn't give a download link for it. Add "debug" to the command (${P}getbizcover debug) and send me the result.`);
        }
        return say(`⚠️ Found the cover photo link for ${who} but couldn't download it${lastError ? `: ${lastError.message}` : ''}.`);
    },
};


/**
 * .tts <text> — text-to-speech
 * .tts <voicename> <text> — pick a specific voice (234 available)
 * .tts voices [language] — list available voice names
 *
 * Primary provider: ab-text-voice.abrahamdw882.workers.dev — a dedicated
 * TTS worker with 234 named voices across ~60 languages. Falls back to the
 * previous provider chain (prexzyvilla, ttsHelper, Google Translate) if it
 * doesn't return usable audio, so a single provider outage doesn't take
 * .tts down entirely.
 */
'use strict';
const axios = require('axios');
const { generateVoice } = require('../../utils/ttsHelper');

const AUDIO_RE = /\.(mp3|ogg|m4a|wav|aac|opus)(\?|$)/i;
const URL_RE = /^https?:\/\//i;
const TTS_API_BASE = 'https://ab-text-voice.abrahamdw882.workers.dev/';
const DEFAULT_VOICE = 'henry';

let _voiceCache = null; // { names: Set, byLang: Map, fetchedAt }

async function getVoiceList() {
    if (_voiceCache && Date.now() - _voiceCache.fetchedAt < 30 * 60 * 1000) return _voiceCache;
    try {
        const res = await axios.get(TTS_API_BASE, { timeout: 15000 });
        const voices = res.data?.voices || [];
        const names = new Set(voices.map(v => String(v.name).toLowerCase()));
        const byLang = new Map();
        for (const v of voices) {
            const lang = v.language || 'unknown';
            if (!byLang.has(lang)) byLang.set(lang, []);
            byLang.get(lang).push(v.name);
        }
        _voiceCache = { names, byLang, fetchedAt: Date.now() };
        return _voiceCache;
    } catch {
        return _voiceCache || { names: new Set([DEFAULT_VOICE]), byLang: new Map(), fetchedAt: 0 };
    }
}

// ─── Primary: ab-text-voice worker ───────────────────────────────────────────
async function tryAbTextVoice(text, voicename) {
    try {
        const url = `${TTS_API_BASE}?q=${encodeURIComponent(text)}&voicename=${encodeURIComponent(voicename)}`;
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0 (CODEX-AI)' },
            validateStatus: () => true,
        });
        if (res.status >= 400) return null;

        const contentType = String(res.headers['content-type'] || '');
        // A JSON response here means the request itself was rejected (bad
        // voice name, missing param, etc.) rather than audio coming back.
        if (contentType.includes('json')) return null;

        const buf = Buffer.from(res.data);
        if (buf && buf.length > 512) return { buffer: buf, mimetype: contentType.includes('audio') ? contentType : 'audio/mpeg' };
        return null;
    } catch (e) {
        console.error('[tts] ab-text-voice failed:', e.message);
        return null;
    }
}

function walkAudioUrls(node, out) {
    if (!node) return;
    if (typeof node === 'string') {
        if (URL_RE.test(node) && AUDIO_RE.test(node)) out.push(node);
        return;
    }
    if (Array.isArray(node)) { for (const v of node) walkAudioUrls(v, out); return; }
    if (typeof node === 'object') { for (const v of Object.values(node)) walkAudioUrls(v, out); }
}

// ─── Fallback: prexzyvilla, accepting EITHER response shape ─────────────────
async function tryPrexzyvillaDirect(text) {
    try {
        const url = `https://prexzyapis.com/tts/tts-en?text=${encodeURIComponent(text)}`;
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0 (SUKUNA-MD)' },
            validateStatus: () => true,
        });
        if (res.status >= 400) return null;

        const contentType = String(res.headers['content-type'] || '');

        if (contentType.includes('audio') || contentType.includes('octet-stream') || contentType.includes('mpeg')) {
            const buf = Buffer.from(res.data);
            if (buf && buf.length > 1024) return { buffer: buf, mimetype: 'audio/mpeg' };
            return null;
        }

        if (contentType.includes('json')) {
            let parsed;
            try { parsed = JSON.parse(Buffer.from(res.data).toString('utf8')); } catch { return null; }
            const urls = [];
            walkAudioUrls(parsed, urls);
            if (!urls.length) return null;
            const audioRes = await axios.get(urls[0], { responseType: 'arraybuffer', timeout: 30000 });
            const buf = Buffer.from(audioRes.data);
            if (buf && buf.length > 1024) return { buffer: buf, mimetype: 'audio/mpeg' };
        }
        return null;
    } catch (e) {
        console.error('[tts] prexzyvilla direct failed:', e.message);
        return null;
    }
}

// ─── Last resort: Google Translate TTS — no key needed ──────────────────────
async function tryGoogleTranslateTts(text) {
    try {
        const url = 'https://translate.google.com/translate_tts?ie=UTF-8&q=' +
            encodeURIComponent(text) + '&tl=en&client=tw-ob';
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const buf = Buffer.from(res.data);
        if (buf && buf.length > 512) return { buffer: buf, mimetype: 'audio/mpeg' };
        return null;
    } catch (e) {
        console.error('[tts] Google Translate TTS failed:', e.message);
        return null;
    }
}

module.exports = {
    name: 'tts',
    aliases: ['say', 'voice', 'speak'],
    description: 'Convert text to speech — 234 voices across ~60 languages',
    category: 'media',
    reactions: { start: '⏳' },

    async execute(bot, m, args) {
        if (!args.length) {
            await bot.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {});
            return m.reply(
                `*Text to Speech*\n\n` +
                `Usage:\n` +
                `${bot.prefix}tts <text> — uses the default voice (${DEFAULT_VOICE})\n` +
                `${bot.prefix}tts <voicename> <text> — pick a specific voice\n` +
                `${bot.prefix}tts voices [language code] — list available voices\n\n` +
                `Example: ${bot.prefix}tts mrbeast hello world`
            );
        }

        // .tts voices [lang] — list what's available instead of speaking it
        if (args[0].toLowerCase() === 'voices') {
            const { byLang } = await getVoiceList();
            const langFilter = (args[1] || '').toLowerCase();

            if (langFilter) {
                const match = [...byLang.keys()].find(l => l.toLowerCase() === langFilter);
                if (!match) return m.reply(`No voices found for language "${args[1]}". Try e.g. en-US, en-GB, fr-FR, es-ES, ja-JP.`);
                return m.reply(`*Voices for ${match}:*\n${byLang.get(match).join(', ')}`);
            }

            const languages = [...byLang.keys()].sort();
            return m.reply(
                `*234 voices available across ${languages.length} languages.*\n\n` +
                `Popular English voices: henry, mrbeast, snoop, matthew, jane, guy, amy, brian\n\n` +
                `See voices for a specific language:\n${bot.prefix}tts voices <language code>\n` +
                `Example: ${bot.prefix}tts voices ja-JP\n\n` +
                `Languages: ${languages.slice(0, 40).join(', ')}${languages.length > 40 ? ', ...' : ''}`
            );
        }

        // First word is a valid voice name → use it and treat the rest as the text
        const { names } = await getVoiceList();
        let voicename = DEFAULT_VOICE;
        let text;
        if (args.length > 1 && names.has(args[0].toLowerCase())) {
            voicename = args[0].toLowerCase();
            text = args.slice(1).join(' ').trim();
        } else {
            text = args.join(' ').trim();
        }

        text = text.slice(0, 600);

        if (!text) {
            await bot.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {});
            return m.reply('Please provide some text.');
        }

        try {
            let result = await tryAbTextVoice(text, voicename);
            if (!result) result = await tryPrexzyvillaDirect(text);
            if (!result) result = await generateVoice(text, 'Leda').catch(() => null);
            if (!result) result = await tryGoogleTranslateTts(text);

            if (!result || !result.buffer || result.buffer.length < 512) {
                await bot.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {});
                return m.reply('TTS failed — all providers are currently unavailable. Try again shortly.');
            }

            try {
                await bot.sendMessage(m.chat, {
                    audio: result.buffer,
                    mimetype: result.mimetype || 'audio/mpeg',
                    ptt: result.mimetype?.includes('opus') || false,
                }, { quoted: m });
            } catch (e) {
                console.error('[tts] audio send failed:', e.message);
                await bot.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {});
                return m.reply('Generated audio but failed to send it. Try again.');
            }

            // Unreact on success
            await bot.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {});

        } catch (err) {
            console.error('[tts] error:', err.message);
            await bot.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {});
            m.reply('TTS failed. Try again later.');
        }
    },
};

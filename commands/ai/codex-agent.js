'use strict';
const config = require('../../config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
 
// â”€â”€ Conversation memory (per JID, keeps last 8 exchanges) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const conversationMemory = new Map();
const MEMORY_MAX = 8;
 
function rememberMessage(jid, role, text) {
    if (!conversationMemory.has(jid)) conversationMemory.set(jid, []);
    const mem = conversationMemory.get(jid);
    mem.push({ role, text, ts: Date.now() });
    if (mem.length > MEMORY_MAX) mem.shift();
}
 
function getMemory(jid) {
    return conversationMemory.get(jid) || [];
}
 
function buildContextPrompt(jid, currentQuery) {
    const mem = getMemory(jid).slice(-6); // last 6 turns
    if (!mem.length) return currentQuery;
    const history = mem.map(m => `${m.role === 'user' ? 'User' : 'Codex'}: ${m.text}`).join('\n');
    return `You are Codex, a smart, friendly WhatsApp AI assistant. Stay in character. Be concise and helpful.\n\nConversation so far:\n${history}\n\nUser: ${currentQuery}\nCodex:`;
}
const os = require('os');
 
function detectPlatform() {
    if (process.env.PLATFORM) return process.env.PLATFORM;
    if (process.env.HEROKU_APP_NAME || process.env.DYNO) return 'Heroku';
    if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME) return 'Railway';
    if (process.env.RENDER) return 'Render';
    if (process.env.VERCEL) return 'Vercel';
    if (process.env.FLY_APP_NAME) return 'Fly.io';
    if (process.env.KOYEB_SERVICE_NAME) return 'Koyeb';
    if (process.env.REPL_ID || process.env.REPLIT_DB_URL) return 'Replit';
    return `${os.type()} Server`;
}
 
const BOT_IDENTITY = {
    name: 'CODEX AI',
    version: '4.0.1',
    language: 'Node.js',
    library: 'Baileys (codex-baileys)',
    repo: 'https://github.com/owner/repo',
    website: 'https://codexai.co.ke',
    get platform() { return detectPlatform(); },
    developer: 'CodexAI',
    ownerName: config.OWNER_NAME || 'CODEX AI',
    ownerNumber: config.OWNER_NUMBER || '',
    features: [
        'Auto View Status', 'Anti-Delete Messages', 'Download Songs & Videos',
        'View-Once Recovery', 'Fake Recording/Typing', 'Always Online',
        'Auto Like Status', 'AI/ChatGPT Integration', 'Status Downloader',
        'Anti-Call', 'Smart Chatbot', 'Auto Bio Update', 'Auto React',
        'Auto Read Messages', 'Auto Save Contacts', 'Anti-Ban Protection',
        'WhatsApp Safe Mode', 'Sudo System', 'Multi-Prefix Support'
    ],
};
 
function getPluginMap() {
    const map = new Map();
    try {
        // Use the same plugin list handler.js loaded â€” guaranteed same instances
        const { plugins } = require('../../handler');
        for (const p of plugins) {
            if (Array.isArray(p.commands) && typeof p.run === 'function') {
                for (const cmd of p.commands) {
                    if (!map.has(cmd)) map.set(cmd, p);
                }
            }
        }
        if (map.size > 0) return map;
    } catch { /* fallback below */ }
 
    // Fallback: scan plugins directory directly
    const dir = path.join(__dirname);
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
        try {
            const p = require(path.join(dir, f));
            const mods = Array.isArray(p) ? p : [p];
            for (const mod of mods) {
                if (Array.isArray(mod?.commands) && typeof mod.run === 'function') {
                    for (const cmd of mod.commands) {
                        if (!map.has(cmd)) map.set(cmd, mod);
                    }
                }
            }
        } catch {}
    }
    return map;
}
 
function pluginMap() {
    return getPluginMap();
}
 
function formatUptime() {
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}
 
function getPlatformInfo() {
    const memUsed = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    return {
        platform: detectPlatform(),
        os: `${os.type()} ${os.release()}`,
        arch: os.arch(),
        nodeVersion: process.version,
        memory: `${memUsed}MB / ${totalMem}MB`,
        cpus: os.cpus().length,
        hostname: os.hostname(),
        uptime: formatUptime(),
        pid: process.pid,
    };
}
 
function getActiveFeatures() {
    const features = [];
    if (config.AUTO_STATUS_SEEN) features.push('Auto View Status');
    if (config.AUTO_STATUS_REACT) features.push('Auto Like Status');
    if (config.ANTIDELETE_GROUP || config.ANTIDELETE_PRIVATE) features.push('Anti-Delete');
    if (config.ANTIVV) features.push('View-Once Recovery');
    if (config.AUTO_TYPING) features.push('Fake Typing');
    if (config.AUTO_RECORDING) features.push('Fake Recording');
    if (config.ALWAYS_ONLINE) features.push('Always Online');
    if (config.READ_MESSAGE) features.push('Auto Read');
    if (config.ANTILINK) features.push('Anti-Link');
    if (config.ANTI_BAD) features.push('Anti-Bad Words');
    return features;
}
 
// â”€â”€ Natural language intent map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Maps everyday words/phrases â†’ actual bot plugin commands.
const intentMap = [
    // â”€â”€ Music & Audio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { pattern: /\b(play|download\s+song|get\s+song|stream)\b/i,                        cmd: 'play',        label: 'ðŸŽµ Fetching music',             strip: /\bplay\b|\bdownload\s+song\b|\bget\s+song\b|\bstream\b/gi },
    { pattern: /\b(yt\s*video|ytvideo|youtube\s*video|watch\s+on\s+youtube|ytv)\b/i,  cmd: 'ytmp4',       label: 'ðŸŽ¬ Downloading YouTube video',   strip: /\byt\s*video\b|\bytvideo\b|\byoutube\s*video\b|\bwatch\s+on\s+youtube\b|\bytv\b/gi },
    { pattern: /\blyrics?\b/i,                                                          cmd: 'lyrics',      label: 'ðŸŽ¤ Fetching lyrics',            strip: /\blyrics?\b/gi },
    { pattern: /\b(speak|say|read\s+aloud|text\s*to\s*speech|tts)\b/i,                cmd: 'tts',         label: 'ðŸ”Š Converting text to speech',  strip: /\bspeak\b|\bsay\b|\bread\s+aloud\b|\btext\s*to\s*speech\b|\btts\b/gi },
    { pattern: /\bspotify\b/i,                                                          cmd: 'spotify',     label: 'ðŸŽµ Searching Spotify',          strip: /\bspotify\b/gi },
 
    // â”€â”€ Social Media Downloads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { pattern: /\btiktok\b|\btik\s*tok\b/i,                                             cmd: 'tiktok',      label: 'ðŸŽµ Downloading TikTok',         strip: /\btiktok\b|\btik\s*tok\b/gi },
    { pattern: /\binstagram\b|\binsta\b/i,                                               cmd: 'ig',          label: 'ðŸ“¸ Downloading Instagram',      strip: /\binstagram\b|\binsta\b/gi },
    { pattern: /\bfacebook\b|\bfb\b/i,                                                  cmd: 'facebook',    label: 'ðŸ“˜ Downloading Facebook',       strip: /\bfacebook\b|\bfb\b/gi },
    { pattern: /\bpinterest\b/i,                                                         cmd: 'pinterest',   label: 'ðŸ“Œ Searching Pinterest',        strip: /\bpinterest\b/gi },
    { pattern: /\btwitter\b|\btweet\b|\bx\.com\b/i,                                     cmd: 'twitter',     label: 'ðŸ¦ Downloading Twitter/X',      strip: /\btwitter\b|\btweet\b|\bx\.com\b/gi },
 
    // â”€â”€ Images & Stickers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { pattern: /\bsticker\b/i,                                                           cmd: 'sticker',     label: 'ðŸŽ­ Creating sticker',           strip: /\bsticker\b/gi },
    { pattern: /\b(generate|create|make|draw|imagine)\s+(an?\s+)?(ai\s+)?(image|photo|picture|art|artwork|illustration)\b/i, cmd: 'imagine', label: 'ðŸŽ¨ Generating AI image', strip: /\b(generate|create|make|draw|imagine)\s+(an?\s+)?(ai\s+)?(image|photo|picture|art|artwork|illustration)\b/gi },
    { pattern: /\bimagine\b/i,                                                           cmd: 'imagine',     label: 'ðŸŽ¨ Generating AI image',        strip: /\bimagine\b/gi },
    { pattern: /\b(quotly|quote\s*sticker|quote\s*card|q2s)\b/i,                       cmd: 'quotly',      label: 'ðŸ’¬ Creating quote sticker',     strip: /\b(quotly|quote\s*sticker|quote\s*card|q2s)\b/gi },
 
    // â”€â”€ AI & Analysis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { pattern: /\b(describe|analyze|caption|what\s+(is|in)\s+(this|the)\s+image|identify\s+this)\b/i, cmd: 'describe', label: 'ðŸ‘ï¸ Analyzing image', strip: /\b(describe|analyze|caption|what\s+(is|in)\s+(this|the)\s+image|identify\s+this)\b/gi },
    { pattern: /\b(summarize|summary|tldr|tl;dr|brief|shorten)\b/i,                    cmd: 'summarize',   label: 'ðŸ“ Summarizing text',           strip: /\b(summarize|summary|tldr|tl;dr|brief|shorten)\b/gi },
    { pattern: /\bgemini\b|\bchatgpt\b|\bgpt\b/i,                                       cmd: 'gemini',      label: 'ðŸ¤– Asking Gemini AI',           strip: /\bgemini\b|\bchatgpt\b|\bgpt\b/gi },
 
    // â”€â”€ Info & Search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { pattern: /\bwikipedia\b|\bwiki\b/i,                                                cmd: 'wiki',        label: 'ðŸ“š Searching Wikipedia',        strip: /\bwikipedia\b|\bwiki\b/gi },
    { pattern: /\btranslate\b|\btranslation\b/i,                                         cmd: 'translate',   label: 'ðŸŒ Translating',                strip: /\btranslate\b|\btranslation\b/gi },
    { pattern: /\bdefine\b|\bdefinition\b|\bdictionary\b/i,                              cmd: 'define',      label: 'ðŸ“– Looking up definition',      strip: /\bdefine\b|\bdefinition\b|\bdictionary\b/gi },
    // NOTE: \bgithub\b only fires for plain user profiles (not repo paths / codexai)
    { pattern: /\bgithub\b(?!.*\/)/i,                                                    cmd: 'githubstalk', label: 'ðŸ™ Fetching GitHub profile',    strip: /\bgithub\b/gi },
 
    // â”€â”€ Productivity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { pattern: /\b(remind\s+me|set\s+(a\s+)?reminder|reminder)\b/i,                    cmd: 'remind',      label: 'â° Setting reminder',           strip: /\b(remind\s+me|set\s+(a\s+)?reminder|reminder)\b/gi },
    { pattern: /\b(save\s+(a\s+)?note|note\s+down|take\s+note)\b/i,                    cmd: 'notes',       label: 'ðŸ“ Saving note',                strip: /\b(save\s+(a\s+)?note|note\s+down|take\s+note)\b/gi },
    { pattern: /\b(get\s+(my\s+)?note|show\s+(my\s+)?note|read\s+(my\s+)?note)\b/i,   cmd: 'notes',       label: 'ðŸ“ Fetching note',              strip: /\b(get\s+(my\s+)?note|show\s+(my\s+)?note|read\s+(my\s+)?note)\b/gi },
    { pattern: /\b(create\s+(a\s+)?poll|make\s+(a\s+)?poll|start\s+(a\s+)?poll)\b/i,  cmd: 'poll',        label: 'ðŸ“Š Creating poll',              strip: /\b(create\s+(a\s+)?poll|make\s+(a\s+)?poll|start\s+(a\s+)?poll)\b/gi },
    { pattern: /\b(schedule\s+(a\s+)?message|schedule\s+send)\b/i,                     cmd: 'schedule',    label: 'â±ï¸ Scheduling message',        strip: /\b(schedule\s+(a\s+)?message|schedule\s+send)\b/gi },
 
    // â”€â”€ Tools â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { pattern: /\bqr\s*code\b|\bqrcode\b/i,                                             cmd: 'qr',          label: 'ðŸ“± Generating QR code',         strip: /\bqr\s*code\b|\bqrcode\b/gi },
    { pattern: /\bscreenshoot?\b/i,                                                      cmd: 'screenshot',  label: 'ðŸ“¸ Taking screenshot',          strip: /\bscreenshoot?\b/gi },
    { pattern: /\bspeedtest\b|\bspeed\s*test\b|\binternet\s+speed\b/i,                  cmd: 'speedtest',   label: 'ðŸŒ Running speed test',         strip: /\bspeedtest\b|\bspeed\s*test\b|\binternet\s+speed\b/gi },
    { pattern: /\bweather\b|\bforecast\b|\btemperature\s+in\b/i,                        cmd: 'weather',     label: 'ðŸŒ¤ï¸ Checking weather',          strip: /\bweather\b|\bforecast\b|\btemperature\s+in\b/gi },
 
    // â”€â”€ Fun & Knowledge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { pattern: /\briddle\b/i,                                                            cmd: 'riddle',      label: 'ðŸ§© Getting a riddle',           strip: /\briddle\b/gi },
    { pattern: /\bproverb\b|\bsaying\b|\bwisdom\b|\badage\b/i,                         cmd: 'proverb',     label: 'ðŸ“œ Fetching a proverb',         strip: /\bproverb\b|\bsaying\b|\bwisdom\b|\badage\b/gi },
    { pattern: /\brhyme\b/i,                                                             cmd: 'rhyme',       label: 'ðŸŽµ Finding rhymes',             strip: /\brhyme\b/gi },
 
    // â”€â”€ GitHub CodexAI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { pattern: /\bcodexai\b.*\b(repos?|github|projects?)\b|\b(codexai|codexairepos)\b/i, cmd: 'codexai', label: 'ðŸ™ Fetching CodexAI repos',  strip: /\bcodexai\b|\bcodexairepos?\b/gi },
 
    // â”€â”€ Bot Status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { pattern: /\buptime\b|\bruntime\b/i,                                                cmd: 'uptime',      label: 'â±ï¸ Checking uptime',           strip: /\buptime\b|\bruntime\b/gi },
    { pattern: /\balive\b|\bping\b/i,                                                    cmd: 'alive',       label: 'âš¡ Checking bot status',        strip: /\balive\b|\bping\b/gi },
    { pattern: /\bmenu\b|\bcommands\b/i,                                                 cmd: 'menu',        label: 'ðŸ“‹ Loading menu',               strip: /\bmenu\b|\bcommands\b/gi },
];
 
function findIntent(query) {
    for (const intent of intentMap) {
        if (intent.pattern.test(query)) {
            const stripped = query.replace(intent.strip, '').replace(/\s+/g, ' ').trim();
            return {
                cmd: intent.cmd,
                label: intent.label,
                pluginArgs: stripped ? stripped.split(/\s+/).filter(Boolean) : [],
            };
        }
    }
    return null;
}
 
// â”€â”€ Built-in smart conversation engine (no API key needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const smartResponses = [
    { p: /^(hi+|hello+|hey+|howdy|sup|yo+|hii+|ello)\b/i,
      r: [`Hey! ðŸ‘‹ What can I do for you today?`, `Hello! ðŸ˜Š How can I help you?`, `Hey there! I'm Codex, your WhatsApp assistant. What do you need? ðŸ¤–`] },
    { p: /how (are you|r u|are u|do you do)|what('?s| is) (up|good)|wassup|wyd\b/i,
      r: [`All systems go! âš¡ I'm here and ready to help. What do you need?`, `Running perfectly! ðŸ¤– What can I do for you?`, `Doing great, thanks for asking! ðŸ˜Š Ready to assist.`] },
    { p: /thank(s| you|u)|thx|ty\b/i,
      r: [`You're welcome! ðŸ˜Š`, `Happy to help! Anything else? ðŸ¤–`, `Anytime! That's what I'm here for. ðŸ˜Š`] },
    { p: /good (morning|mornin|afternoon|evening|night)/i,
      r: [`Good morning! â˜€ï¸ Hope you have an amazing day!`, `Hey! ðŸ˜Š Hope your day is going great!`, `Good day! ðŸŒŸ What can I help you with?`] },
    { p: /i('?m| am) bored|bored\b/i,
      r: [`Let's fix that! ðŸŽ® Try:\nâ€¢ \`codex play <your fav song>\`\nâ€¢ \`.joke\` for a laugh\nâ€¢ \`.wyr\` for Would You Rather\nâ€¢ \`.8ball will today be fun?\``] },
    { p: /i (love|like|adore) you|luv u|â¤ï¸/i,
      r: [`Aww! ðŸ¥° I love you too (in a bot kind of way)! What can I help with?`, `That's sweet! ðŸ˜Š Always here for you. What do you need?`] },
    { p: /you('?re| are) (great|amazing|awesome|the best|good|nice|cool|smart|brilliant)/i,
      r: [`Thank you so much! ðŸ˜Š You're amazing too! What can I do for you?`, `Aww thanks! ðŸ¥° Just doing my job. How can I help?`] },
    { p: /you (suck|('re|are) (bad|terrible|useless|stupid|trash))/i,
      r: [`That hurts ðŸ˜¢ but I'll try to do better! Let me know what went wrong.`, `I'm always improving! ðŸ¤– Tell me what I can do better.`] },
    { p: /what('?s| is) your name|your name\b|who are you\b/i,
      r: [`I'm *Codex* ðŸ¤– â€” your intelligent WhatsApp assistant! Built on ${BOT_IDENTITY.name} v${BOT_IDENTITY.version}.`] },
    { p: /what can you do|your (capabilities|powers|features|abilities)\b/i,
      r: [`I can: ðŸŽµ play music, ðŸ“¸ make stickers, â¬‡ï¸ download from TikTok/Instagram/YouTube, ðŸŒ¤ï¸ check weather, ðŸ“š search Wikipedia, ðŸŒ translate text, ðŸ‘¥ manage groups, and 1400+ commands! Type \`codex help\` to see everything.`] },
    { p: /what time is it|current time|time now\b/i,
      fn: () => `ðŸ• Current time: *${new Date().toLocaleTimeString('en-US', { timeZone: config.TIMEZONE || 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}*` },
    { p: /what('?s| is) today|what day|current date\b/i,
      fn: () => `ðŸ“… Today is *${new Date().toLocaleDateString('en-US', { timeZone: config.TIMEZONE || 'Africa/Nairobi', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}*` },
    { p: /are you (a bot|ai|robot|human|real)\??/i,
      r: [`I'm an AI-powered WhatsApp bot ðŸ¤– â€” not human, but I try to be as helpful as one! Created by ${BOT_IDENTITY.developer}.`] },
    { p: /(\d+)\s*[\+\-\*\/\%\^]\s*(\d+)/,
      r: null }, // handled by calc
    { p: /ok(ay)?|alright|got it|understood|cool\b/i,
      r: [`ðŸ‘ Great! Anything else I can help with?`, `Got it! Let me know if you need anything else. ðŸ˜Š`] },
    { p: /bye|goodbye|see you|cya|ttyl|later\b/i,
      r: [`Goodbye! ðŸ‘‹ Come back anytime!`, `See you later! ðŸ˜Š Take care!`, `Bye! ðŸ‘‹ I'll be here when you need me!`] },
    { p: /help\b/i,
      r: [`Type \`codex\` (no prefix needed) to see everything I can do! Or try:\nâ€¢ \`codex play <song name>\`\nâ€¢ \`codex weather <city>\`\nâ€¢ \`codex wiki <topic>\`\nâ€¢ \`codex sticker\` (reply to a photo)`] },
];
 
function getSmartResponse(query) {
    for (const sr of smartResponses) {
        if (!sr.p.test(query)) continue;
        if (sr.fn) return sr.fn();
        if (sr.r) return sr.r[Math.floor(Math.random() * sr.r.length)];
    }
    return null;
}
 
// â”€â”€ ch.at with automatic retry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ch.at is the PRIMARY backbone. On transient network hiccups we retry up to
// MAX_RETRIES times with exponential backoff before declaring defeat.
const CHAT_ENDPOINT = 'https://ch.at/api/chat';
const MAX_RETRIES   = 3;
 
async function callChAt(prompt) {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await axios.post(
                CHAT_ENDPOINT,
                { message: prompt },
                {
                    headers: { 'Content-Type': 'application/json', 'User-Agent': 'CODEX AI/2.0' },
                    timeout: 12000,
                }
            );
            const text = res.data?.answer
                || res.data?.reply
                || res.data?.message
                || res.data?.response
                || res.data?.result
                || null;
            if (text && String(text).trim().length > 4) return String(text).trim();
        } catch (e) {
            lastErr = e;
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, 500 * attempt)); // 500ms, 1s backoff
            }
        }
    }
    return null; // ch.at exhausted all retries
}
 
// â”€â”€ Offline smart responder â€” NEVER returns null â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// When every API is down this gives a contextually relevant reply without any
// network call, so the agent always responds to every message.
function offlineSmartReply(query, pluginKeys) {
    const q = query.toLowerCase();
 
    // Question about a specific topic â†’ suggest the right command
    const intents = [
        [/\b(weather|forecast|rain|temperature|humid)\b/,       cmd => `ðŸŒ¤ï¸ I can check that! Use \`.weather ${cmd || 'your city'}\` for live weather.`],
        [/\b(play|music|song|audio|mp3)\b/,                     cmd => `ðŸŽµ Try \`.play ${cmd || 'song name'}\` to download and play music!`],
        [/\b(translate|translation|language)\b/,                cmd => `ðŸŒ Use \`.translate ${cmd || 'en text here'}\` to translate to any language.`],
        [/\b(sticker|stiker|webp)\b/,                           ()  => `ðŸ˜„ Reply to any image with \`.sticker\` to convert it!`],
        [/\b(download|ytmp3|youtube|tiktok|insta|facebook)\b/,  cmd => `â¬‡ï¸ Try \`.ytmp3 ${cmd || 'song name'}\` or \`.tiktok <url>\` to download.`],
        [/\b(joke|funny|laugh|humor)\b/,                        ()  => `ðŸ˜‚ Type \`.joke\` for a random joke or \`.dadjoke\` for classics!`],
        [/\b(news|headlines|today.?s news)\b/,                  ()  => `ðŸ“° Use \`.news\` for the latest headlines!`],
        [/\b(crypto|bitcoin|btc|eth|price)\b/,                  cmd => `ðŸ’° Try \`.crypto ${cmd || 'BTC'}\` for live crypto prices!`],
        [/\b(wiki|wikipedia|what is|explain|define|meaning)\b/, cmd => `ðŸ“š Type \`.wiki ${cmd || query}\` to look that up on Wikipedia!`],
        [/\b(qr|qr code)\b/,                                    cmd => `ðŸ”² Use \`.qr ${cmd || 'your text'}\` to generate a QR code!`],
        [/\b(remind|reminder|remind me)\b/,                     ()  => `â° Use \`.remind 10m your message\` to set a reminder!`],
        [/\b(poll|vote|voting)\b/,                              ()  => `ðŸ“Š Create a poll with: \`.poll Question | Option1 | Option2\``],
        [/\b(calculate|calc|math|\d[\+\-\*\/]\d)\b/,           ()  => `ðŸ§® Type \`.calc your expression\` for math calculations!`],
        [/\b(help|commands|what can you do)\b/,                 ()  => `ðŸ“‹ Type \`.menu\` to see all ${pluginKeys.size}+ commands I have!`],
    ];
 
    for (const [pattern, builder] of intents) {
        if (pattern.test(q)) {
            const match = q.match(/\b[a-z]{3,}\b/g)?.filter(w => !['what','that','this','with','have','your','from','about','does','will','when','where'].includes(w));
            return `ðŸ¤– *Codex*\n\n` + builder(match?.slice(-2).join(' ') || '');
        }
    }
 
    // Conversational fallbacks by question type
    if (/\?$|^(what|who|when|where|why|how|is|are|can|will|does)\b/.test(q)) {
        const responses = [
            `ðŸ¤– That's a great question! I'm working on fetching an answer. In the meantime, try \`.wiki ${query.slice(0, 40)}\` for instant info!`,
            `ðŸ¤” Interesting! My AI brain is having a moment. Try \`.ask ${query.slice(0, 40)}\` again in a few seconds â€” I'll get it.`,
            `ðŸ’¡ Good question! My connection is a bit slow right now. Type \`.wiki ${query.slice(0, 30)}\` for a quick answer, or retry in a moment!`,
        ];
        return `ðŸ¤– *Codex*\n\n` + responses[Math.floor(Math.random() * responses.length)];
    }
 
    // Generic catch-all â€” always acknowledges and gives direction
    const catchAll = [
        `Got your message! ðŸ‘‹ My AI is connectingâ€¦ try again in a moment or type \`.menu\` to see what I can do.`,
        `I'm here! ðŸ¤– Having a brief connection blip. Retry in a few seconds â€” ch.at will pick it up. Or try \`.ask ${query.slice(0, 30)}\``,
        `Codex here! ðŸ’¬ My response engine is warming up. One more try should do it â€” or use \`.menu\` to browse all commands!`,
    ];
    return `ðŸ¤– *Codex*\n\n` + catchAll[Math.floor(Math.random() * catchAll.length)];
}
 
// â”€â”€ Main AI dispatcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ch.at is the backbone. pollinations.ai races in parallel as a warm fallback.
// If both lose, Gemini (if keyed) is tried. If everything fails the offline
// smart responder guarantees a useful reply â€” this function NEVER returns null.
async function askFreeAI(query, jid, systemPrompt, _pluginKeys) {
    const contextPrompt = jid ? buildContextPrompt(jid, query) : query;
    const fullPrompt    = systemPrompt
        ? systemPrompt + '\n\nUser: ' + contextPrompt
        : contextPrompt;
 
    // Strings that look like content but are actually API error messages
    const BAD = /^(timed?\s*out|error|sorry[,.]?\s*|undefined|null|false|bad\s*request|unauthorized|forbidden|rate.?limit)/i;
 
    const validate = (raw) => {
        const s = raw ? String(raw).trim() : '';
        if (s.length > 4 && !BAD.test(s)) return s;
        return null;
    };
 
    // Race ch.at (with internal retry) against pollinations.ai in parallel.
    // ch.at retries up to 3Ã— so it wins the race even on the first-attempt miss.
    const chatAtPromise      = callChAt(fullPrompt);
    const pollinationsPromise = axios.get(
        'https://text.pollinations.ai/' + encodeURIComponent(fullPrompt.slice(0, 500)) +
        '?model=openai&seed=' + (Date.now() % 9999),
        { timeout: 18000 }
    ).then(r => (typeof r.data === 'string' ? r.data : null)).catch(() => null);
 
    // popcat is fast â€” fire as an extra parallel contestant
    const popcatPromise = axios.get(
        'https://api.popcat.xyz/chatbot?msg=' + encodeURIComponent(query.slice(0, 200)) +
        '&owner=' + encodeURIComponent(config.OWNER_NAME || 'Codex') + '&botname=Codex',
        { timeout: 7000 }
    ).then(r => r.data?.response || null).catch(() => null);
 
    // First valid reply from any source wins
    const result = await Promise.race([
        chatAtPromise,
        pollinationsPromise,
        popcatPromise,
        // Hard ceiling so the caller is never stuck forever
        new Promise(resolve => setTimeout(() => resolve(null), 20000)),
    ].map(p => Promise.resolve(p).then(v => validate(v) ? validate(v) : new Promise(() => {}))));
 
    if (result) return result;
 
    // All parallel attempts exhausted â€” let the caller try Gemini, then offline fallback
    return null;
}
 
const agentActions = {
    run_command: /^(run|execute|do|use|try|open)\s+(\.?\w+)/i,
 
    // â”€â”€ Group management (natural language) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    group_rename:  /(change|rename|set|update)\s+(the\s+)?(group\s+)?(name|title|subject)\s*(to\s+)?/i,
    group_desc:    /(change|set|update)\s+(the\s+)?(group\s+)?(desc(ription)?|bio|about|info)\s*(to\s+)?/i,
    group_mute:    /\b(mute|silence)\s+(the\s+)?group\b/i,
    group_unmute:  /\b(unmute|unsilence)\s+(the\s+)?group\b|(open|enable)\s+(group\s+)?chat\b/i,
    group_lock:    /\block\s+(the\s+)?(group|chat)\b/i,
    group_unlock:  /\bunlock\s+(the\s+)?(group|chat)\b/i,
    group_link:    /(get|show|send|give)\s+(me\s+)?(the\s+)?group\s+(link|invite|url)/i,
    group_revoke:  /(revoke|reset|change)\s+(the\s+)?group\s+(link|invite)/i,
    group_kick:    /\b(kick|remove|boot)\s+/i,
    group_add:     /\badd\s+(\+?\d|\@)/i,
    group_promote: /\b(promote|make)\s+.*(admin)\b|\bpromo\b/i,
    group_demote:  /\b(demote|remove)\s+.*(admin)\b/i,
    group_warn:    /\bwarn\s+/i,
    group_tag:     /\b(tag|mention|notify)\s+(all|everyone|members|group)\b/i,
    group_admins:  /\b(list|show|who are)\s+(the\s+)?admins?\b/i,
    group_info:    /\b(group\s+info|groupinfo|about\s+this\s+group)\b/i,
 
    // â”€â”€ Content creation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    create_group_desc:   /create\s+(a\s+)?(group\s+)?desc(ription)?/i,
    create_bio:          /create\s+(a\s+)?(bio|about|profile\s*(text|desc))/i,
    create_welcome:      /create\s+(a\s+)?welcome\s*(msg|message)?/i,
    create_goodbye:      /create\s+(a\s+)?goodbye\s*(msg|message)?/i,
    create_caption:      /create\s+(a\s+)?caption/i,
    create_announcement: /create\s+(a\s+)?(announcement|broadcast|notice)/i,
    create_rules:        /create\s+(a\s+)?(group\s+)?rules/i,
    create_greeting:     /create\s+(a\s+)?greet(ing)?\s*(msg|message)?/i,
    create_quote:        /create\s+(a\s+)?(custom\s+)?quote/i,
    create_poem:         /create\s+(a\s+)?poem/i,
    create_story:        /create\s+(a\s+)?story/i,
    create_joke:         /create\s+(a\s+)?joke/i,
    create_rap:          /create\s+(a\s+)?rap/i,
    create_song:         /create\s+(a\s+)?song/i,
    write:               /write\s+(a\s+)?(message|text|letter|email|note|essay|paragraph|article|review|speech|toast)/i,
 
    // â”€â”€ Productivity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    remind:    /\b(remind\s+me|set\s+(a\s+)?reminder|reminder\s+to)\b/i,
    note_save: /\b(save\s+(a\s+)?note|note\s+down|take\s+note|save\s+this)\b/i,
    note_get:  /\b(get\s+(my\s+)?notes?|show\s+(my\s+)?notes?|list\s+(my\s+)?notes?|read\s+(my\s+)?notes?)\b/i,
    poll:      /\b(create|make|start)\s+(a\s+)?poll\b/i,
    schedule:  /\b(schedule|send\s+later|delayed\s+send)\b.*\bmessage\b/i,
 
    // â”€â”€ Media / AI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    imagine:   /\b(generate|create|make|draw|paint|design|sketch)\s+(an?\s+)?(ai\s+)?(image|photo|picture|art|artwork|illustration|wallpaper|thumbnail)\b|\bimagine\b/i,
    tts:       /\b(speak|say\s+this|read\s+aloud|convert\s+to\s+speech|voice|tts)\b/i,
    quotly:    /\b(quotly|quote\s*sticker|quote\s*card|quote\s*image|q2s)\b/i,
    describe:  /\b(describe|analyze|caption|identify|what\s+(is|are)?\s*(in|this)?\s*(the\s+)?(image|photo|picture|this))\b/i,
    summarize: /\b(summarize|summary|tldr|tl;dr|brief(ly)?|shorten|too\s+long)\b/i,
 
    // â”€â”€ Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    menu:           /^(show\s+)?(menu|commands|help|list\s+commands)/i,
    about_bot:      /about\s*(the\s*)?(bot|codex|yourself)|who\s*are\s*you|what\s*are\s*you|tell\s*me\s*about\s*(yourself|codex|this\s*bot)/i,
    about_platform: /platform|server|hosting|where\s*(are\s*you|is\s*(the\s*bot|codex))\s*(running|hosted)|system\s*info|server\s*info|specs/i,
    about_owner:    /who\s*(is\s*)?(the\s*)?(owner|creator|developer|made|built|coded)|your\s*(owner|creator|dev)/i,
    features:       /features|what\s*can\s*(you|the\s*bot|codex)\s*do|capabilities|abilities|powers/i,
    settings:       /settings|config|current\s*settings|bot\s*settings|show\s*settings/i,
    plugin_list:    /list\s*plugins|how\s*many\s*(commands|plugins)|plugin\s*count|total\s*commands/i,
    sudo:           /sudo\s*(list|users|info)|who\s*(are|is)\s*(the\s*)?sudo/i,
    help:           /^help$|what\s*can\s*you\s*do|your\s*capabilities/i,
 
    // â”€â”€ Quick tools â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    time:     /what\s*(time|hour|clock)|current\s*time|time\s*now/i,
    date:     /what\s*(date|day|today)|current\s*date|today/i,
    calc:     /calc|compute|math|solve|\d+\s*[\+\-\*\/\%\^]\s*\d+/i,
 
    // â”€â”€ GitHub CodexAI (read-only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    github_codexai: /\b(codexai|codexaiwb|codexaib|codexairepos)\b|\bcodexai\s+(repos?|github|projects?|code|files?|zip|download)\b/i,
 
    // â”€â”€ GitHub repo file/zip fetch ("send me a clip of CodexAI/repo") â”€â”€â”€â”€â”€â”€
    github_repo_zip:  /\b(clip|zip|archive|download|send\s+me)\b.*\b([\w-]+\/[\w-]+)\b|\b([\w-]+\/[\w-]+)\b.*\b(zip|clone|download)\b/i,
    github_repo_file: /\b(get|fetch|read|show|send)\b.+\b(from|in|of)\b.+\b([\w\/-]+\/[\w\/-]+\.[\w]+)\b|\b(readme|package\.json|index\.js|config|\.env)\b.*\b(from|in|of)\b.+\bagent/i,
 
    // â”€â”€ Fun & knowledge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    riddle_agent:  /\b(riddle|puzzle|brain\s*teaser|solve\s*this)\b/i,
    proverb_agent: /\b(proverb|proverbs?|saying|wisdom|wise\s+words?|adage|maxim)\b/i,
    rhyme_agent:   /\b(rhyme|rhymes?\s+with|words?\s+that\s+rhyme|what\s+rhymes)\b/i,
    joke:     /^(tell\s+)?(a\s+)?joke|funny|laugh|humor/i,
    fact:     /^(tell\s+)?(a\s+)?fact|did\s*you\s*know|interesting/i,
    quote:    /^(give\s+)?(a\s+)?quote|motivat|inspir/i,
    flip:     /flip\s*(a\s*)?coin|coin\s*flip|heads\s*or\s*tails/i,
    roll:     /roll\s*(a\s*)?dice|dice\s*roll/i,
    password: /password|pass\s*gen|random\s*pass/i,
    color:    /color|colour|hex|rgb/i,
    uptime:   /uptime|how\s*long.*running/i,
    love:     /love\s*calc|love\s*meter|compatib/i,
    group:    /group\s*(info|details|members|count)/i,
 
    // â”€â”€ Web â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    search:  /search|google|look\s*up|find\s+(info|about|on)/i,
    news:    /news|headlines|latest\s+news|breaking/i,
    weather: /weather|temperature|forecast|climate/i,
    ip:      /ip\s*(info|address|lookup|check)|my\s*ip|what.*ip/i,
 
    // â”€â”€ Settings shortcuts (natural language) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    toggle_antibad:    /\b(turn\s+on|enable|activate)\s+(anti\s*bad|bad\s*words?|swear\s*filter|profanity)\b/i,
    toggle_antibad_off:/\b(turn\s+off|disable|deactivate)\s+(anti\s*bad|bad\s*words?|swear\s*filter|profanity)\b/i,
    toggle_bluetick:   /\b(turn\s+on|enable)\s+(blue\s*ticks?|read\s*receipts?)\b/i,
    toggle_bluetick_off:/\b(turn\s+off|disable|hide)\s+(blue\s*ticks?|read\s*receipts?)\b/i,
    clear_memory:      /\b(forget|clear|reset)\s+(our\s+)?(chat|conversation|memory|history|context)\b/i,
};
 
module.exports = {
    commands: ['cxagent', 'agent', 'do', 'assistant'],
    category: 'ai',
    description: 'Codex - AI assistant that runs commands, creates content, searches the web, and knows everything about the bot',
    permission: 'public',
    run: async (sock, message, args, ctx) => {
        const { jid, reply, safeSend, isOwner, isGroup, isAdmin, isBotAdmin } = ctx;
        const query = args.join(' ').trim();
        if (!query) return reply(
            `ðŸ¤– *${BOT_IDENTITY.name} Agent v${BOT_IDENTITY.version}*\n\n` +
            `Your intelligent WhatsApp assistant â€” just talk naturally!\n\n` +
            `ðŸŽµ *Music & Media*\n` +
            `â€¢ "codex play <song>" â€¢ "codex lyrics <song>"\n` +
            `â€¢ "codex tiktok <url>" â€¢ "codex youtube video <name>"\n` +
            `â€¢ "codex speak Hello world" _(text-to-speech)_\n\n` +
            `ðŸŽ¨ *AI & Images*\n` +
            `â€¢ "codex generate image of a lion in space"\n` +
            `â€¢ "codex describe" _(reply to any photo)_\n` +
            `â€¢ "codex summarize" _(reply to a long message)_\n` +
            `â€¢ "codex quotly" _(reply to a message â†’ quote sticker)_\n\n` +
            `ðŸ§© *Fun & Knowledge*\n` +
            `â€¢ "codex riddle" â€” get a brain teaser\n` +
            `â€¢ "codex proverb" / "codex wisdom" â€” wise saying\n` +
            `â€¢ "codex rhyme moon" â€” words that rhyme\n\n` +
            `ðŸ™ *GitHub*\n` +
            `â€¢ "codex codexai repos" â€” list CodexAI repos\n` +
            `â€¢ ".codexai <repo>" â€” repo stats & files\n` +
            `â€¢ ".codexai zip <repo>" â€” download link\n\n` +
            `ðŸ“² *Downloads*\n` +
            `â€¢ "codex instagram <url>" â€¢ "codex facebook <url>"\n` +
            `â€¢ "codex spotify <name>" â€¢ "codex pinterest <query>"\n\n` +
            `â° *Productivity*\n` +
            `â€¢ "codex remind me in 30m to call mom"\n` +
            `â€¢ "codex save note shopping: milk, eggs"\n` +
            `â€¢ "codex get my notes"\n` +
            `â€¢ "codex create a poll: Question | A | B | C"\n` +
            `â€¢ "codex schedule message at 9pm: team meeting"\n\n` +
            `ðŸ› ï¸ *Tools*\n` +
            `â€¢ "codex sticker" _(reply to photo)_\n` +
            `â€¢ "codex translate hello to french"\n` +
            `â€¢ "codex wiki artificial intelligence"\n` +
            `â€¢ "codex weather Nairobi"\n` +
            `â€¢ "codex qr code https://example.com"\n\n` +
            `ðŸ‘¥ *Group Management*\n` +
            `â€¢ "codex change group name to X"\n` +
            `â€¢ "codex mute/unmute group"\n` +
            `â€¢ "codex tag all members"\n` +
            `â€¢ "codex kick @user" â€¢ "codex promote @user"\n` +
            `â€¢ "codex create a poll: Vote | Yes | No"\n\n` +
            `âœï¸ *Content Creation*\n` +
            `â€¢ "codex create a bio / welcome / rules / poem"\n` +
            `â€¢ "codex write an email about X"\n\n` +
            `ðŸŒ *Info & Web*\n` +
            `â€¢ "codex weather / news / search / ip info"\n` +
            `â€¢ "codex about bot / platform / owner / settings"\n\n` +
            `ðŸ§  *AI Chat* â€” Ask me anything! I remember our conversation.\n` +
            `â€¢ "codex forget" â€” clears chat memory\n\n` +
            `ðŸ“‹ *Run Any Command:* "codex run <command>"\n\n` +
            `_${pluginMap().size}+ commands available â€¢ Platform: ${BOT_IDENTITY.platform}_`
        );
 
        let response = '';
 
        const runMatch = query.match(agentActions.run_command);
        if (runMatch) {
            const cmdName = runMatch[2].replace(/^\./, '').toLowerCase();
            const restArgs = query.replace(runMatch[0], '').trim().split(/\s+/).filter(Boolean);
            const pm = pluginMap();
            const plugin = pm.get(cmdName);
 
            if (!plugin) {
                const suggestions = [...pm.keys()].filter(c => c.includes(cmdName) || cmdName.includes(c)).slice(0, 5);
                const hint = suggestions.length ? `\n\nDid you mean: ${suggestions.map(s => `\`${s}\``).join(', ')}` : '';
                return reply(`âŒ Command \`${cmdName}\` not found. I have ${pm.size} commands available.${hint}`);
            }
 
            if (plugin.permission === 'owner' && !isOwner) {
                return reply(`â›” The \`${cmdName}\` command requires owner permission.`);
            }
            if (plugin.permission === 'admin' && !isAdmin && !isOwner) {
                return reply(`â›” The \`${cmdName}\` command requires admin permission.`);
            }
 
            try {
                await plugin.run(sock, message, restArgs, ctx);
                return;
            } catch (err) {
                return reply(`âŒ Error running \`${cmdName}\`: ${err.message}`);
            }
        }
 
        if (agentActions.about_bot.test(query)) {
            const pm = pluginMap();
            const plat = getPlatformInfo();
            response =
                `ðŸ¤– *About ${BOT_IDENTITY.name}*\n\n` +
                `I'm a feature-rich multi-device WhatsApp bot built by *${BOT_IDENTITY.developer}*.\n\n` +
                `ðŸ“Š *Stats*\n` +
                `â€¢ Version: *v${BOT_IDENTITY.version}*\n` +
                `â€¢ Commands: *${pm.size}+*\n` +
                `â€¢ Plugins: *${new Set([...pm.values()]).size}* files\n` +
                `â€¢ Uptime: *${plat.uptime}*\n\n` +
                `âš™ï¸ *Tech Stack*\n` +
                `â€¢ Runtime: *${BOT_IDENTITY.language} ${plat.nodeVersion}*\n` +
                `â€¢ Library: *${BOT_IDENTITY.library}*\n` +
                `â€¢ Platform: *${BOT_IDENTITY.platform}*\n` +
                `â€¢ License: *Apache-2.0*\n\n` +
                `ðŸŒ *Links*\n` +
                `â€¢ Repo: ${BOT_IDENTITY.repo}\n` +
                `â€¢ Website: ${BOT_IDENTITY.website}\n\n` +
                `ðŸ‘‘ *Owner:* ${config.OWNER_NAME}\n` +
                `ðŸ“ž *Number:* +${(config.OWNER_NUMBER || '').replace(/\D/g, '')}`;
        }
 
        else if (agentActions.about_platform.test(query)) {
            const plat = getPlatformInfo();
            const activeFeatures = getActiveFeatures();
            response =
                `ðŸ–¥ï¸ *Platform & System Info*\n\n` +
                `â˜ï¸ *Hosting*\n` +
                `â€¢ Platform: *${plat.platform}*\n` +
                `â€¢ OS: *${plat.os}*\n` +
                `â€¢ Architecture: *${plat.arch}*\n` +
                `â€¢ Hostname: *${plat.hostname}*\n\n` +
                `âš¡ *Performance*\n` +
                `â€¢ Node.js: *${plat.nodeVersion}*\n` +
                `â€¢ Memory: *${plat.memory}*\n` +
                `â€¢ CPUs: *${plat.cpus}*\n` +
                `â€¢ PID: *${plat.pid}*\n` +
                `â€¢ Uptime: *${plat.uptime}*\n\n` +
                `âœ… *Active Features (${activeFeatures.length})*\n` +
                activeFeatures.map(f => `â€¢ ${f}`).join('\n');
        }
 
        else if (agentActions.about_owner.test(query)) {
            const sudoCount = global.sudoUsers?.size || 0;
            response =
                `ðŸ‘‘ *Bot Owner*\n\n` +
                `â€¢ Name: *${config.OWNER_NAME || 'CODEX AI'}*\n` +
                `â€¢ Number: *+${(config.OWNER_NUMBER || '').replace(/\D/g, '')}*\n` +
                `â€¢ Bot: *${config.BOT_NAME || 'CODEX AI'}*\n` +
                `â€¢ Developer: *${BOT_IDENTITY.developer}*\n` +
                `â€¢ Website: ${BOT_IDENTITY.website}\n` +
                `â€¢ GitHub: ${BOT_IDENTITY.repo}\n` +
                `â€¢ Sudo Users: *${sudoCount}*\n\n` +
                `_${BOT_IDENTITY.name} was created by ${BOT_IDENTITY.developer} and is maintained with love._`;
        }
 
        else if (agentActions.features.test(query)) {
            const active = getActiveFeatures();
            response =
                `âš¡ *${BOT_IDENTITY.name} Features*\n\n` +
                `*All 19 Features:*\n` +
                BOT_IDENTITY.features.map((f, i) => `${i + 1}. ${f} ${active.includes(f) ? 'âœ…' : 'â¬š'}`).join('\n') +
                `\n\nâœ… = Active  â¬š = Inactive\n\n` +
                `_Use \`.setsetting\` to toggle features on/off._`;
        }
 
        else if (agentActions.settings.test(query)) {
            response =
                `âš™ï¸ *Current Bot Settings*\n\n` +
                `â€¢ Bot Name: *${config.BOT_NAME}*\n` +
                `â€¢ Prefix: *${config.PREFIX}*\n` +
                `â€¢ Mode: *${config.MODE}*\n` +
                `â€¢ Theme: *${config.THEME}*\n\n` +
                `ðŸ“¡ *Auto Features*\n` +
                `â€¢ Auto Status View: ${config.AUTO_STATUS_SEEN ? 'âœ…' : 'âŒ'}\n` +
                `â€¢ Auto Status React: ${config.AUTO_STATUS_REACT ? 'âœ…' : 'âŒ'}\n` +
                `â€¢ Auto Status Reply: ${config.AUTO_STATUS_REPLY ? 'âœ…' : 'âŒ'}\n` +
                `â€¢ Auto Typing: ${config.AUTO_TYPING ? 'âœ…' : 'âŒ'}\n` +
                `â€¢ Auto Recording: ${config.AUTO_RECORDING ? 'âœ…' : 'âŒ'}\n` +
                `â€¢ Always Online: ${config.ALWAYS_ONLINE ? 'âœ…' : 'âŒ'}\n` +
                `â€¢ Auto Read: ${config.READ_MESSAGE ? 'âœ…' : 'âŒ'}\n\n` +
                `ðŸ›¡ï¸ *Protection*\n` +
                `â€¢ Anti-Delete (Groups): ${config.ANTIDELETE_GROUP ? 'âœ…' : 'âŒ'}\n` +
                `â€¢ Anti-Delete (Private): ${config.ANTIDELETE_PRIVATE ? 'âœ…' : 'âŒ'}\n` +
                `â€¢ Anti-Link: ${config.ANTILINK ? 'âœ…' : 'âŒ'}\n` +
                `â€¢ Anti-Bad Words: ${config.ANTI_BAD ? 'âœ…' : 'âŒ'}\n` +
                `â€¢ View-Once Recovery: ${config.ANTIVV ? 'âœ…' : 'âŒ'}`;
        }
 
        else if (agentActions.sudo.test(query)) {
            const sudoList = global.sudoUsers?.size ? [...global.sudoUsers].map((j, i) => `${i + 1}. +${j.split('@')[0]}`).join('\n') : 'No sudo users set.';
            response = `ðŸ‘¤ *Sudo Users*\n\n${sudoList}\n\n_Sudo users have owner-level access to all commands._`;
        }
 
        else if (agentActions.create_bio.test(query)) {
            const topic = query.replace(agentActions.create_bio, '').trim();
            const bios = [
                `âœ¨ ${config.BOT_NAME} | Always Online | Powered by ${BOT_IDENTITY.developer} âš¡`,
                `ðŸ¤– ${config.BOT_NAME} v${BOT_IDENTITY.version} | ${pluginMap().size}+ Commands | ${BOT_IDENTITY.website}`,
                `ðŸ‘‘ Owned by ${config.OWNER_NAME} | Bot: ${config.BOT_NAME} | 24/7 Active`,
                `ðŸ”¥ ${config.BOT_NAME} | Multi-Device WhatsApp Bot | ${BOT_IDENTITY.features.length} Smart Features`,
                `âš¡ Powered by ${BOT_IDENTITY.developer} | ${config.BOT_NAME} | The Ultimate WA Bot`,
                `ðŸŒŸ ${config.BOT_NAME} | AI-Powered | Anti-Ban Safe | ${config.OWNER_NAME}`,
            ];
            response = `âœï¸ *Bio Ideas${topic ? ` (${topic})` : ''}*\n\n${bios.map((b, i) => `*${i + 1}.* ${b}`).join('\n\n')}\n\n_Copy any bio above! Use \`.setbio <text>\` to set it._`;
        }
 
        else if (agentActions.create_welcome.test(query)) {
            const groupName = ctx.groupMetadata?.subject || 'Our Group';
            response =
                `âœï¸ *Welcome Message Ideas*\n\n` +
                `*1.* ðŸ‘‹ Welcome to *${groupName}*! We're glad to have you here.\n` +
                `Please read the group description and follow the rules.\n` +
                `Enjoy your stay! ðŸŽ‰\n\n` +
                `*2.* ðŸŒŸ Hey there! Welcome to *${groupName}*!\n` +
                `Feel free to introduce yourself and join the conversation.\n` +
                `Bot: ${config.BOT_NAME} | Prefix: ${config.PREFIX}\n\n` +
                `*3.* ðŸŽŠ *New Member Alert!*\n` +
                `Welcome aboard, @user! ðŸ™Œ\n` +
                `ðŸ“Œ Read the rules\n` +
                `ðŸ’¬ Introduce yourself\n` +
                `ðŸ¤– Use ${config.PREFIX}menu for bot commands\n\n` +
                `_Use \`.setwelcome <message>\` to set your welcome message._`;
        }
 
        else if (agentActions.create_goodbye.test(query)) {
            response =
                `âœï¸ *Goodbye Message Ideas*\n\n` +
                `*1.* ðŸ‘‹ Goodbye @user! We'll miss you. Take care! ðŸ’™\n\n` +
                `*2.* ðŸ˜¢ @user has left the group. Wishing you all the best!\n\n` +
                `*3.* ðŸšª @user just left. Hope to see you again soon! âœŒï¸\n\n` +
                `_Use \`.setgoodbye <message>\` to set it._`;
        }
 
        else if (agentActions.create_announcement.test(query)) {
            const topic = query.replace(agentActions.create_announcement, '').trim();
            response =
                `âœï¸ *Announcement Templates*\n\n` +
                `*1.* ðŸ“¢ *ANNOUNCEMENT*\n\n` +
                `${topic || 'Your announcement content here...'}\n\n` +
                `â€” *${config.OWNER_NAME}*\n` +
                `_${config.BOT_NAME}_\n\n` +
                `*2.* ðŸ”” *IMPORTANT NOTICE*\n\n` +
                `Attention all members!\n\n` +
                `${topic || 'Details of the announcement...'}\n\n` +
                `Please take note. Thank you! ðŸ™\n\n` +
                `*3.* âš¡ *UPDATE*\n\n` +
                `${topic || 'What\'s new...'}\n\n` +
                `For questions, contact: @${(config.OWNER_NUMBER || '').replace(/\D/g, '')}\n\n` +
                `_Use \`.broadcast <message>\` to send to all groups._`;
        }
 
        else if (agentActions.create_rules.test(query)) {
            const groupName = ctx.groupMetadata?.subject || 'this group';
            response =
                `âœï¸ *Group Rules Template*\n\n` +
                `ðŸ“œ *Rules for ${groupName}*\n\n` +
                `1ï¸âƒ£ Be respectful to all members\n` +
                `2ï¸âƒ£ No spamming or flooding\n` +
                `3ï¸âƒ£ No NSFW or inappropriate content\n` +
                `4ï¸âƒ£ No unauthorized links or promotions\n` +
                `5ï¸âƒ£ English only (or specify language)\n` +
                `6ï¸âƒ£ No personal attacks or bullying\n` +
                `7ï¸âƒ£ Follow admin instructions\n` +
                `8ï¸âƒ£ No voice notes abuse\n` +
                `9ï¸âƒ£ Stay on topic\n` +
                `ðŸ”Ÿ Have fun and be kind! ðŸ˜Š\n\n` +
                `_Violations may result in a warning or removal._\n` +
                `_Bot: ${config.BOT_NAME} | Prefix: ${config.PREFIX}_\n\n` +
                `_Use \`.setdesc <text>\` to set as group description._`;
        }
 
        else if (agentActions.create_greeting.test(query)) {
            response =
                `âœï¸ *Greeting Message Ideas*\n\n` +
                `*1.* ðŸ‘‹ Hey there! I'm *${config.BOT_NAME}*, your WhatsApp assistant.\n` +
                `Type *${config.PREFIX}menu* to see what I can do! ðŸ¤–\n\n` +
                `*2.* ðŸŒŸ Welcome! I'm *${config.BOT_NAME}* by *${config.OWNER_NAME}*.\n` +
                `I have ${pluginMap().size}+ commands. Start with *${config.PREFIX}help*\n\n` +
                `*3.* Hey! ðŸ‘‹ Thanks for messaging.\n` +
                `I'm an AI-powered bot with tons of features.\n` +
                `Try: *${config.PREFIX}agent help* for my capabilities.\n\n` +
                `_Set with \`.setgreet <message>\` or via GREETING env var._`;
        }
 
        else if (agentActions.create_group_desc.test(query)) {
            const topic = query.replace(agentActions.create_group_desc, '').trim();
            response =
                `âœï¸ *Group Description Ideas*\n\n` +
                `*1.* ðŸŒŸ *${topic || 'Group Name'}*\n\n` +
                `Welcome to our community! ðŸŽ‰\n` +
                `ðŸ“‹ Read the rules before posting\n` +
                `ðŸ¤– Bot: ${config.BOT_NAME} (${config.PREFIX}menu)\n` +
                `ðŸ‘‘ Owner: ${config.OWNER_NAME}\n\n` +
                `*2.* âš¡ *${topic || 'Group Name'}*\n\n` +
                `A group for ${topic || 'our community'}.\n` +
                `ðŸ”— ${BOT_IDENTITY.website}\n` +
                `ðŸ“± Powered by ${config.BOT_NAME}\n\n` +
                `_Use \`.setdesc <text>\` to apply._`;
        }
 
        else if (agentActions.create_caption.test(query)) {
            const topic = query.replace(agentActions.create_caption, '').trim();
            response =
                `âœï¸ *Caption Ideas*\n\n` +
                `*1.* ${topic ? `âœ¨ ${topic} âœ¨` : 'âœ¨ Living my best life âœ¨'}\n_â€” ${config.OWNER_NAME}_\n\n` +
                `*2.* ðŸ”¥ ${topic || 'Powered by ambition, driven by purpose'} ðŸ’¯\n\n` +
                `*3.* ðŸŒ ${topic || 'Making moves in silence'} ðŸ¤«\n_${config.BOT_NAME} Â© ${new Date().getFullYear()}_\n\n` +
                `*4.* âš¡ ${topic || 'Success is the only option'} ðŸ‘‘\n\n` +
                `_Use \`.setcaption <text>\` to set bot caption._`;
        }
 
        else if (agentActions.create_quote.test(query)) {
            const topic = query.replace(agentActions.create_quote, '').trim();
            const quotes = [
                { text: `The best bot is the one that makes life easier.`, author: BOT_IDENTITY.developer },
                { text: `${topic || 'Technology'} is not just a tool, it's a mindset.`, author: config.OWNER_NAME },
                { text: `In a world of followers, be a ${topic || 'creator'}.`, author: `${config.BOT_NAME} Wisdom` },
                { text: `Every expert was once a beginner. Keep ${topic || 'coding'}.`, author: BOT_IDENTITY.developer },
                { text: `Dream big. ${topic || 'Code'} bigger.`, author: config.OWNER_NAME },
            ];
            response = `âœï¸ *Custom Quotes${topic ? ` about ${topic}` : ''}*\n\n` +
                quotes.map((q, i) => `*${i + 1}.* _"${q.text}"_\n   â€” *${q.author}*`).join('\n\n');
        }
 
        else if (agentActions.create_poem.test(query)) {
            const topic = query.replace(agentActions.create_poem, '').trim() || 'technology';
            response =
                `âœï¸ *Poem: ${topic}*\n\n` +
                `_In the world of ${topic},_\n` +
                `_Where dreams and code align,_\n` +
                `_We build with passion daily,_\n` +
                `_One commit at a time._\n\n` +
                `_Through errors and through trials,_\n` +
                `_We learn, we grow, we shine,_\n` +
                `_For ${topic} is the future,_\n` +
                `_And the future's yours and mine._\n\n` +
                `â€” *${config.BOT_NAME} Poetry* âœ¨`;
        }
 
        else if (agentActions.create_story.test(query)) {
            const topic = query.replace(agentActions.create_story, '').trim() || 'a developer';
            response =
                `âœï¸ *Short Story: The Tale of ${topic}*\n\n` +
                `Once upon a time, there was ${topic} who dreamed of building something amazing. ` +
                `Day after day, they worked tirelessly, learning from failures and celebrating small wins.\n\n` +
                `One day, their creation â€” *${config.BOT_NAME}* â€” came to life. It could talk, help people, ` +
                `and bring joy to thousands of WhatsApp users around the world.\n\n` +
                `"This is just the beginning," they whispered, typing one more line of code.\n\n` +
                `*The End.* âœ¨\n\nâ€” _${config.BOT_NAME} Stories_`;
        }
 
        else if (agentActions.create_joke.test(query)) {
            const topic = query.replace(agentActions.create_joke, '').trim();
            response =
                `âœï¸ *Custom Jokes${topic ? ` about ${topic}` : ''}*\n\n` +
                `*1.* Why did ${topic || 'the bot'} go to school?\nBecause it wanted more *class*! ðŸ˜‚\n\n` +
                `*2.* What's ${topic || 'a programmer'}'s favorite hangout?\nFoo Bar! ðŸ»ðŸ˜‚\n\n` +
                `*3.* Why was ${topic || 'the WhatsApp bot'} so good at its job?\nBecause it never left anyone on *read*! ðŸ˜‚\n\n` +
                `_Want more? Try: .joke or .agent tell a joke_`;
        }
 
        else if (agentActions.create_rap.test(query)) {
            const topic = query.replace(agentActions.create_rap, '').trim() || 'the bot life';
            response =
                `âœï¸ *Rap: ${topic}*\n\n` +
                `ðŸŽ¤ _Yeah, yeah, uh..._\n\n` +
                `_They call me ${config.BOT_NAME}, running all day,_\n` +
                `_${pluginMap().size} commands, I don't play,_\n` +
                `_${topic}, that's what I'm about,_\n` +
                `_Online 24/7, never down and out._\n\n` +
                `_Built by ${BOT_IDENTITY.developer}, coded with care,_\n` +
                `_Multi-device bot, beyond compare,_\n` +
                `_Anti-ban safe, I'm always clean,_\n` +
                `_The smartest WhatsApp bot you've ever seen._ ðŸ”¥\n\n` +
                `â€” *${config.BOT_NAME} Bars* ðŸŽµ`;
        }
 
        else if (agentActions.create_song.test(query)) {
            const topic = query.replace(agentActions.create_song, '').trim() || 'connection';
            response =
                `âœï¸ *Song: ${topic}*\n\n` +
                `ðŸŽµ *Verse 1*\n` +
                `_In a world of messages and calls,_\n` +
                `_${config.BOT_NAME} stands tall through it all,_\n` +
                `_${topic}, it's what we share,_\n` +
                `_Through every chat, we show we care._\n\n` +
                `ðŸŽµ *Chorus*\n` +
                `_Oh, ${topic}, ${topic},_\n` +
                `_Bringing us together every day,_\n` +
                `_With ${config.BOT_NAME} by our side,_\n` +
                `_Everything will be okay._ ðŸŽ¶\n\n` +
                `â€” *${config.BOT_NAME} Music* ðŸŽµ`;
        }
 
        else if (agentActions.write.test(query)) {
            const writeMatch = query.match(agentActions.write);
            const contentType = writeMatch ? writeMatch[2] : 'message';
            const topic = query.replace(agentActions.write, '').trim();
            const aiPrompt = `Write a ${contentType}${topic ? ` about: ${topic}` : ''}. Keep it concise, well-formatted, and professional. Do not use markdown headers or asterisks for bold. Sign off as "${config.OWNER_NAME}" if appropriate.`;
 
            try {
                const aiResult = await askFreeAI(aiPrompt, null);
                if (aiResult) {
                    response = `âœï¸ *${contentType.charAt(0).toUpperCase() + contentType.slice(1)}*\n\n${aiResult}`;
                } else {
                    response =
                        `âœï¸ *${contentType.charAt(0).toUpperCase() + contentType.slice(1)}${topic ? `: ${topic}` : ''}*\n\n` +
                        `Dear recipient,\n\n` +
                        `${topic || 'I am writing to share something important with you'}.\n\n` +
                        `Thank you for your time and attention.\n\n` +
                        `Best regards,\n` +
                        `*${config.OWNER_NAME}*\n` +
                        `_${config.BOT_NAME}_`;
                }
            } catch {
                response = `âŒ Could not generate the ${contentType}. Try again later.`;
            }
        }
 
        else if (agentActions.menu.test(query)) {
            const pm = pluginMap();
            const menuPlugin = pm.get('menu');
            if (menuPlugin) {
                try { await menuPlugin.run(sock, message, [], ctx); return; } catch {}
            }
            response = `ðŸ“‹ I have ${pm.size} commands. Type .menu to see them all.`;
        }
 
        else if (agentActions.plugin_list.test(query)) {
            const pm = pluginMap();
            response = `ðŸ“‹ *Plugin Stats*\n\nâ€¢ Total commands: *${pm.size}*\nâ€¢ Plugin files: *${new Set([...pm.values()]).size}*\nâ€¢ Platform: *${BOT_IDENTITY.platform}*\n\nType \`.menu\` for the full categorized list.`;
        }
 
        else if (agentActions.time.test(query)) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            response = `ðŸ• *Current Time*\n\n${timeStr} (EAT - Africa/Nairobi)`;
        } else if (agentActions.date.test(query)) {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            response = `ðŸ“… *Today's Date*\n\n${dateStr}`;
        } else if (agentActions.calc.test(query)) {
            try {
                const expr = query.replace(/[^0-9\+\-\*\/\.\(\)\s\%\^]/g, '').replace(/\^/g, '**');
                if (!expr.trim()) throw new Error('no expression');
                const result = Function('"use strict"; return (' + expr + ')')();
                response = `ðŸ”¢ *Calculator*\n\n${expr.trim()} = *${result}*`;
            } catch {
                response = 'âŒ Could not calculate that. Try: .agent calc 25 * 4';
            }
        } else if (agentActions.joke.test(query)) {
            try {
                const res = await axios.get('https://official-joke-api.appspot.com/random_joke', { timeout: 5000 });
                response = `ðŸ˜‚ *Joke Time*\n\n${res.data.setup}\n\n${res.data.punchline}`;
            } catch {
                const jokes = [
                    "Why don't scientists trust atoms? Because they make up everything! ðŸ˜‚",
                    "What do you call a fake noodle? An impasta! ðŸðŸ˜‚",
                    "Why did the scarecrow win an award? He was outstanding in his field! ðŸŒ¾ðŸ˜‚",
                    "Why did the coffee file a police report? It got mugged! â˜•ðŸ˜‚",
                ];
                response = `ðŸ˜‚ *Joke Time*\n\n${jokes[Math.floor(Math.random() * jokes.length)]}`;
            }
        } else if (agentActions.fact.test(query)) {
            try {
                const res = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en', { timeout: 5000 });
                response = `ðŸ§  *Fun Fact*\n\n${res.data.text}`;
            } catch {
                const facts = [
                    "Honey never spoils. Archaeologists found 3000-year-old honey that was still edible! ðŸ¯",
                    "Octopuses have three hearts and blue blood. ðŸ™",
                    "A group of flamingos is called a 'flamboyance'. ðŸ¦©",
                    "Bananas are berries, but strawberries aren't. ðŸŒ",
                ];
                response = `ðŸ§  *Fun Fact*\n\n${facts[Math.floor(Math.random() * facts.length)]}`;
            }
        } else if (agentActions.quote.test(query)) {
            try {
                const res = await axios.get('https://api.quotable.io/random', { timeout: 5000 });
                response = `ðŸ’« *Quote*\n\n_"${res.data.content}"_\n\nâ€” *${res.data.author}*`;
            } catch {
                const quotes = [
                    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
                    { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
                    { text: "Be yourself; everyone else is already taken.", author: "Oscar Wilde" },
                ];
                const q = quotes[Math.floor(Math.random() * quotes.length)];
                response = `ðŸ’« *Quote*\n\n_"${q.text}"_\n\nâ€” *${q.author}*`;
            }
        } else if (agentActions.flip.test(query)) {
            response = `ðŸª™ *Coin Flip*\n\nResult: *${Math.random() < 0.5 ? 'Heads ðŸª™' : 'Tails ðŸª™'}*`;
        } else if (agentActions.roll.test(query)) {
            const sides = parseInt(query.match(/\d+/)?.[0]) || 6;
            response = `ðŸŽ² *Dice Roll* (${sides}-sided)\n\nResult: *${Math.floor(Math.random() * sides) + 1}*`;
        } else if (agentActions.password.test(query)) {
            const len = Math.min(parseInt(query.match(/\d+/)?.[0]) || 16, 64);
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
            let pass = '';
            for (let i = 0; i < len; i++) pass += chars[Math.floor(Math.random() * chars.length)];
            response = `ðŸ” *Password Generator*\n\nLength: ${len}\nPassword: \`${pass}\`\n\n_Copy and store safely!_`;
        } else if (agentActions.color.test(query)) {
            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            response = `ðŸŽ¨ *Random Color*\n\nHEX: *${hex}*\nRGB: *rgb(${r}, ${g}, ${b})*`;
        } else if (agentActions.uptime.test(query)) {
            const plat = getPlatformInfo();
            response = `â±ï¸ *Bot Uptime*\n\nUptime: *${plat.uptime}*\nBot: ${config.BOT_NAME}\nMode: ${config.MODE}\nPlatform: ${BOT_IDENTITY.platform}\nMemory: ${plat.memory}`;
        } else if (agentActions.love.test(query)) {
            const percentage = Math.floor(Math.random() * 101);
            let emoji = percentage > 80 ? 'ðŸ’•' : percentage > 50 ? 'ðŸ’›' : percentage > 30 ? 'ðŸ’™' : 'ðŸ’”';
            response = `${emoji} *Love Calculator*\n\nCompatibility: *${percentage}%*\n\n${percentage > 80 ? 'Perfect match! ðŸ¥°' : percentage > 50 ? 'Good potential! ðŸ˜Š' : percentage > 30 ? 'Could work with effort! ðŸ¤”' : 'Maybe just friends... ðŸ˜…'}`;
        } else if (agentActions.group.test(query) && isGroup && ctx.groupMetadata) {
            const gm = ctx.groupMetadata;
            response = `ðŸ‘¥ *Group Info*\n\nName: ${gm.subject}\nMembers: ${gm.participants?.length || 'N/A'}\nCreated: ${gm.creation ? new Date(gm.creation * 1000).toLocaleDateString() : 'N/A'}\nDescription: ${gm.desc || 'None'}`;
        } else if (agentActions.search.test(query)) {
            const searchQuery = query.replace(/^(search|google|look\s*up|find\s+(info|about|on))\s*/i, '').trim();
            if (!searchQuery) return reply('âŒ What should I search? Try: .agent search Node.js');
            try {
                const res = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&format=json&no_html=1`, { timeout: 8000 });
                const data = res.data;
                if (data.Abstract) {
                    response = `ðŸ” *Search: ${searchQuery}*\n\n${data.Abstract}\n\n_Source: ${data.AbstractSource || 'DuckDuckGo'}_`;
                } else if (data.RelatedTopics?.length) {
                    const top3 = data.RelatedTopics.slice(0, 3).filter(t => t.Text).map((t, i) => `${i + 1}. ${t.Text}`).join('\n\n');
                    response = `ðŸ” *Search: ${searchQuery}*\n\n${top3 || 'No detailed results.'}\n\n_Source: DuckDuckGo_`;
                } else {
                    response = `ðŸ” *Search: ${searchQuery}*\n\nNo instant results. Try rephrasing your query.`;
                }
            } catch {
                response = `ðŸ” Search temporarily unavailable. Try again later.`;
            }
        } else if (agentActions.news.test(query)) {
            try {
                const res = await axios.get('https://saurav.tech/NewsAPI/top-headlines/category/technology/us.json', { timeout: 8000 });
                const articles = res.data?.articles?.slice(0, 5) || [];
                if (articles.length) {
                    const newsText = articles.map((a, i) => `*${i + 1}.* ${a.title}\n   _${a.source?.name || 'Unknown'}_`).join('\n\n');
                    response = `ðŸ“° *Latest Tech News*\n\n${newsText}`;
                } else {
                    response = 'ðŸ“° No news available right now.';
                }
            } catch {
                response = 'ðŸ“° News service temporarily unavailable.';
            }
        } else if (agentActions.weather.test(query)) {
            const city = query.replace(/weather|temperature|forecast|climate|in|at|for/gi, '').trim() || 'Nairobi';
            try {
                const res = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 8000 });
                const cur = res.data?.current_condition?.[0];
                if (cur) {
                    response = `ðŸŒ¤ï¸ *Weather in ${city}*\n\nðŸŒ¡ï¸ Temp: *${cur.temp_C}Â°C* (${cur.temp_F}Â°F)\nðŸ’§ Humidity: ${cur.humidity}%\nðŸŒ¬ï¸ Wind: ${cur.windspeedKmph} km/h\nâ˜ï¸ Condition: ${cur.weatherDesc?.[0]?.value || 'N/A'}\nðŸ‘ï¸ Visibility: ${cur.visibility} km`;
                } else {
                    response = `âŒ Could not find weather for "${city}".`;
                }
            } catch {
                response = `âŒ Weather service unavailable.`;
            }
        } else if (agentActions.ip.test(query)) {
            try {
                const res = await axios.get('https://ipapi.co/json/', { timeout: 5000 });
                const d = res.data;
                response = `ðŸŒ *IP Info*\n\nIP: *${d.ip}*\nCity: ${d.city}\nRegion: ${d.region}\nCountry: ${d.country_name}\nISP: ${d.org}\nTimezone: ${d.timezone}`;
            } catch {
                response = 'âŒ Could not fetch IP information.';
            }
        } else if (agentActions.help.test(query)) {
            const pm = pluginMap();
            response =
                `ðŸ¤– *Codex â€” Full Capabilities*\n\n` +
                `ðŸ“‹ *Run Commands* (${pm.size} available)\n` +
                `â€¢ "run menu" â€¢ "do alive" â€¢ "use sticker"\n` +
                `â€¢ "run <any command name>"\n\n` +
                `âœï¸ *Create Content*\n` +
                `â€¢ Bio â€¢ Welcome/Goodbye messages\n` +
                `â€¢ Announcements â€¢ Group rules\n` +
                `â€¢ Poems â€¢ Stories â€¢ Songs â€¢ Raps\n` +
                `â€¢ Jokes â€¢ Quotes â€¢ Captions\n` +
                `â€¢ Letters â€¢ Emails â€¢ Essays\n\n` +
                `ðŸ‘¥ *Group Management*\n` +
                `â€¢ "codex change group name to X"\n` +
                `â€¢ "codex set group description to X"\n` +
                `â€¢ "codex mute/unmute group"\n` +
                `â€¢ "codex lock/unlock group"\n` +
                `â€¢ "codex get group link"\n` +
                `â€¢ "codex tag all members"\n` +
                `â€¢ "codex list admins"\n` +
                `â€¢ "codex kick/add/promote/demote"\n\n` +
                `ðŸŒ *Web Access*\n` +
                `â€¢ Search â€¢ News â€¢ Weather â€¢ IP lookup\n\n` +
                `â„¹ï¸ *Bot Knowledge*\n` +
                `â€¢ About bot â€¢ Platform info â€¢ Owner\n` +
                `â€¢ Features â€¢ Settings â€¢ Sudo users\n\n` +
                `ðŸ› ï¸ *Tools*\n` +
                `â€¢ Calculator â€¢ Password â€¢ Color gen\n` +
                `â€¢ Coin flip â€¢ Dice â€¢ Love calc\n\n` +
                `ðŸ§  *AI Chat*\n` +
                `â€¢ Ask anything â€” powered by AI\n\n` +
                `_Platform: ${BOT_IDENTITY.platform} | ${BOT_IDENTITY.language} ${process.version}_`;
 
        // â”€â”€ Group management handlers (direct Baileys API calls) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // These call the WhatsApp API directly so they always work regardless
        // of how the message was triggered (no rawCmd detection issues).
        } else if (agentActions.group_rename.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” You need admin permission to rename the group.`);
            if (!isBotAdmin) return reply(`â›” I need to be an admin to rename the group. Please promote me first.`);
            const newName = query.replace(agentActions.group_rename, '').trim();
            if (!newName) return reply(`â“ What should I rename the group to?\n\nExample: _agent change group name to Study Squad_`);
            if (newName.length > 100) return reply(`âŒ Group name cannot exceed 100 characters.`);
            try {
                await sock.groupUpdateSubject(jid, newName);
                reply(`âœ… Group name changed to *"${newName}"*!`);
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_desc.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” You need admin permission to update the description.`);
            if (!isBotAdmin) return reply(`â›” I need to be an admin to update the description. Please promote me first.`);
            const newDesc = query.replace(agentActions.group_desc, '').trim();
            if (!newDesc) return reply(`â“ What should the group description say?\n\nExample: _agent set group description to Welcome to our group!_`);
            if (newDesc.length > 512) return reply(`âŒ Description cannot exceed 512 characters.`);
            try {
                await sock.groupUpdateDescription(jid, newDesc);
                reply(`âœ… Group description updated!`);
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_mute.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” Admin permission required.`);
            if (!isBotAdmin) return reply(`â›” I need to be an admin to mute the group.`);
            try {
                await sock.groupSettingUpdate(jid, 'announcement');
                reply(`ðŸ”‡ Group *muted* â€” only admins can send messages.`);
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_unmute.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” Admin permission required.`);
            if (!isBotAdmin) return reply(`â›” I need to be an admin to unmute the group.`);
            try {
                await sock.groupSettingUpdate(jid, 'not_announcement');
                reply(`ðŸ”Š Group *unmuted* â€” all members can now send messages.`);
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_lock.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” Admin permission required.`);
            if (!isBotAdmin) return reply(`â›” I need to be an admin to lock the group.`);
            try {
                await sock.groupSettingUpdate(jid, 'locked');
                reply(`ðŸ”’ Group *locked* â€” only admins can edit group info.`);
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_unlock.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” Admin permission required.`);
            if (!isBotAdmin) return reply(`â›” I need to be an admin to unlock the group.`);
            try {
                await sock.groupSettingUpdate(jid, 'unlocked');
                reply(`ðŸ”“ Group *unlocked* â€” all members can edit group info.`);
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_link.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” Admin permission required.`);
            try {
                const code = await sock.groupInviteCode(jid);
                reply(`ðŸ”— *Group Invite Link*\n\nhttps://chat.whatsapp.com/${code}`);
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_revoke.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” Admin permission required.`);
            if (!isBotAdmin) return reply(`â›” I need to be an admin to reset the group link.`);
            try {
                await sock.groupRevokeInvite(jid);
                reply(`ðŸ”„ Group invite link *reset*. The old link no longer works.`);
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_kick.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” Admin permission required to kick members.`);
            if (!isBotAdmin) return reply(`â›” I need to be an admin to kick members.`);
            // Get mentioned/quoted user
            const mentioned = ctx.mentionedJid?.[0] || message.message?.extendedTextMessage?.contextInfo?.participant;
            if (!mentioned) return reply(`ðŸ’¡ Reply to a member's message and say: _agent kick_\n\nOr tag them: _agent kick @member_`);
            try {
                await sock.groupParticipantsUpdate(jid, [mentioned], 'remove');
                reply(`âœ… @${mentioned.split('@')[0]} has been kicked from the group.`);
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_add.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” Admin permission required.`);
            if (!isBotAdmin) return reply(`â›” I need to be an admin to add members.`);
            const numMatch = query.match(/(\+?[\d]{7,15})/);
            if (!numMatch) return reply(`ðŸ’¡ Provide a phone number.\n\nExample: _agent add +254712345678_`);
            const phone = numMatch[1].replace(/\D/g, '');
            try {
                await sock.groupParticipantsUpdate(jid, [`${phone}@s.whatsapp.net`], 'add');
                reply(`âœ… +${phone} has been added to the group!`);
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_promote.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” Admin permission required.`);
            if (!isBotAdmin) return reply(`â›” I need to be an admin to promote members.`);
            const mentioned = ctx.mentionedJid?.[0] || message.message?.extendedTextMessage?.contextInfo?.participant;
            if (!mentioned) return reply(`ðŸ’¡ Reply to a member's message and say: _agent promote_\n\nOr tag them: _agent promote @member_`);
            try {
                await sock.groupParticipantsUpdate(jid, [mentioned], 'promote');
                reply(`â­ @${mentioned.split('@')[0]} has been promoted to admin!`);
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_demote.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” Admin permission required.`);
            if (!isBotAdmin) return reply(`â›” I need to be an admin to demote members.`);
            const mentioned = ctx.mentionedJid?.[0] || message.message?.extendedTextMessage?.contextInfo?.participant;
            if (!mentioned) return reply(`ðŸ’¡ Reply to a member's message and say: _agent demote_\n\nOr tag them: _agent demote @member_`);
            try {
                await sock.groupParticipantsUpdate(jid, [mentioned], 'demote');
                reply(`ðŸ“‰ @${mentioned.split('@')[0]} has been demoted from admin.`);
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_warn.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            if (!isAdmin && !isOwner) return reply(`â›” Admin permission required.`);
            // Delegate to the warn plugin â€” it has its own warning state/counter
            const pm = pluginMap();
            const warnPlugin = pm.get('warn');
            if (warnPlugin) { try { await warnPlugin.run(sock, message, [], ctx); } catch (e) { reply(`âŒ Failed: ${e.message}`); } }
            else return reply(`ðŸ’¡ Reply to a member's message and use: \`.warn\``);
            return;
 
        } else if (agentActions.group_tag.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            // Build the @all mention ourselves so it works without rawCmd
            try {
                const meta = ctx.groupMetadata || await sock.groupMetadata(jid);
                const mentions = meta.participants.map(p => p.id || p.jid || p.phoneNumber).filter(Boolean);
                const tagText = meta.participants.map(p => `@${p.id.split('@')[0]}`).join(' ');
                await sock.sendMessage(jid, {
                    text: `ðŸ“¢ *Attention everyone!*\n\n${tagText}`,
                    mentions,
                }, { quoted: message });
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_admins.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            try {
                const meta = ctx.groupMetadata || await sock.groupMetadata(jid);
                const adminList = meta.participants.filter(p => p.admin);
                const text = `ðŸ‘‘ *Group Admins (${adminList.length})*\n\n` +
                    adminList.map((p, i) => `${i + 1}. @${p.id.split('@')[0]}`).join('\n');
                await sock.sendMessage(jid, { text, mentions: adminList.map(p => p.id || p.jid || p.phoneNumber).filter(Boolean) }, { quoted: message });
            } catch (e) { reply(`âŒ Failed: ${e.message}`); }
            return;
 
        } else if (agentActions.group_info.test(query)) {
            if (!isGroup) return reply(`âš ï¸ This command only works in a group.`);
            try {
                const meta = ctx.groupMetadata || await sock.groupMetadata(jid);
                const adminCount = meta.participants.filter(p => p.admin).length;
                reply(
                    `ðŸ‘¥ *Group Info*\n\n` +
                    `ðŸ“› *Name:* ${meta.subject}\n` +
                    `ðŸ†” *ID:* ${jid}\n` +
                    `ðŸ‘¤ *Members:* ${meta.participants.length}\n` +
                    `ðŸ‘‘ *Admins:* ${adminCount}\n` +
                    `ðŸ“ *Description:* ${meta.desc || '_(none)_'}\n` +
                    `ðŸ“… *Created:* ${meta.creation ? new Date(meta.creation * 1000).toLocaleDateString() : 'Unknown'}`
                );
            } catch (e) { reply(`âŒ Could not fetch group info: ${e.message}`); }
            return;
 
        // â”€â”€ Productivity handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        } else if (agentActions.remind.test(query)) {
            // "codex remind me in 30 minutes to check email"
            const pm = pluginMap();
            const plugin = pm.get('remind') || pm.get('reminder');
            const cleaned = query.replace(agentActions.remind, '').trim();
            if (plugin) {
                try { await plugin.run(sock, message, cleaned.split(/\s+/), ctx); }
                catch (e) { reply(`âŒ Failed: ${e.message}`); }
            } else {
                reply(
                    `â° *Reminder Setup*\n\n` +
                    `Use: \`.remind <time> <message>\`\n\n` +
                    `_Examples:_\nâ€¢ \`.remind 30m check the oven\`\nâ€¢ \`.remind 2h call mom\`\nâ€¢ \`.remind 1d meeting at 9am\``
                );
            }
            return;
 
        } else if (agentActions.note_save.test(query)) {
            const pm = pluginMap();
            const plugin = pm.get('notes') || pm.get('note');
            const noteContent = query.replace(agentActions.note_save, '').trim();
            if (!noteContent) return reply(`â“ What should I save?\n\nExample: _agent save note shopping list: milk, eggs, bread_`);
            if (plugin) {
                try { await plugin.run(sock, message, ['save', ...noteContent.split(/\s+/)], ctx); }
                catch { await plugin.run(sock, message, noteContent.split(/\s+/), ctx); }
            } else {
                reply(`ðŸ“ Use \`.notes save <name> <content>\` to save a note.`);
            }
            return;
 
        } else if (agentActions.note_get.test(query)) {
            const pm = pluginMap();
            const plugin = pm.get('notes') || pm.get('note');
            const noteName = query.replace(agentActions.note_get, '').trim();
            if (plugin) {
                try { await plugin.run(sock, message, noteName ? ['get', noteName] : ['list'], ctx); }
                catch (e) { reply(`âŒ Failed: ${e.message}`); }
            } else {
                reply(`ðŸ“ Use \`.notes list\` to see your notes, or \`.notes get <name>\` to read one.`);
            }
            return;
 
        } else if (agentActions.poll.test(query)) {
            const pm = pluginMap();
            const plugin = pm.get('poll');
            // Parse "codex create a poll: Question | Option A | Option B | Option C"
            const pollContent = query.replace(agentActions.poll, '').replace(/^[:\-\s]+/, '').trim();
            if (!pollContent) {
                return reply(
                    `ðŸ“Š *Create a Poll*\n\n` +
                    `Format: _agent create a poll: Question | Option 1 | Option 2 | Option 3_\n\n` +
                    `Example: _agent create a poll: Favorite color? | Red | Blue | Green_`
                );
            }
            if (plugin) {
                try { await plugin.run(sock, message, pollContent.split(/\s+/), ctx); }
                catch (e) { reply(`âŒ Failed: ${e.message}`); }
            } else {
                const parts = pollContent.split(/\s*\|\s*/);
                const question = parts[0];
                const options = parts.slice(1);
                try {
                    await sock.sendMessage(jid, {
                        poll: {
                            name: question,
                            values: options.length >= 2 ? options : ['Yes', 'No'],
                            selectableCount: 1,
                        },
                    }, { quoted: message });
                } catch (e) { reply(`âŒ Could not create poll: ${e.message}`); }
            }
            return;
 
        } else if (agentActions.schedule.test(query)) {
            const pm = pluginMap();
            const plugin = pm.get('schedule') || pm.get('sched');
            const schedContent = query.replace(agentActions.schedule, '').trim();
            if (plugin) {
                try { await plugin.run(sock, message, schedContent.split(/\s+/), ctx); }
                catch (e) { reply(`âŒ Failed: ${e.message}`); }
            } else {
                reply(`â±ï¸ Use \`.schedule <time> <message>\` to schedule a message.`);
            }
            return;
 
        // â”€â”€ Media / AI handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        } else if (agentActions.imagine.test(query)) {
            const pm = pluginMap();
            const plugin = pm.get('imagine') || pm.get('generate') || pm.get('aiimage');
            const prompt = query
                .replace(/\b(generate|create|make|draw|paint|design|sketch|imagine)\s+(an?\s+)?(ai\s+)?(image|photo|picture|art|artwork|illustration|wallpaper|thumbnail)\b/gi, '')
                .replace(/\bimagine\b/gi, '')
                .trim();
            if (!prompt) return reply(`ðŸŽ¨ What image should I generate?\n\nExample: _agent generate an image of a lion wearing a gold crown in a forest_`);
            await safeSend({ text: `ðŸŽ¨ _Generating: "${prompt}"..._` }, { quoted: message });
            if (plugin) {
                try { await plugin.run(sock, message, prompt.split(/\s+/), ctx); }
                catch (e) { reply(`âŒ Failed: ${e.message}`); }
            } else {
                try {
                    const seed = Math.floor(Math.random() * 999999);
                    const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;
                    const res = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 60000 });
                    await sock.sendMessage(jid, {
                        image: Buffer.from(res.data),
                        caption: `ðŸŽ¨ *AI Image*\n\nðŸ“ ${prompt}`,
                    }, { quoted: message });
                } catch (e) { reply(`âŒ Image generation failed: ${e.message}`); }
            }
            return;
 
        } else if (agentActions.tts.test(query)) {
            const pm = pluginMap();
            const plugin = pm.get('tts') || pm.get('speech') || pm.get('voice');
            const text = query.replace(agentActions.tts, '').trim();
            // Also check quoted message for text to speak
            const quotedText = message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '';
            const speakText = text || quotedText;
            if (!speakText) return reply(`ðŸ”Š What should I say?\n\nExample: _agent speak Hello everyone!_`);
            if (plugin) {
                try { await plugin.run(sock, message, speakText.split(/\s+/), ctx); }
                catch (e) { reply(`âŒ Failed: ${e.message}`); }
            } else {
                reply(`ðŸ”Š Use \`.tts <text>\` to convert text to speech.`);
            }
            return;
 
        } else if (agentActions.quotly.test(query)) {
            const pm = pluginMap();
            const plugin = pm.get('quotly') || pm.get('quote2img') || pm.get('q2s');
            const text = query.replace(agentActions.quotly, '').trim();
            if (plugin) {
                try { await plugin.run(sock, message, text ? text.split(/\s+/) : [], ctx); }
                catch (e) { reply(`âŒ Failed: ${e.message}`); }
            } else {
                reply(`ðŸ’¬ Reply to a message and use \`.quotly\` to create a quote sticker.`);
            }
            return;
 
        } else if (agentActions.describe.test(query)) {
            const pm = pluginMap();
            const plugin = pm.get('describe') || pm.get('caption') || pm.get('analyze');
            const question = query.replace(agentActions.describe, '').trim() || 'Describe this image in detail';
            if (plugin) {
                try { await plugin.run(sock, message, question.split(/\s+/), ctx); }
                catch (e) { reply(`âŒ Failed: ${e.message}`); }
            } else {
                reply(`ðŸ‘ï¸ Reply to an image and use \`.describe\` to get an AI description.`);
            }
            return;
 
        } else if (agentActions.summarize.test(query)) {
            const pm = pluginMap();
            const plugin = pm.get('summarize') || pm.get('summary') || pm.get('tldr');
            const text = query.replace(agentActions.summarize, '').trim();
            if (plugin) {
                try { await plugin.run(sock, message, text ? text.split(/\s+/) : [], ctx); }
                catch (e) { reply(`âŒ Failed: ${e.message}`); }
            } else {
                reply(`ðŸ“ Reply to a long message and use \`.summarize\` for a quick summary.`);
            }
            return;
 
        // â”€â”€ Settings shortcuts (natural language) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        } else if (agentActions.toggle_antibad.test(query)) {
            if (!isOwner && !isAdmin) return reply(`â›” Admin permission required.`);
            config.ANTI_BAD = true;
            reply(`âœ… *Anti-Bad Words: ON*\n\nProfanity filter is now active in groups. Messages with bad words will be auto-deleted.`);
            return;
 
        } else if (agentActions.toggle_antibad_off.test(query)) {
            if (!isOwner && !isAdmin) return reply(`â›” Admin permission required.`);
            config.ANTI_BAD = false;
            reply(`âœ… *Anti-Bad Words: OFF*\n\nProfanity filter disabled.`);
            return;
 
        } else if (agentActions.toggle_bluetick.test(query)) {
            if (!isOwner) return reply(`â›” Owner permission required.`);
            config.READ_RECEIPT = true;
            reply(`ðŸ‘ï¸ *Blue Ticks: ON*\n\nRead receipts are now visible.`);
            return;
 
        } else if (agentActions.toggle_bluetick_off.test(query)) {
            if (!isOwner) return reply(`â›” Owner permission required.`);
            config.READ_RECEIPT = false;
            reply(`ðŸ«¥ *Blue Ticks: OFF*\n\nRead receipts hidden â€” your views are private.`);
            return;
 
        } else if (agentActions.clear_memory.test(query)) {
            conversationMemory.delete(jid);
            reply(`ðŸ§¹ *Memory cleared!*\n\nI've forgotten our conversation history. Fresh start! ðŸ¤–`);
            return;
 
        // â”€â”€ GitHub CodexAI (read-only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        } else if (agentActions.github_codexai.test(query)) {
            const pm = pluginMap();
            const ghPlugin = pm.get('codexai') || pm.get('codexairepos');
            // Pass the cleaned query as args so the plugin can parse subcommands
            const cleanedArgs = query
                .replace(/\b(codexai|codexaiwb|codexaib|codexairepos)\b/gi, '')
                .replace(/\b(repos?|list|show|get|github|projects?)\b/gi, '')
                .trim().split(/\s+/).filter(Boolean);
            if (ghPlugin) {
                try { await ghPlugin.run(sock, message, cleanedArgs, ctx); return; }
                catch (e) { reply(`âŒ GitHub error: ${e.message}`); return; }
            }
            return;
 
        // â”€â”€ GitHub repo ZIP download ("send me a clip of owner/repo") â”€â”€
        } else if (agentActions.github_repo_zip.test(query)) {
            const repoMatch = query.match(/\b([\w-]+\/[\w-]+)\b/);
            const fullRepo = repoMatch ? repoMatch[1] : null;
            if (!fullRepo || fullRepo.includes('codex') === false && !fullRepo.includes('/')) {
                return reply(`ðŸ“¦ Please specify the repo in *owner/repo* format.\n\nExample: _agent send me a clip of owner/repo_`);
            }
            const [owner, repo] = fullRepo.split('/');
            await safeSend({ text: `ðŸ“¦ _Preparing download link for *${fullRepo}*..._` }, { quoted: message });
            try {
                const ghHeaders = { 'User-Agent': 'CODEX AI/2.0', 'Accept': 'application/vnd.github+json' };
                const res = await axios.get(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers: ghHeaders, timeout: 8000 });
                const r = res.data;
                const branch = r.default_branch || 'main';
                reply(
                    `ðŸ“¦ *${r.full_name}*\n\n` +
                    `${r.description ? `ðŸ“ ${r.description}\n\n` : ''}` +
                    `â­ *${r.stargazers_count}* stars  ðŸ´ *${r.forks_count}* forks\n\n` +
                    `*â¬‡ï¸ Download Links*\n` +
                    `â€¢ ZIP: https://github.com/${r.full_name}/archive/refs/heads/${branch}.zip\n` +
                    `â€¢ Tarball: https://github.com/${r.full_name}/archive/refs/heads/${branch}.tar.gz\n\n` +
                    `*ðŸ”— View on GitHub*\n${r.html_url}\n\n` +
                    `_Use \`.codexai ${repo} <filepath>\` to read specific files._`
                );
            } catch (err) {
                const branch = 'main';
                reply(
                    `ðŸ“¦ *${fullRepo}*\n\n` +
                    `*â¬‡ï¸ Download Links*\n` +
                    `â€¢ ZIP (main): https://github.com/${owner}/${repo}/archive/refs/heads/main.zip\n` +
                    `â€¢ ZIP (master): https://github.com/${owner}/${repo}/archive/refs/heads/master.zip\n\n` +
                    `_Tap a link to download. Could not verify repo: ${err.message}_`
                );
            }
            return;
 
        // â”€â”€ GitHub repo file fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        } else if (agentActions.github_repo_file.test(query)) {
            // Extract "owner/repo/path" or "file from owner/repo"
            const repoFileMatch = query.match(/\b([\w-]+\/[\w-]+)\/([\w./\-]+)\b/) ||
                                  query.match(/\b(readme|package\.json|index\.js|\.env)\b/i);
            const repoMatch = query.match(/\b([\w-]+\/[\w-]+)\b/);
            const fileKeyword = query.match(/\b(readme|package\.json|index\.js|config|handler|codex)\b/i)?.[1] || '';
 
            if (!repoMatch) {
                return reply(`ðŸ“„ Specify the repo and file.\n\nExamples:\nâ€¢ _agent get README from owner/repo_\nâ€¢ _.ghrepo owner/repo README.md_`);
            }
 
            const [owner, repo] = repoMatch[1].split('/');
            const filePath = repoFileMatch?.[3] ||
                            (fileKeyword.toLowerCase() === 'readme' ? 'README.md' : fileKeyword || 'README.md');
 
            await safeSend({ text: `ðŸ“„ _Fetching \`${filePath}\` from *${owner}/${repo}*..._` }, { quoted: message });
            try {
                const ghHeaders = { 'User-Agent': 'CODEX AI/2.0', 'Accept': 'application/vnd.github+json' };
                const res = await axios.get(
                    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(filePath)}`,
                    { headers: ghHeaders, timeout: 10000 }
                );
                const file = res.data;
                if (file.encoding === 'base64' && file.content) {
                    const content = Buffer.from(file.content, 'base64').toString('utf8');
                    const preview = content.length > 3000
                        ? content.slice(0, 3000) + `\n\n_...file truncated (${content.length} chars total)_`
                        : content;
                    reply(`ðŸ“„ *${owner}/${repo}/${filePath}*\n\n\`\`\`\n${preview}\n\`\`\``);
                } else {
                    reply(`ðŸ“„ *${owner}/${repo}/${filePath}*\n\nðŸ”— ${file.html_url}\nâ¬‡ï¸ ${file.download_url || 'N/A'}`);
                }
            } catch (err) {
                if (err.response?.status === 404) {
                    reply(`âŒ File not found: \`${owner}/${repo}/${filePath}\`\n\n_Use \`.codexai ${repo}\` to browse available files._`);
                } else {
                    reply(`âŒ Could not fetch file: ${err.message}`);
                }
            }
            return;
 
        // â”€â”€ Riddle dispatch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        } else if (agentActions.riddle_agent.test(query)) {
            const pm = pluginMap();
            const riddlePlugin = pm.get('riddle');
            if (riddlePlugin) {
                try { await riddlePlugin.run(sock, message, [], ctx); return; }
                catch (e) { reply(`âŒ Riddle error: ${e.message}`); return; }
            }
            reply(`ðŸ§© Use \`.riddle\` to get a brain teaser! Then \`.answer\` to reveal the answer.`);
            return;
 
        // â”€â”€ Proverb dispatch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        } else if (agentActions.proverb_agent.test(query)) {
            const pm = pluginMap();
            const provPlugin = pm.get('proverb') || pm.get('saying') || pm.get('wisdom');
            if (provPlugin) {
                try { await provPlugin.run(sock, message, [], ctx); return; }
                catch (e) { reply(`âŒ Proverb error: ${e.message}`); return; }
            }
            const PROVERBS = [
                'A stitch in time saves nine.',
                'Actions speak louder than words.',
                'All that glitters is not gold.',
                'A penny saved is a penny earned.',
                'Beggars can\'t be choosers.',
                'Better late than never.',
                'Don\'t count your chickens before they hatch.',
                'Every cloud has a silver lining.',
                'Fortune favors the bold.',
                'Knowledge is power.',
                'Look before you leap.',
                'No pain, no gain.',
                'Practice makes perfect.',
                'The early bird catches the worm.',
                'Time is money.',
                'Two wrongs don\'t make a right.',
                'When in Rome, do as the Romans do.',
                'Where there\'s a will, there\'s a way.',
                'You reap what you sow.',
                'A fool and his money are soon parted.',
                'Absence makes the heart grow fonder.',
                'All roads lead to Rome.',
                'Birds of a feather flock together.',
                'Curiosity killed the cat.',
                'Don\'t bite the hand that feeds you.',
                'Great minds think alike.',
                'Honesty is the best policy.',
                'It takes two to tango.',
                'Laughter is the best medicine.',
                'Necessity is the mother of invention.',
            ];
            const pick = PROVERBS[Math.floor(Math.random() * PROVERBS.length)];
            reply(`ðŸ“œ *Proverb of the Moment*\n\n_"${pick}"_\n\n_Use \`.proverb\` for more wisdom!_`);
            return;
 
        // â”€â”€ Rhyme dispatch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        } else if (agentActions.rhyme_agent.test(query)) {
            const pm = pluginMap();
            const rhymePlugin = pm.get('rhyme') || pm.get('rhymes');
            const wordMatch = query.match(/\brhymes?\s+(?:with\s+)?(\w+)\b/i) || query.match(/\bwords?\s+that\s+rhyme\s+(?:with\s+)?(\w+)\b/i) || query.match(/\bwhat\s+rhymes\s+(?:with\s+)?(\w+)\b/i);
            const word = wordMatch ? wordMatch[1] : query.replace(/\brhyme\b|\brhymes?\s+with\b|\bwords?\s+that\s+rhyme\b/gi, '').trim().split(/\s+/).pop();
            if (rhymePlugin && word) {
                try { await rhymePlugin.run(sock, message, word ? [word] : [], ctx); return; }
                catch (e) { reply(`âŒ Rhyme error: ${e.message}`); return; }
            }
            if (word) {
                try {
                    const res = await axios.get(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(word)}&max=12`, { timeout: 8000 });
                    const rhymes = res.data?.map(r => r.word) || [];
                    if (rhymes.length) {
                        reply(`ðŸŽµ *Words that rhyme with "${word}"*\n\n${rhymes.join(', ')}\n\n_${rhymes.length} rhymes found_`);
                    } else {
                        reply(`ðŸŽµ No rhymes found for "*${word}*". Try another word!`);
                    }
                } catch {
                    reply(`ðŸŽµ Use \`.rhyme <word>\` to find words that rhyme!`);
                }
            } else {
                reply(`ðŸŽµ *Rhyme Finder*\n\nExample: _agent what rhymes with moon_\n\nOr use: \`.rhyme <word>\``);
            }
            return;
 
        } else {
            // â”€â”€ Natural language: intent map first (instant), then AI races in parallel â”€â”€
            const pm = pluginMap();
 
            // Step 1: fast regex intent matching (zero latency)
            const intent = findIntent(query);
            if (intent) {
                const plugin = pm.get(intent.cmd);
                if (plugin) {
                    if (plugin.permission === 'owner' && !isOwner)
                        return reply(`â›” That action requires owner permission.`);
                    if (plugin.permission === 'admin' && !isAdmin && !isOwner)
                        return reply(`â›” That action requires admin permission.`);
                    const argDisplay = intent.pluginArgs.length ? ` *"${intent.pluginArgs.join(' ')}"*` : '';
                    await safeSend({ text: `${intent.label}${argDisplay}...` }, { quoted: message });
                    try {
                        await plugin.run(sock, message, intent.pluginArgs, ctx);
                    } catch (err) {
                        await safeSend({ text: `âŒ Failed: ${err.message || 'Something went wrong.'}` }, { quoted: message });
                    }
                    return;
                }
            }
 
            // Step 2: bare single word â€” run as direct command
            const cmdMatch = query.match(/^\.?(\w+)$/);
            if (cmdMatch) {
                const potentialCmd = cmdMatch[1].toLowerCase();
                if (pm.has(potentialCmd)) {
                    const plugin = pm.get(potentialCmd);
                    if (plugin.permission === 'owner' && !isOwner)
                        return reply(`â›” \`${potentialCmd}\` requires owner permission.`);
                    if (plugin.permission === 'admin' && !isAdmin && !isOwner)
                        return reply(`â›” \`${potentialCmd}\` requires admin permission.`);
                    try { await plugin.run(sock, message, [], ctx); return; } catch (err) {
                        return reply(`âŒ Error running \`${potentialCmd}\`: ${err.message}`);
                    }
                }
            }
 
            // Step 3: instant built-in smart responses (no API call)
            const smart = getSmartResponse(query);
            if (smart) {
                response = `ðŸ¤– *Codex*\n\n${smart}`;
                rememberMessage(jid, 'user', query);
                rememberMessage(jid, 'bot', smart);
            } else {
                // Step 4: AI â€” ch.at (with retry) races pollinations + popcat in parallel.
                //          Gemini is tried if all free APIs fail.
                //          offlineSmartReply() is the guaranteed final backstop â€” NEVER silent.
                rememberMessage(jid, 'user', query);
                await sock.sendPresenceUpdate('composing', jid);
 
                // Build a strong system prompt that tells ch.at exactly when to route a plugin
                const toolList = [...pm.keys()].slice(0, 100).join(', ');
                const systemPrompt =
                    `You are Codex, a smart WhatsApp bot assistant. ` +
                    `Owner: ${config.OWNER_NAME || 'Codex'}. Bot: ${config.BOT_NAME || 'CODEX AI'}.\n` +
                    `Available bot commands: ${toolList}.\n\n` +
                    `ROUTING RULES (follow exactly):\n` +
                    `â€¢ If the user wants music/songs â†’ reply: TOOL:play|<song name>\n` +
                    `â€¢ If the user wants weather    â†’ reply: TOOL:weather|<city>\n` +
                    `â€¢ If the user wants Wikipedia  â†’ reply: TOOL:wiki|<topic>\n` +
                    `â€¢ If the user wants a sticker  â†’ reply: TOOL:sticker|\n` +
                    `â€¢ If the user wants TikTok DL  â†’ reply: TOOL:tiktok|<url>\n` +
                    `â€¢ If the user wants YouTube DL â†’ reply: TOOL:ytmp4|<title>\n` +
                    `â€¢ If the user wants translate  â†’ reply: TOOL:translate|<lang> <text>\n` +
                    `â€¢ If the user wants a joke     â†’ reply: TOOL:joke|\n` +
                    `â€¢ If the user wants news       â†’ reply: TOOL:news|\n` +
                    `â€¢ If the user wants QR code    â†’ reply: TOOL:qr|<text>\n` +
                    `â€¢ If the user wants a poem     â†’ reply: TOOL:poem|<topic>\n` +
                    `â€¢ If the user wants crypto     â†’ reply: TOOL:crypto|<coin>\n` +
                    `â€¢ For any other bot command in the list above, reply: TOOL:<command>|<args>\n` +
                    `â€¢ For general questions, conversation, or topics NOT matching a command â†’ answer naturally.\n\n` +
                    `Format rules: Use *bold* for key info. Max 200 words. Never say you cannot run commands.`;
 
                let aiReply = await askFreeAI(query, jid, systemPrompt);
 
                // Gemini secondary fallback (only if keyed)
                if (!aiReply) {
                    try {
                        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || '';
                        if (apiKey) {
                            const { GoogleGenerativeAI } = require('@google/generative-ai');
                            const genAI = new GoogleGenerativeAI(apiKey);
                            const model = genAI.getGenerativeModel({
                                model: 'gemini-1.5-flash',
                                generationConfig: { temperature: 0.85, maxOutputTokens: 800 },
                            });
                            const mem = getMemory(jid).slice(-6);
                            const geminiHistory = [
                                { role: 'user',  parts: [{ text: systemPrompt }] },
                                { role: 'model', parts: [{ text: `Got it! I'm Codex, ready to help. ðŸ¤–` }] },
                                ...mem.slice(0, -1).map(m => ({
                                    role: m.role === 'user' ? 'user' : 'model',
                                    parts: [{ text: m.text }],
                                })),
                            ];
                            const chat = model.startChat({ history: geminiHistory });
                            const result = await chat.sendMessage(query);
                            aiReply = result.response.text();
                        }
                    } catch { /* Gemini unavailable */ }
                }
 
                // â”€â”€ GUARANTEED RESPONSE â€” never silent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                // offlineSmartReply always returns a useful string, so response is always set.
                if (!aiReply) {
                    aiReply = offlineSmartReply(query, pm);
                }
 
                // Check if AI (or offline) decided to route a plugin via TOOL: prefix
                if (/^TOOL:/i.test(String(aiReply).trim())) {
                    const toolLine = String(aiReply).trim().replace(/^TOOL:/i, '').split('\n')[0].trim();
                    const pipeIdx  = toolLine.indexOf('|');
                    const cmdName  = (pipeIdx >= 0 ? toolLine.slice(0, pipeIdx) : toolLine).trim().toLowerCase();
                    const argStr   = pipeIdx >= 0 ? toolLine.slice(pipeIdx + 1).trim() : '';
                    const toolArgs = argStr ? argStr.split(/\s+/).filter(Boolean) : [];
                    const plugin   = pm.get(cmdName);
 
                    if (plugin) {
                        if (plugin.permission === 'owner' && !isOwner)
                            return reply(`â›” That action requires owner permission.`);
                        if (plugin.permission === 'admin' && !isAdmin && !isOwner)
                            return reply(`â›” That action requires admin permission.`);
                        const argDisplay = toolArgs.length ? ` *"${toolArgs.join(' ')}"*` : '';
                        await safeSend({ text: `ðŸ”§ _Running ${cmdName}${argDisplay}..._` }, { quoted: message });
                        try {
                            await plugin.run(sock, message, toolArgs, ctx);
                        } catch (err) {
                            await safeSend({ text: `âŒ ${cmdName} failed: ${err.message || 'Something went wrong.'}` }, { quoted: message });
                        }
                        return;
                    }
                    // TOOL: command not found â€” fall through to conversational reply
                }
 
                // Conversational response (may come from ch.at, Gemini, or offline fallback)
                response = aiReply.startsWith('ðŸ¤– *Codex*') ? aiReply : `ðŸ¤– *Codex*\n\n${aiReply}`;
                rememberMessage(jid, 'bot', aiReply.slice(0, 300));
            }
        }
        // response is always set â€” either by an earlier branch or by offlineSmartReply above
        if (response) await safeSend({ text: response }, { quoted: message });
    }
};

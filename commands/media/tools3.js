'use strict';
 
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const { fmt } = require('../../lib/theme');
 
const FANCY_MAP = {
    bold:        s => s.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(code + 0x1D3BF);
        if (code >= 97 && code <= 122) return String.fromCodePoint(code + 0x1D3B9);
        if (code >= 48 && code <= 57) return String.fromCodePoint(code + 0x1D7CE);
        return c;
    }).join(''),
    italic:      s => s.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(code + 0x1D3F3);
        if (code >= 97 && code <= 122) return String.fromCodePoint(code + 0x1D3ED);
        return c;
    }).join(''),
    script:      s => s.split('').map(c => {
        const map = { a:'ð’¶',b:'ð’·',c:'ð’¸',d:'ð’¹',e:'ð‘’',f:'ð’»',g:'ð‘”',h:'ð’½',i:'ð’¾',j:'ð’¿',k:'ð“€',l:'ð“',m:'ð“‚',n:'ð“ƒ',o:'ð‘œ',p:'ð“…',q:'ð“†',r:'ð“‡',s:'ð“ˆ',t:'ð“‰',u:'ð“Š',v:'ð“‹',w:'ð“Œ',x:'ð“',y:'ð“Ž',z:'ð“' };
        return map[c.toLowerCase()] || c;
    }).join(''),
    bubble:      s => s.split('').map(c => {
        const map = { a:'â“',b:'â“‘',c:'â“’',d:'â““',e:'â“”',f:'â“•',g:'â“–',h:'â“—',i:'â“˜',j:'â“™',k:'â“š',l:'â“›',m:'â“œ',n:'â“',o:'â“ž',p:'â“Ÿ',q:'â“ ',r:'â“¡',s:'â“¢',t:'â“£',u:'â“¤',v:'â“¥',w:'â“¦',x:'â“§',y:'â“¨',z:'â“©',A:'â’¶',B:'â’·',C:'â’¸',D:'â’¹',E:'â’º',F:'â’»',G:'â’¼',H:'â’½',I:'â’¾',J:'â’¿',K:'â“€',L:'â“',M:'â“‚',N:'â“ƒ',O:'â“„',P:'â“…',Q:'â“†',R:'â“‡',S:'â“ˆ',T:'â“‰',U:'â“Š',V:'â“‹',W:'â“Œ',X:'â“',Y:'â“Ž',Z:'â“' };
        return map[c] || c;
    }).join(''),
    square:      s => s.split('').map(c => {
        const map = { a:'ðŸ„°',b:'ðŸ„±',c:'ðŸ„²',d:'ðŸ„³',e:'ðŸ„´',f:'ðŸ„µ',g:'ðŸ„¶',h:'ðŸ„·',i:'ðŸ„¸',j:'ðŸ„¹',k:'ðŸ„º',l:'ðŸ„»',m:'ðŸ„¼',n:'ðŸ„½',o:'ðŸ„¾',p:'ðŸ„¿',q:'ðŸ…€',r:'ðŸ…',s:'ðŸ…‚',t:'ðŸ…ƒ',u:'ðŸ…„',v:'ðŸ……',w:'ðŸ…†',x:'ðŸ…‡',y:'ðŸ…ˆ',z:'ðŸ…‰' };
        return map[c.toLowerCase()] || c;
    }).join(''),
    vaporwave:   s => s.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 33 && code <= 126) return String.fromCodePoint(code + 0xFEE0);
        return c;
    }).join(''),
};
 
module.exports = {
    commands: [
        'ebinary', 'debinary', 'ebase', 'dbase',
        'fancy', 'ttp', 'domaincheck', 'rename', 'tinyurl', 'rebrandly', 'vgd', 'vurl',
        'adfoc', 'cleanuri', 'createpdf', 'createqr', 'readqr',
        'shortener', 'sspc', 'ssphone', 'sstab', 'ssur', 'ssweb',
        'web2zip', 'photoeditor', 'remini', 'met', 'onwa'
    ],
    category: 'media',
    description: 'Extended tools and utilities',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo, reply } = ctx;
        const cmd  = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
        const text = args.join(' ').trim();
        const send = (t) => sock.sendMessage(jid, { text: fmt(t), contextInfo }, { quoted: message });
 
        if (cmd === 'ebinary') {
            if (!text) return send('âŒ *Usage:* `.ebinary <text>`');
            const bin = text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
            return send(`ðŸ”¢ *Text â†’ Binary*\n\n*Input:* ${text}\n*Output:* ${bin}`);
        }
 
        if (cmd === 'debinary') {
            if (!text) return send('âŒ *Usage:* `.debinary <binary>`');
            try {
                const decoded = text.trim().split(/\s+/).map(b => String.fromCharCode(parseInt(b, 2))).join('');
                return send(`ðŸ”¢ *Binary â†’ Text*\n\n*Input:* ${text}\n*Output:* ${decoded}`);
            } catch { return send('âŒ Invalid binary input.'); }
        }
 
        if (cmd === 'ebase' || cmd === 'b64e') {
            if (!text) return send('âŒ *Usage:* `.ebase <text>`');
            return send(`ðŸ” *Base64 Encode*\n\n*Input:* ${text}\n*Output:* ${Buffer.from(text).toString('base64')}`);
        }
 
        if (cmd === 'dbase' || cmd === 'b64d') {
            if (!text) return send('âŒ *Usage:* `.dbase <base64>`');
            try {
                return send(`ðŸ” *Base64 Decode*\n\n*Input:* ${text}\n*Output:* ${Buffer.from(text, 'base64').toString('utf8')}`);
            } catch { return send('âŒ Invalid base64 input.'); }
        }
 
        if (cmd === 'fancy') {
            if (!text) return send('âŒ *Usage:* `.fancy <text>`\n\nStyles: bold, italic, script, bubble, square, vaporwave');
            const parts = text.split('|');
            const style = parts.length > 1 ? parts[0].trim().toLowerCase() : 'all';
            const input = parts.length > 1 ? parts.slice(1).join('|').trim() : text;
 
            if (style === 'all') {
                const results = Object.entries(FANCY_MAP).map(([name, fn]) => `*${name}:* ${fn(input)}`).join('\n');
                return send(`âœ¨ *Fancy Text: "${input}"*\n\n${results}`);
            }
            const fn = FANCY_MAP[style];
            if (!fn) return send(`âŒ Unknown style. Choose from: ${Object.keys(FANCY_MAP).join(', ')}`);
            return send(`âœ¨ *${style}:* ${fn(input)}`);
        }
 
        if (cmd === 'ttp') {
            if (!text) return send('âŒ *Usage:* `.ttp <text>`');
            // siputzx.my.id is dead (2026-06). Provide themed text fallback.
            try {
                await sock.sendPresenceUpdate('composing', jid);
                // Try thum.io text-overlay QR (quick image generation)
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}&bgcolor=000000&color=00FF00&qzone=2`;
                const res = await axios.get(qrUrl, { responseType: 'arraybuffer', timeout: 12000 });
                if (res.data?.length > 500) {
                    await sock.sendMessage(jid, { image: Buffer.from(res.data), caption: fmt(`ðŸ–¼ï¸ Text: *${text}*\n\n_Use .fancy for styled text_`), contextInfo }, { quoted: message });
                    return;
                }
            } catch {}
            return send(`ðŸ–¼ï¸ *Text Picture*\n\n_${text}_\n\n_TTP image API unavailable â€” use \`.fancy ${text}\` for Unicode-styled text_`);
        }
 
        if (cmd === 'domaincheck') {
            if (!text) return send('âŒ *Usage:* `.domaincheck <domain>`\n\nExample: `.domaincheck example.com`');
            try {
                const res = await axios.get(`https://api.api-ninjas.com/v1/dnslookup?domain=${encodeURIComponent(text)}`, {
                    timeout: 10000,
                    headers: { 'Accept': 'application/json' }
                });
                const available = !res.data || res.data.length === 0;
                return send(`ðŸŒ *Domain Check: ${text}*\n\nStatus: ${available ? 'âœ… Possibly Available' : 'âŒ Registered'}\n\nRecords: ${res.data?.length || 0}`);
            } catch {
                return send(`ðŸŒ *Domain Check: ${text}*\n\n_Use whois.domaintools.com for detailed info_`);
            }
        }
 
        if (cmd === 'fetch') {
            if (!text) return send('âŒ *Usage:* `.fetch <url>`');
            const url = text.startsWith('http') ? text : `https://${text}`;
            try {
                await sock.sendPresenceUpdate('composing', jid);
                const res = await axios.get(url, { timeout: 15000, maxContentLength: 50000 });
                const body = typeof res.data === 'string' ? res.data.replace(/<[^>]+>/g, '').replace(/\s{2,}/g, ' ').slice(0, 800) : JSON.stringify(res.data).slice(0, 800);
                return send(`ðŸŒ *Fetch: ${url}*\n\nStatus: ${res.status}\n\n${body}...`);
            } catch (e) { return send(`âŒ Failed to fetch URL: ${e.message}`); }
        }
 
        if (cmd === 'tinyurl') {
            if (!text) return send('âŒ *Usage:* `.tinyurl <url>`');
            try {
                const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`, { timeout: 10000 });
                return send(`ðŸ”— *TinyURL*\n\n*Original:* ${text}\n*Short:* ${res.data}`);
            } catch { return send('âŒ TinyURL failed.'); }
        }
 
        if (cmd === 'vgd') {
            if (!text) return send('âŒ *Usage:* `.vgd <url>`');
            try {
                const res = await axios.get(`https://v.gd/create.php?format=simple&url=${encodeURIComponent(text)}`, { timeout: 10000 });
                return send(`ðŸ”— *v.gd Short URL*\n\n*Original:* ${text}\n*Short:* ${res.data}`);
            } catch { return send('âŒ v.gd failed.'); }
        }
 
        if (cmd === 'cleanuri') {
            if (!text) return send('âŒ *Usage:* `.cleanuri <url>`');
            try {
                const res = await axios.post('https://cleanuri.com/api/v1/shorten', `url=${encodeURIComponent(text)}`, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000
                });
                return send(`ðŸ”— *Clean URI*\n\n*Original:* ${text}\n*Short:* ${res.data?.result_url || 'N/A'}`);
            } catch { return send('âŒ CleanURI failed.'); }
        }
 
        if (cmd === 'rebrandly') {
            if (!text) return send('âŒ *Usage:* `.rebrandly <url>`');
            // shrtco.de is dead (ENOTFOUND) â€” using tinyurl as replacement
            try {
                const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`, { timeout: 10000 });
                return send(`ðŸ”— *Short URL*\n\n*Original:* ${text}\n*Short:* ${res.data}`);
            } catch {
                try {
                    const res = await axios.get(`https://v.gd/create.php?format=simple&url=${encodeURIComponent(text)}`, { timeout: 10000 });
                    return send(`ðŸ”— *Short URL*\n\n*Original:* ${text}\n*Short:* ${res.data}`);
                } catch { return send('âŒ URL shortener failed. Try `.tinyurl <url>` or `.vgd <url>`.'); }
            }
        }
 
        if (cmd === 'vurl' || cmd === 'adfoc' || cmd === 'shortener') {
            if (!text) return send(`âŒ *Usage:* \`.${cmd} <url>\``);
            try {
                const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`, { timeout: 10000 });
                return send(`ðŸ”— *Short URL*\n\n*Original:* ${text}\n*Short:* ${res.data}`);
            } catch { return send('âŒ URL shortener failed.'); }
        }
 
        if (cmd === 'createqr') {
            if (!text) return send('âŒ *Usage:* `.createqr <text or URL>`');
            try {
                await sock.sendPresenceUpdate('composing', jid);
                const res = await axios.get(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`, { responseType: 'arraybuffer', timeout: 15000 });
                await sock.sendMessage(jid, { image: Buffer.from(res.data), caption: fmt(`ðŸ“± QR Code for: ${text}`), contextInfo }, { quoted: message });
            } catch { return send('âŒ Failed to generate QR code.'); }
            return;
        }
 
        if (cmd === 'readqr') {
            const msg    = message.message;
            const imgMsg = msg?.imageMessage || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            if (!imgMsg) return send('âŒ Send or reply to an image with `.readqr`');
            try {
                const { dlBuffer } = require('../../lib/dlmedia');
                const buf = await dlBuffer(imgMsg, 'image');
                const form = new FormData();
                const { default: fetch2 } = await import('node-fetch').catch(() => ({ default: null }));
                if (!fetch2) return send('âŒ QR reader requires node-fetch.');
                const res  = await axios.post('https://api.qrserver.com/v1/read-qr-code/', { file: buf.toString('base64') }, { timeout: 15000 });
                const qr   = res.data?.[0]?.symbol?.[0]?.data;
                return send(qr ? `ðŸ“± *QR Code Content:*\n\n${qr}` : 'âŒ Could not read QR code from image.');
            } catch { return send('âŒ Failed to read QR code.'); }
        }
 
        if (['sspc', 'ssphone', 'sstab', 'ssur', 'ssweb', 'screenshot'].includes(cmd)) {
            const url = text.startsWith('http') ? text : `https://${text}`;
            if (!url || url === 'https://') return send(`âŒ *Usage:* \`.${cmd} <url>\`\n\nExample: \`.ssweb google.com\``);
            try {
                await sock.sendPresenceUpdate('composing', jid);
                const device = cmd === 'ssphone' ? '375x812' : cmd === 'sstab' ? '768x1024' : '1280x900';
                const apiUrl = `https://image.thum.io/get/width/${device.split('x')[0]}/crop/${device.split('x')[1]}/${url}`;
                const res    = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
                await sock.sendMessage(jid, { image: Buffer.from(res.data), caption: fmt(`ðŸ“¸ Screenshot: ${url}`), contextInfo }, { quoted: message });
            } catch { return send(`âŒ Failed to screenshot ${url}`); }
            return;
        }
 
        if (cmd === 'createpdf') {
            return send('ðŸ“„ *Create PDF*\n\nSend text and this bot will format it as a PDF.\n\n_Use `.fetch <url>` to get webpage content first, then share as document._');
        }
 
        if (cmd === 'web2zip' || cmd === 'rename') {
            return send(`ðŸ”§ *${cmd}*\n\n_This feature requires desktop tools. Use your file manager or an online converter._`);
        }
 
        if (cmd === 'photoeditor') {
            return send('ðŸ–¼ï¸ *Photo Editor*\n\nUse these built-in commands:\nâ€¢ `.sticker` â€” convert to sticker\nâ€¢ `.toimg` â€” convert sticker to image\nâ€¢ `.tojpeg` â€” convert to JPEG\nâ€¢ `.togif` â€” convert to GIF\nâ€¢ `.color` â€” color palette from image');
        }
 
        if (cmd === 'remini') {
            const msg    = message.message;
            const imgMsg = msg?.imageMessage || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            if (!imgMsg) return send('âŒ Send or reply to an image with `.remini` to enhance it.');
            try {
                await sock.sendPresenceUpdate('composing', jid);
                const { dlBuffer } = require('../../lib/dlmedia');
                const buf  = await dlBuffer(imgMsg, 'image');
                const form = require('form-data') ? new (require('form-data'))() : null;
                if (!form) return send('âŒ form-data package missing.');
                form.append('image', buf, { filename: 'photo.jpg', contentType: 'image/jpeg' });
                const res  = await axios.post('https://api.remini.ai/v1/enhance', form, {
                    headers: form.getHeaders(), timeout: 30000
                });
                if (res.data?.output_url) {
                    const enhanced = await axios.get(res.data.output_url, { responseType: 'arraybuffer', timeout: 20000 });
                    await sock.sendMessage(jid, { image: Buffer.from(enhanced.data), caption: fmt('âœ¨ *Enhanced Photo*'), contextInfo }, { quoted: message });
                } else { return send('âŒ Enhancement API returned no result.'); }
            } catch { return send('âŒ Remini enhancement failed. Try again later.'); }
            return;
        }
 
        if (cmd === 'met') {
            const uptime   = process.uptime();
            const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
            const mem  = process.memoryUsage();
            const toMB = b => (b / 1024 / 1024).toFixed(1);
            return send(
                `ðŸ“Š *Bot Metrics*\n\n` +
                `â± *Uptime:* ${h}h ${m}m ${s}s\n` +
                `ðŸ§  *Heap Used:* ${toMB(mem.heapUsed)} MB\n` +
                `ðŸ§  *Heap Total:* ${toMB(mem.heapTotal)} MB\n` +
                `ðŸ“¦ *RSS:* ${toMB(mem.rss)} MB\n` +
                `ðŸ• *Time:* ${new Date().toLocaleString()}`
            );
        }
 
        if (cmd === 'onwa') {
            const num = args[0]?.replace(/\D/g, '');
            if (!num) return send('âŒ *Usage:* `.onwa <number>`\n\nExample: `.onwa 254712345678`');
            return send(`ðŸ”— *Open in WhatsApp*\n\nhttps://wa.me/${num}\n\nClick the link to open a chat with +${num}`);
        }
    }
};

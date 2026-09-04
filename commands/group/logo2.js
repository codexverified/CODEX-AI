'use strict';
 
const axios  = require('axios');
const { fmt } = require('../../lib/theme');
 
// Dead APIs removed (2026-06): siputzx.my.id (ENOTFOUND), ryzendesu.vip (bot-protected)
// No working free logo-image API exists without a key, so all styles fall through
// to the built-in Unicode text-art fallback, which always works.
 
const LOGO_STYLES = {
    advancedglow:    { style: 'neon',           color: '#00ff88', bg: '#000000' },
    americanflag:    { style: 'flag',            color: '#B22234', bg: '#3C3B6E' },
    blackpinklogo:   { style: 'blackpink',       color: '#FF1493', bg: '#000000' },
    blackpinkstyle:  { style: 'blackpink2',      color: '#FF69B4', bg: '#111111' },
    cartoonstyle:    { style: 'cartoon',         color: '#FFD700', bg: '#FF4500' },
    deletingtext:    { style: 'delete',          color: '#FF0000', bg: '#000000' },
    effectclouds:    { style: 'clouds',          color: '#87CEEB', bg: '#FFFFFF' },
    galaxy:          { style: 'galaxy',          color: '#9B59B6', bg: '#000011' },
    galaxystyle:     { style: 'galaxy2',         color: '#E8D5FF', bg: '#000022' },
    glitchtext:      { style: 'glitch',          color: '#FF0000', bg: '#000000' },
    glossysilver:    { style: 'glossy',          color: '#C0C0C0', bg: '#222222' },
    glowingtext:     { style: 'glow',            color: '#FFFF00', bg: '#000000' },
    gradienttext:    { style: 'gradient',        color: '#FF0080', bg: '#FFFFFF' },
    lighteffect:     { style: 'light',           color: '#FFFFFF', bg: '#003366' },
    logo1917:        { style: 'retro',           color: '#C0A000', bg: '#1A1A1A' },
    luxurygold:      { style: 'gold',            color: '#FFD700', bg: '#1A0A00' },
    makingneon:      { style: 'neon2',           color: '#00FFFF', bg: '#000000' },
    neonglitch:      { style: 'neonglitch',      color: '#FF00FF', bg: '#000000' },
    nigerianflag:    { style: 'flag2',           color: '#008751', bg: '#FFFFFF' },
    papercut:        { style: 'paper',           color: '#333333', bg: '#F5F5DC' },
    pixelglitch:     { style: 'pixel',           color: '#00FF00', bg: '#000000' },
    sandsummer:      { style: 'sand',            color: '#DEB887', bg: '#87CEEB' },
    summerbeach:     { style: 'beach',           color: '#FF6B35', bg: '#00CED1' },
    texteffect:      { style: 'effect',          color: '#FF4500', bg: '#FFFFFF' },
    typographytext:  { style: 'typography',      color: '#2C3E50', bg: '#ECF0F1' },
    underwater:      { style: 'underwater',      color: '#00BFFF', bg: '#006994' },
    writetext:       { style: 'handwriting',     color: '#1A1A1A', bg: '#FFFFF0' },
    logomaker:       { style: 'logo',            color: '#FF6600', bg: '#FFFFFF' },
    logolist:        null,
};
 
// Unicode transformation maps
const UNICODE_MAPS = {
    bold:       c => { const code = c.charCodeAt(0); if (code >= 65 && code <= 90) return String.fromCodePoint(code + 0x1D3BF); if (code >= 97 && code <= 122) return String.fromCodePoint(code + 0x1D3B9); return c; },
    italic:     c => { const code = c.charCodeAt(0); if (code >= 65 && code <= 90) return String.fromCodePoint(code + 0x1D3F3); if (code >= 97 && code <= 122) return String.fromCodePoint(code + 0x1D3ED); return c; },
    bolditalic: c => { const code = c.charCodeAt(0); if (code >= 65 && code <= 90) return String.fromCodePoint(code + 0x1D427); if (code >= 97 && code <= 122) return String.fromCodePoint(code + 0x1D421); return c; },
    mono:       c => { const code = c.charCodeAt(0); if (code >= 65 && code <= 90) return String.fromCodePoint(code + 0x1D62F); if (code >= 97 && code <= 122) return String.fromCodePoint(code + 0x1D629); return c; },
    script:     c => { const m = {a:'ð’¶',b:'ð’·',c:'ð’¸',d:'ð’¹',e:'ð‘’',f:'ð’»',g:'ð‘”',h:'ð’½',i:'ð’¾',j:'ð’¿',k:'ð“€',l:'ð“',m:'ð“‚',n:'ð“ƒ',o:'ð‘œ',p:'ð“…',q:'ð“†',r:'ð“‡',s:'ð“ˆ',t:'ð“‰',u:'ð“Š',v:'ð“‹',w:'ð“Œ',x:'ð“',y:'ð“Ž',z:'ð“',A:'ð’œ',B:'â„¬',C:'ð’ž',D:'ð’Ÿ',E:'â„°',F:'â„±',G:'ð’¢',H:'â„‹',I:'â„',J:'ð’¥',K:'ð’¦',L:'â„’',M:'â„³',N:'ð’©',O:'ð’ª',P:'ð’«',Q:'ð’¬',R:'â„›',S:'ð’®',T:'ð’¯',U:'ð’°',V:'ð’±',W:'ð’²',X:'ð’³',Y:'ð’´',Z:'ð’µ'}; return m[c] || c; },
    bubble:     c => { const m = {a:'â“',b:'â“‘',c:'â“’',d:'â““',e:'â“”',f:'â“•',g:'â“–',h:'â“—',i:'â“˜',j:'â“™',k:'â“š',l:'â“›',m:'â“œ',n:'â“',o:'â“ž',p:'â“Ÿ',q:'â“ ',r:'â“¡',s:'â“¢',t:'â“£',u:'â“¤',v:'â“¥',w:'â“¦',x:'â“§',y:'â“¨',z:'â“©',A:'â’¶',B:'â’·',C:'â’¸',D:'â’¹',E:'â’º',F:'â’»',G:'â’¼',H:'â’½',I:'â’¾',J:'â’¿',K:'â“€',L:'â“',M:'â“‚',N:'â“ƒ',O:'â“„',P:'â“…',Q:'â“†',R:'â“‡',S:'â“ˆ',T:'â“‰',U:'â“Š',V:'â“‹',W:'â“Œ',X:'â“',Y:'â“Ž',Z:'â“'}; return m[c] || c; },
    square:     c => { const m = {a:'ðŸ„°',b:'ðŸ„±',c:'ðŸ„²',d:'ðŸ„³',e:'ðŸ„´',f:'ðŸ„µ',g:'ðŸ„¶',h:'ðŸ„·',i:'ðŸ„¸',j:'ðŸ„¹',k:'ðŸ„º',l:'ðŸ„»',m:'ðŸ„¼',n:'ðŸ„½',o:'ðŸ„¾',p:'ðŸ„¿',q:'ðŸ…€',r:'ðŸ…',s:'ðŸ…‚',t:'ðŸ…ƒ',u:'ðŸ…„',v:'ðŸ……',w:'ðŸ…†',x:'ðŸ…‡',y:'ðŸ…ˆ',z:'ðŸ…‰',A:'ðŸ„°',B:'ðŸ„±',C:'ðŸ„²',D:'ðŸ„³',E:'ðŸ„´',F:'ðŸ„µ',G:'ðŸ„¶',H:'ðŸ„·',I:'ðŸ„¸',J:'ðŸ„¹',K:'ðŸ„º',L:'ðŸ„»',M:'ðŸ„¼',N:'ðŸ„½',O:'ðŸ„¾',P:'ðŸ„¿',Q:'ðŸ…€',R:'ðŸ…',S:'ðŸ…‚',T:'ðŸ…ƒ',U:'ðŸ…„',V:'ðŸ……',W:'ðŸ…†',X:'ðŸ…‡',Y:'ðŸ…ˆ',Z:'ðŸ…‰'}; return m[c] || c; },
    vaporwave:  c => { const code = c.charCodeAt(0); if (code >= 33 && code <= 126) return String.fromCodePoint(code + 0xFEE0); return c; },
};
 
// Map style names to unicode transforms
const STYLE_UNICODE = {
    neon: 'bold', flag: 'bold', blackpink: 'script', blackpink2: 'italic',
    cartoon: 'bubble', delete: 'bold', clouds: 'italic', galaxy: 'bolditalic',
    galaxy2: 'italic', glitch: 'vaporwave', glossy: 'mono', glow: 'bold',
    gradient: 'script', light: 'bolditalic', retro: 'mono', gold: 'bold',
    neon2: 'italic', neonglitch: 'vaporwave', flag2: 'bubble', paper: 'script',
    pixel: 'mono', sand: 'italic', beach: 'bubble', effect: 'bold',
    typography: 'bolditalic', underwater: 'italic', handwriting: 'script', logo: 'bold',
    default: 'bold',
};
 
function transform(text, mapName) {
    const fn = UNICODE_MAPS[mapName] || UNICODE_MAPS.bold;
    return text.split('').map(fn).join('');
}
 
module.exports = {
    commands: [
        'advancedglow', 'americanflag', 'blackpinklogo', 'blackpinkstyle',
        'cartoonstyle', 'deletingtext', 'effectclouds', 'galaxy', 'galaxystyle',
        'glitchtext', 'glossysilver', 'glowingtext', 'gradienttext', 'lighteffect',
        'logo1917', 'logolist', 'logomaker', 'luxurygold', 'makingneon', 'neonglitch',
        'nigerianflag', 'papercut', 'pixelglitch', 'sandsummer', 'summerbeach',
        'texteffect', 'typographytext', 'underwater', 'writetext'
    ],
    category: 'group',
    description: 'Logo maker and text effect generator',
    usage:       '.logomaker <text> | .galaxy <text> | .glitchtext <text>',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const cmd   = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
        const text  = args.join(' ').trim();
        const send  = (t) => sock.sendMessage(jid, { text: fmt(t), contextInfo }, { quoted: message });
 
        if (cmd === 'logolist') {
            const styles = Object.keys(LOGO_STYLES).filter(k => k !== 'logolist').sort();
            const half   = Math.ceil(styles.length / 2);
            return send(
                `ðŸŽ¨ *Logo Styles (${styles.length})*\n\n` +
                styles.slice(0, half).map(s => `â€¢ .${s}`).join('\n') + '\n\n' +
                styles.slice(half).map(s => `â€¢ .${s}`).join('\n') +
                `\n\n_Usage: .${styles[0]} <your text>_`
            );
        }
 
        if (!text) {
            return send(
                `ðŸŽ¨ *${cmd.toUpperCase()} Style*\n\n` +
                `âŒ *Usage:* \`.${cmd} <your text>\`\n\n` +
                `Example: \`.${cmd} CODEX AI\`\n\n` +
                `_Use \`.logolist\` to see all styles_`
            );
        }
 
        const styleInfo  = LOGO_STYLES[cmd] || { style: 'logo', color: '#FF6600', bg: '#FFFFFF' };
        const mapName    = STYLE_UNICODE[styleInfo.style] || 'bold';
        const styled     = transform(text, mapName);
        const DECORATORS = { neon:'âš¡', blackpink:'ðŸŒ¸', galaxy:'ðŸŒŒ', glitch:'âš ï¸', gold:'âœ¨', glow:'ðŸ’¡', gradient:'ðŸŒˆ', logo:'ðŸŽ¯', default:'ðŸŽ¨' };
        const icon       = DECORATORS[styleInfo.style] || 'ðŸŽ¨';
 
        await send(
            `${icon} *${cmd.toUpperCase()} Style*\n\n` +
            `${styled}\n\n` +
            `_Text:_ ${text}\n` +
            `_Color:_ ${styleInfo.color}  _BG:_ ${styleInfo.bg}`
        );
    }
};

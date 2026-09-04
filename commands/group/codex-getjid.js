'use strict';
 
const { fmt, getStr } = require('../../lib/theme');
const { jidDecode, jidNormalizedUser } = require('../../lib/baileys');
 
// â”€â”€â”€ Phone-number â†’ country lookup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const COUNTRY_CODES = {
    '1':   'ðŸ‡ºðŸ‡¸ United States / Canada',  '7':   'ðŸ‡·ðŸ‡º Russia / Kazakhstan',
    '20':  'ðŸ‡ªðŸ‡¬ Egypt',                    '27':  'ðŸ‡¿ðŸ‡¦ South Africa',
    '30':  'ðŸ‡¬ðŸ‡· Greece',                   '31':  'ðŸ‡³ðŸ‡± Netherlands',
    '32':  'ðŸ‡§ðŸ‡ª Belgium',                  '33':  'ðŸ‡«ðŸ‡· France',
    '34':  'ðŸ‡ªðŸ‡¸ Spain',                    '36':  'ðŸ‡­ðŸ‡º Hungary',
    '39':  'ðŸ‡®ðŸ‡¹ Italy',                    '40':  'ðŸ‡·ðŸ‡´ Romania',
    '41':  'ðŸ‡¨ðŸ‡­ Switzerland',              '43':  'ðŸ‡¦ðŸ‡¹ Austria',
    '44':  'ðŸ‡¬ðŸ‡§ United Kingdom',           '45':  'ðŸ‡©ðŸ‡° Denmark',
    '46':  'ðŸ‡¸ðŸ‡ª Sweden',                   '47':  'ðŸ‡³ðŸ‡´ Norway',
    '48':  'ðŸ‡µðŸ‡± Poland',                   '49':  'ðŸ‡©ðŸ‡ª Germany',
    '51':  'ðŸ‡µðŸ‡ª Peru',                     '52':  'ðŸ‡²ðŸ‡½ Mexico',
    '53':  'ðŸ‡¨ðŸ‡º Cuba',                     '54':  'ðŸ‡¦ðŸ‡· Argentina',
    '55':  'ðŸ‡§ðŸ‡· Brazil',                   '56':  'ðŸ‡¨ðŸ‡± Chile',
    '57':  'ðŸ‡¨ðŸ‡´ Colombia',                 '58':  'ðŸ‡»ðŸ‡ª Venezuela',
    '60':  'ðŸ‡²ðŸ‡¾ Malaysia',                 '61':  'ðŸ‡¦ðŸ‡º Australia',
    '62':  'ðŸ‡®ðŸ‡© Indonesia',                '63':  'ðŸ‡µðŸ‡­ Philippines',
    '64':  'ðŸ‡³ðŸ‡¿ New Zealand',              '65':  'ðŸ‡¸ðŸ‡¬ Singapore',
    '66':  'ðŸ‡¹ðŸ‡­ Thailand',                 '81':  'ðŸ‡¯ðŸ‡µ Japan',
    '82':  'ðŸ‡°ðŸ‡· South Korea',              '84':  'ðŸ‡»ðŸ‡³ Vietnam',
    '86':  'ðŸ‡¨ðŸ‡³ China',                    '90':  'ðŸ‡¹ðŸ‡· Turkey',
    '91':  'ðŸ‡®ðŸ‡³ India',                    '92':  'ðŸ‡µðŸ‡° Pakistan',
    '93':  'ðŸ‡¦ðŸ‡« Afghanistan',              '94':  'ðŸ‡±ðŸ‡° Sri Lanka',
    '95':  'ðŸ‡²ðŸ‡² Myanmar',                  '98':  'ðŸ‡®ðŸ‡· Iran',
    '212': 'ðŸ‡²ðŸ‡¦ Morocco',                  '213': 'ðŸ‡©ðŸ‡¿ Algeria',
    '216': 'ðŸ‡¹ðŸ‡³ Tunisia',                  '218': 'ðŸ‡±ðŸ‡¾ Libya',
    '220': 'ðŸ‡¬ðŸ‡² Gambia',                   '221': 'ðŸ‡¸ðŸ‡³ Senegal',
    '223': 'ðŸ‡²ðŸ‡± Mali',                     '224': 'ðŸ‡¬ðŸ‡³ Guinea',
    '225': 'ðŸ‡¨ðŸ‡® CÃ´te d\'Ivoire',           '226': 'ðŸ‡§ðŸ‡« Burkina Faso',
    '227': 'ðŸ‡³ðŸ‡ª Niger',                    '228': 'ðŸ‡¹ðŸ‡¬ Togo',
    '229': 'ðŸ‡§ðŸ‡¯ Benin',                    '230': 'ðŸ‡²ðŸ‡º Mauritius',
    '231': 'ðŸ‡±ðŸ‡· Liberia',                  '232': 'ðŸ‡¸ðŸ‡± Sierra Leone',
    '233': 'ðŸ‡¬ðŸ‡­ Ghana',                    '234': 'ðŸ‡³ðŸ‡¬ Nigeria',
    '235': 'ðŸ‡¹ðŸ‡© Chad',                     '236': 'ðŸ‡¨ðŸ‡« Central African Republic',
    '237': 'ðŸ‡¨ðŸ‡² Cameroon',                 '238': 'ðŸ‡¨ðŸ‡» Cape Verde',
    '240': 'ðŸ‡¬ðŸ‡¶ Equatorial Guinea',        '241': 'ðŸ‡¬ðŸ‡¦ Gabon',
    '242': 'ðŸ‡¨ðŸ‡¬ Congo',                    '243': 'ðŸ‡¨ðŸ‡© DR Congo',
    '244': 'ðŸ‡¦ðŸ‡´ Angola',                   '245': 'ðŸ‡¬ðŸ‡¼ Guinea-Bissau',
    '248': 'ðŸ‡¸ðŸ‡¨ Seychelles',               '249': 'ðŸ‡¸ðŸ‡© Sudan',
    '250': 'ðŸ‡·ðŸ‡¼ Rwanda',                   '251': 'ðŸ‡ªðŸ‡¹ Ethiopia',
    '252': 'ðŸ‡¸ðŸ‡´ Somalia',                  '253': 'ðŸ‡©ðŸ‡¯ Djibouti',
    '254': 'ðŸ‡°ðŸ‡ª Kenya',                    '255': 'ðŸ‡¹ðŸ‡¿ Tanzania',
    '256': 'ðŸ‡ºðŸ‡¬ Uganda',                   '257': 'ðŸ‡§ðŸ‡® Burundi',
    '258': 'ðŸ‡²ðŸ‡¿ Mozambique',               '260': 'ðŸ‡¿ðŸ‡² Zambia',
    '261': 'ðŸ‡²ðŸ‡¬ Madagascar',               '263': 'ðŸ‡¿ðŸ‡¼ Zimbabwe',
    '264': 'ðŸ‡³ðŸ‡¦ Namibia',                  '265': 'ðŸ‡²ðŸ‡¼ Malawi',
    '266': 'ðŸ‡±ðŸ‡¸ Lesotho',                  '267': 'ðŸ‡§ðŸ‡¼ Botswana',
    '268': 'ðŸ‡¸ðŸ‡¿ Eswatini',                 '269': 'ðŸ‡°ðŸ‡² Comoros',
    '290': 'ðŸ‡¸ðŸ‡­ Saint Helena',             '291': 'ðŸ‡ªðŸ‡· Eritrea',
    '297': 'ðŸ‡¦ðŸ‡¼ Aruba',                    '298': 'ðŸ‡«ðŸ‡´ Faroe Islands',
    '299': 'ðŸ‡¬ðŸ‡± Greenland',
    '350': 'ðŸ‡¬ðŸ‡® Gibraltar',                '351': 'ðŸ‡µðŸ‡¹ Portugal',
    '352': 'ðŸ‡±ðŸ‡º Luxembourg',               '353': 'ðŸ‡®ðŸ‡ª Ireland',
    '354': 'ðŸ‡®ðŸ‡¸ Iceland',                  '355': 'ðŸ‡¦ðŸ‡± Albania',
    '356': 'ðŸ‡²ðŸ‡¹ Malta',                    '357': 'ðŸ‡¨ðŸ‡¾ Cyprus',
    '358': 'ðŸ‡«ðŸ‡® Finland',                  '359': 'ðŸ‡§ðŸ‡¬ Bulgaria',
    '370': 'ðŸ‡±ðŸ‡¹ Lithuania',                '371': 'ðŸ‡±ðŸ‡» Latvia',
    '372': 'ðŸ‡ªðŸ‡ª Estonia',                  '373': 'ðŸ‡²ðŸ‡© Moldova',
    '374': 'ðŸ‡¦ðŸ‡² Armenia',                  '375': 'ðŸ‡§ðŸ‡¾ Belarus',
    '376': 'ðŸ‡¦ðŸ‡© Andorra',                  '377': 'ðŸ‡²ðŸ‡¨ Monaco',
    '380': 'ðŸ‡ºðŸ‡¦ Ukraine',                  '381': 'ðŸ‡·ðŸ‡¸ Serbia',
    '382': 'ðŸ‡²ðŸ‡ª Montenegro',               '385': 'ðŸ‡­ðŸ‡· Croatia',
    '386': 'ðŸ‡¸ðŸ‡® Slovenia',                 '387': 'ðŸ‡§ðŸ‡¦ Bosnia & Herzegovina',
    '389': 'ðŸ‡²ðŸ‡° North Macedonia',          '420': 'ðŸ‡¨ðŸ‡¿ Czech Republic',
    '421': 'ðŸ‡¸ðŸ‡° Slovakia',                 '423': 'ðŸ‡±ðŸ‡® Liechtenstein',
    '502': 'ðŸ‡¬ðŸ‡¹ Guatemala',                '503': 'ðŸ‡¸ðŸ‡» El Salvador',
    '504': 'ðŸ‡­ðŸ‡³ Honduras',                 '505': 'ðŸ‡³ðŸ‡® Nicaragua',
    '506': 'ðŸ‡¨ðŸ‡· Costa Rica',               '507': 'ðŸ‡µðŸ‡¦ Panama',
    '509': 'ðŸ‡­ðŸ‡¹ Haiti',                    '591': 'ðŸ‡§ðŸ‡´ Bolivia',
    '592': 'ðŸ‡¬ðŸ‡¾ Guyana',                   '593': 'ðŸ‡ªðŸ‡¨ Ecuador',
    '595': 'ðŸ‡µðŸ‡¾ Paraguay',                 '597': 'ðŸ‡¸ðŸ‡· Suriname',
    '598': 'ðŸ‡ºðŸ‡¾ Uruguay',                  '880': 'ðŸ‡§ðŸ‡© Bangladesh',
    '886': 'ðŸ‡¹ðŸ‡¼ Taiwan',                   '960': 'ðŸ‡²ðŸ‡» Maldives',
    '961': 'ðŸ‡±ðŸ‡§ Lebanon',                  '962': 'ðŸ‡¯ðŸ‡´ Jordan',
    '963': 'ðŸ‡¸ðŸ‡¾ Syria',                    '964': 'ðŸ‡®ðŸ‡¶ Iraq',
    '965': 'ðŸ‡°ðŸ‡¼ Kuwait',                   '966': 'ðŸ‡¸ðŸ‡¦ Saudi Arabia',
    '967': 'ðŸ‡¾ðŸ‡ª Yemen',                    '968': 'ðŸ‡´ðŸ‡² Oman',
    '970': 'ðŸ‡µðŸ‡¸ Palestine',                '971': 'ðŸ‡¦ðŸ‡ª UAE',
    '972': 'ðŸ‡®ðŸ‡± Israel',                   '973': 'ðŸ‡§ðŸ‡­ Bahrain',
    '974': 'ðŸ‡¶ðŸ‡¦ Qatar',                    '975': 'ðŸ‡§ðŸ‡¹ Bhutan',
    '976': 'ðŸ‡²ðŸ‡³ Mongolia',                 '977': 'ðŸ‡³ðŸ‡µ Nepal',
    '992': 'ðŸ‡¹ðŸ‡¯ Tajikistan',               '993': 'ðŸ‡¹ðŸ‡² Turkmenistan',
    '994': 'ðŸ‡¦ðŸ‡¿ Azerbaijan',               '995': 'ðŸ‡¬ðŸ‡ª Georgia',
    '996': 'ðŸ‡°ðŸ‡¬ Kyrgyzstan',               '998': 'ðŸ‡ºðŸ‡¿ Uzbekistan',
};
 
function detectCountry(phone) {
    for (const len of [3, 2, 1]) {
        const prefix = phone.slice(0, len);
        if (COUNTRY_CODES[prefix]) return COUNTRY_CODES[prefix];
    }
    return 'ðŸŒ Unknown';
}
 
// â”€â”€â”€ JID type decoder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function decodeJid(jid) {
    if (!jid) return { type: 'Unknown', server: '', user: '', device: null };
    const decoded = jidDecode(jid) || {};
    const server  = decoded.server || jid.split('@')[1] || '';
    const user    = decoded.user   || jid.split('@')[0]?.split(':')[0] || '';
    const device  = decoded.device ?? null;
 
    let type = 'Unknown';
    if (server === 'g.us')              type = 'ðŸ‘¥ Group';
    else if (server === 'lid')          type = 'ðŸ” LID Account';
    else if (server === 's.whatsapp.net') type = 'ðŸ‘¤ User';
    else if (server === 'newsletter')   type = 'ðŸ“¢ Newsletter / Channel';
    else if (server === 'broadcast')    type = 'ðŸ“¡ Broadcast';
    else if (server === 'call')         type = 'ðŸ“ž Call';
 
    return { type, server, user, device };
}
 
// â”€â”€â”€ Safe API wrappers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function safeProfilePic(sock, jid) {
    try { return await sock.profilePictureUrl(jid, 'image', 3000); } catch { return null; }
}
async function safeStatus(sock, jid) {
    try {
        const res = await sock.fetchStatus(jidNormalizedUser(jid));
        const entry = res?.[0];
        const status = entry?.status?.status || entry?.status || null;
        const ts     = entry?.status?.setAt || null;
        return { text: status || null, setAt: ts ? new Date(ts * 1000) : null };
    } catch { return { text: null, setAt: null }; }
}
async function safeBusinessProfile(sock, jid) {
    try { return await sock.getBusinessProfile(jidNormalizedUser(jid)) || null; } catch { return null; }
}
async function safeOnWhatsApp(sock, jid) {
    try {
        const res = await sock.onWhatsApp(jidNormalizedUser(jid));
        return res?.[0] || null;
    } catch { return null; }
}
 
// â”€â”€â”€ Format a date nicely â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fmtDate(d) {
    if (!d) return 'N/A';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
 
// â”€â”€â”€ Build USER card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function buildUserCard(sock, targetJid, ctxJid, isOwner, isSelf) {
    const { type, server, user, device } = decodeJid(targetJid);
    const phone   = user.replace(/\D/g, '');
    const country = server === 's.whatsapp.net' ? detectCountry(phone) : 'N/A';
 
    const [pic, statusData, bizProfile, waResult] = await Promise.all([
        safeProfilePic(sock, targetJid),
        safeStatus(sock, targetJid),
        safeBusinessProfile(sock, targetJid),
        server === 's.whatsapp.net' ? safeOnWhatsApp(sock, targetJid) : Promise.resolve(null),
    ]);
 
    const exists  = waResult?.exists !== false;
    const lid     = waResult?.lid || null;
    const isBiz   = !!bizProfile;
 
    let lines = [];
    lines.push(`â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”`);
    lines.push(`   ðŸ” *JID Intelligence Report*`);
    lines.push(`â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜`);
    lines.push('');
 
    // â”€â”€ Identity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    lines.push(`*ðŸ†” Identity*`);
    lines.push(`â€¢ *JID:* \`${targetJid}\``);
    if (lid)    lines.push(`â€¢ *LID:* \`${lid}\` _(privacy alias)_`);
    if (device !== null) lines.push(`â€¢ *Device ID:* \`${device}\``);
    lines.push(`â€¢ *Server:* \`${server}\``);
    lines.push(`â€¢ *Type:* ${type}`);
    if (isBiz)  lines.push(`â€¢ *Account:* ðŸ¢ Business Account`);
    else if (server === 's.whatsapp.net') lines.push(`â€¢ *Account:* ðŸ‘¤ Personal Account`);
    lines.push('');
 
    // â”€â”€ Phone & Location â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (server === 's.whatsapp.net') {
        lines.push(`*ðŸ“± Phone Details*`);
        lines.push(`â€¢ *Number:* +${phone}`);
        lines.push(`â€¢ *Country:* ${country}`);
        lines.push(`â€¢ *On WhatsApp:* ${exists ? 'âœ… Yes' : 'âŒ No'}`);
        lines.push('');
    }
 
    // â”€â”€ WhatsApp Status / Bio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    lines.push(`*ðŸ’¬ Status / Bio*`);
    if (statusData.text) {
        lines.push(`â€¢ ${statusData.text}`);
        if (statusData.setAt) lines.push(`â€¢ _Set: ${fmtDate(statusData.setAt)}_`);
    } else {
        lines.push(`â€¢ _No status set_`);
    }
    lines.push('');
 
    // â”€â”€ Business Profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (isBiz) {
        lines.push(`*ðŸ¢ Business Profile*`);
        if (bizProfile.category)    lines.push(`â€¢ *Category:* ${bizProfile.category}`);
        if (bizProfile.description) lines.push(`â€¢ *Description:* ${bizProfile.description}`);
        if (bizProfile.address)     lines.push(`â€¢ *Address:* ${bizProfile.address}`);
        if (bizProfile.email)       lines.push(`â€¢ *Email:* ${bizProfile.email}`);
        if (bizProfile.website?.length) lines.push(`â€¢ *Website:* ${bizProfile.website.join(', ')}`);
        lines.push('');
    }
 
    // â”€â”€ Flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const flags = [];
    if (isSelf)   flags.push('ðŸ¤– This bot');
    if (isOwner)  flags.push('ðŸ‘‘ Bot owner');
    if (lid)      flags.push('ðŸ” LID-enabled (privacy mode)');
    if (isBiz)    flags.push('ðŸ¢ Business account');
    if (flags.length) {
        lines.push(`*ðŸ·ï¸ Flags*`);
        flags.forEach(f => lines.push(`â€¢ ${f}`));
        lines.push('');
    }
 
    // â”€â”€ Technical â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (isOwner || isSelf) {
        lines.push(`*âš™ï¸ Technical*`);
        lines.push(`â€¢ *JID format:* user:device@server`);
        lines.push(`â€¢ *User part:* \`${user}\``);
        lines.push(`â€¢ *Profile pic:* ${pic ? 'âœ… Available' : 'ðŸ”’ Hidden / None'}`);
        lines.push('');
    }
 
    lines.push(`_Powered by CODEX AI â€” Real-time WhatsApp intelligence_`);
 
    return { text: fmt(lines.join('\n')), pic };
}
 
// â”€â”€â”€ Build GROUP card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function buildGroupCard(sock, groupJid, isAdmin) {
    let meta = null;
    try { meta = await sock.groupMetadata(groupJid); } catch { /* ignore */ }
    if (!meta) return { text: fmt('âŒ Could not fetch group metadata.'), pic: null };
 
    const participants = meta.participants || [];
    const superAdmins  = participants.filter(p => p.admin === 'superadmin');
    const admins       = participants.filter(p => p.admin === 'admin');
    const members      = participants.filter(p => !p.admin);
    const created      = meta.creation ? new Date(meta.creation * 1000) : null;
 
    let inviteCode = null;
    if (isAdmin) {
        try { inviteCode = await sock.groupInviteCode(groupJid); } catch { /* ignore */ }
    }
 
    const pic = await safeProfilePic(sock, groupJid);
 
    const restrictions = meta.announce ? 'ðŸ”’ Admins only'      : 'ðŸ”“ All members';
    const editInfo     = meta.restrict  ? 'ðŸ”’ Admins only'      : 'ðŸ”“ All members';
    const addMode      = meta.joinApprovalMode ? 'âœ… Approval needed' : 'âŒ Open join';
    const ephemeral    = meta.ephemeralDuration
        ? `â³ ${meta.ephemeralDuration / 86400}d disappearing`
        : 'âŒ Off';
 
    const lines = [];
    lines.push(`â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”`);
    lines.push(`   ðŸ” *Group Intelligence Report*`);
    lines.push(`â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜`);
    lines.push('');
 
    lines.push(`*ðŸ†” Identity*`);
    lines.push(`â€¢ *Group JID:* \`${groupJid}\``);
    lines.push(`â€¢ *Group ID:* \`${groupJid.split('@')[0]}\``);
    lines.push(`â€¢ *Name:* ${meta.subject || 'N/A'}`);
    lines.push(`â€¢ *Owner:* @${(meta.owner || '').split('@')[0] || 'Unknown'}`);
    lines.push(`â€¢ *Created:* ${fmtDate(created)}`);
    lines.push('');
 
    lines.push(`*ðŸ‘¥ Membership*`);
    lines.push(`â€¢ *Total:* ${participants.length} members`);
    lines.push(`â€¢ ðŸ‘‘ Super Admins: ${superAdmins.length}`);
    lines.push(`â€¢ ðŸ›¡ï¸ Admins: ${admins.length}`);
    lines.push(`â€¢ ðŸ‘¤ Regular members: ${members.length}`);
    lines.push('');
 
    lines.push(`*âš™ï¸ Group Settings*`);
    lines.push(`â€¢ *Send messages:* ${restrictions}`);
    lines.push(`â€¢ *Edit group info:* ${editInfo}`);
    lines.push(`â€¢ *Join approval:* ${addMode}`);
    lines.push(`â€¢ *Disappearing msgs:* ${ephemeral}`);
    lines.push('');
 
    if (meta.desc) {
        const desc = meta.desc.length > 300 ? meta.desc.slice(0, 300) + 'â€¦' : meta.desc;
        lines.push(`*ðŸ“ Description*`);
        lines.push(desc);
        lines.push('');
    }
 
    if (inviteCode) {
        lines.push(`*ðŸ”— Invite Link*`);
        lines.push(`https://chat.whatsapp.com/${inviteCode}`);
        lines.push('');
    } else if (isAdmin) {
        lines.push(`*ðŸ”— Invite Link:* _Could not fetch_`);
        lines.push('');
    } else {
        lines.push(`*ðŸ”— Invite Link:* _Admins only_`);
        lines.push('');
    }
 
    lines.push(`â€¢ *Profile pic:* ${pic ? 'âœ… Available' : 'ðŸ”’ Hidden / None'}`);
    lines.push('');
    lines.push(`_Powered by CODEX AI â€” Real-time WhatsApp intelligence_`);
 
    return { text: fmt(lines.join('\n')), pic, mentions: meta.owner ? [meta.owner] : [] };
}
 
// â”€â”€â”€ Plugin entry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
module.exports = {
    commands:    ['getjid', 'jid', 'whois', 'userinfo', 'jidinfo', 'chatinfo'],
    category: 'group',
    description: 'Advanced JID & account intelligence â€” user, group, business, LID, country, bio and more',
    usage:       '.jid | .whois @user | .jidinfo +2547XXXXXXXX | .chatinfo',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, from, isAdmin, isOwner, mentionedJid, contextInfo, reply } = ctx;
        const config = require('../../config');
 
        // â”€â”€ Resolve target â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const quotedParticipant = message.message?.extendedTextMessage?.contextInfo?.participant;
        const rawArg = args[0]?.replace(/[^0-9+]/g, '');
 
        let targetJid = null;
        let resolvedFrom = 'chat';
 
        if (quotedParticipant) {
            targetJid   = jidNormalizedUser(quotedParticipant);
            resolvedFrom = 'quoted message';
        } else if (mentionedJid?.length) {
            targetJid   = jidNormalizedUser(mentionedJid[0]);
            resolvedFrom = 'mention';
        } else if (rawArg && /^\+?\d{5,15}$/.test(rawArg)) {
            const num   = rawArg.replace('+', '');
            targetJid   = `${num}@s.whatsapp.net`;
            resolvedFrom = 'number';
        } else {
            targetJid   = jid;
            resolvedFrom = 'current chat';
        }
 
        const isGroup     = targetJid.endsWith('@g.us');
        const isSelf      = jidNormalizedUser(targetJid) === jidNormalizedUser(sock.user?.id || '');
        const isTargetOwner = !isGroup && targetJid.split('@')[0] === config.OWNER_NUMBER;
 
        try {
            await sock.sendPresenceUpdate('composing', jid);
 
            let card;
            if (isGroup) {
                card = await buildGroupCard(sock, targetJid, isAdmin);
            } else {
                card = await buildUserCard(sock, targetJid, jid, isTargetOwner, isSelf);
            }
 
            const sendOpts = { quoted: message };
            if (card.pic) {
                await sock.sendMessage(jid, {
                    image:      { url: card.pic },
                    caption:    card.text,
                    mentions:   card.mentions || [],
                    contextInfo,
                }, sendOpts);
            } else {
                await sock.sendMessage(jid, {
                    text:     card.text,
                    mentions: card.mentions || [],
                    contextInfo,
                }, sendOpts);
            }
 
            await sock.sendPresenceUpdate('paused', jid);
 
        } catch (err) {
            console.error('[JIDInfo]', err.message);
            await reply(fmt(`âŒ Failed to fetch info.\n_Error: ${err.message}_`));
        }
    }
};

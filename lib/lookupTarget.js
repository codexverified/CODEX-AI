function cleanJid(jid) {
    return String(jid).replace(/:[0-9]+@/, '@');
}

function resolveLookupTarget(m, args) {
    const flags = new Set();
    const rest = [];
    for (const raw of args || []) {
        const word = String(raw);
        const lower = word.toLowerCase();
        if (lower === '-p' || lower === 'debug') flags.add(lower);
        else rest.push(word);
    }

    const mentioned = m.mentions && m.mentions.length ? cleanJid(m.mentions[0]) : null;
    const digits = rest
        .map((w) => w.replace(/^@/, ''))
        .filter((w) => /^\+?\d[\d\s\-().]*$/.test(w))
        .join('')
        .replace(/\D/g, '');

    let jid = mentioned;
    let source = mentioned ? 'mention' : null;
    let invalid = false;

    if (!jid && digits) {
        if (digits.length >= 7 && digits.length <= 15) {
            jid = `${digits}@s.whatsapp.net`;
            source = 'number';
        } else {
            invalid = true;
        }
    }

    if (!jid && !invalid) {
        const ctx = m.msg?.contextInfo;
        if (ctx?.participant) {
            jid = cleanJid(ctx.participant);
            source = 'reply';
        } else if (ctx?.stanzaId && !m.isGroup && m.chat) {
            jid = cleanJid(m.chat);
            source = 'reply';
        }
    }

    if (!jid && !invalid) {
        jid = m.sender;
        source = 'self';
    }

    return { jid, source, flags, invalid, digits };
}

async function jidForms(bot, jid) {
    const forms = [cleanJid(jid)];
    const lidMap = bot?.sock?.signalRepository?.lidMapping;
    try {
        if (forms[0].endsWith('@lid') && lidMap?.getPNForLID) {
            const pn = await lidMap.getPNForLID(forms[0]);
            if (pn) forms.push(cleanJid(pn));
        } else if (forms[0].endsWith('@s.whatsapp.net') && lidMap?.getLIDForPN) {
            const lid = await lidMap.getLIDForPN(forms[0]);
            if (lid) forms.push(cleanJid(lid));
        }
    } catch {}
    return [...new Set(forms)];
}

async function getProfilePictureUrl(bot, jid) {
    let lastError = null;
    for (const form of await jidForms(bot, jid)) {
        try {
            const url = await bot.sock.profilePictureUrl(form, 'image');
            if (url) return url;
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('no profile picture');
}

module.exports = { resolveLookupTarget, jidForms, getProfilePictureUrl };
  

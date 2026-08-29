'use strict';

const COUNTRY_CODES = {
    '1': 'United States/Canada',
    '20': 'Egypt',
    '27': 'South Africa',
    '254': 'Kenya',
    '255': 'Tanzania',
    '256': 'Uganda',
    '234': 'Nigeria',
    '44': 'United Kingdom',
    '91': 'India',
};

function normalize(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (raw.endsWith('@s.whatsapp.net') || raw.endsWith('@lid')) return raw;
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 7 ? `${digits}@s.whatsapp.net` : null;
}

function resolvePhoneJid(value) {
    return normalize(value);
}

function getCountry(jid) {
    const digits = String(jid || '').replace(/\D/g, '');
    const code = Object.keys(COUNTRY_CODES).sort((a, b) => b.length - a.length).find(c => digits.startsWith(c));
    return code ? COUNTRY_CODES[code] : 'Unknown';
}

module.exports = { resolvePhoneJid, getCountry };

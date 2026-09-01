/**
 * Optional WhatsApp registration-status checker.
 *
 * This module is deliberately opt-in. It does not run during installation,
 * connection setup, or message sending, and it does not contain credentials.
 * Callers should review the endpoint and applicable terms before use.
 */

const cleanNumber = (value) => String(value ?? '').replace(/[\s().\-/]/g, '').replace(/^00/, '').replace(/^\+/, '');

export const normalizeBanCheckNumber = (value) => {
    const number = cleanNumber(typeof value === 'object' ? value.number : value);
    if (!/^\d{6,15}$/.test(number)) throw new TypeError('number must be an international phone number');
    return `+${number}`;
};

export const checkStatusWA = async (number, options = {}) => {
    const normalized = normalizeBanCheckNumber(number);
    const endpoint = options.endpoint || 'https://v.whatsapp.net/v2/exist';
    const fetchImpl = options.fetch || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new TypeError('a fetch implementation is required');
    const url = new URL(endpoint);
    url.searchParams.set('in', normalized.slice(1));
    const response = await fetchImpl(url, {
        method: 'GET',
        headers: { ...(options.headers || {}) },
        signal: options.signal
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    const reason = String(body?.reason || body?.error || body?.status || '').toLowerCase();
    let status = 'unknown';
    if (response.status === 429 || /rate.?limit|too many/.test(reason)) status = 'rate_limited';
    else if (/blocked|official|banned|ban|temporar|perman/.test(reason)) status = /banned|ban|temporar|perman/.test(reason) ? 'banned' : 'blocked';
    else if (/not.?registered|does.?not.?exist/.test(reason)) status = 'not_registered';
    else if (response.ok) status = 'active';
    return {
        number: normalized,
        status,
        isBanned: status === 'banned',
        isNeedOfficialWa: status === 'blocked',
        diagnostics: options.diagnostic === true ? {
            httpStatus: response.status,
            ok: response.ok,
            bodyKeys: body && typeof body === 'object' ? Object.keys(body).sort() : []
        } : undefined
    };
};

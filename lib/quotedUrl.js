'use strict';

function quotedText(message) {
    const quoted = message?.msg?.contextInfo?.quotedMessage;
    return quoted?.conversation
        || quoted?.extendedTextMessage?.text
        || quoted?.imageMessage?.caption
        || quoted?.videoMessage?.caption
        || quoted?.documentMessage?.caption
        || quoted?.audioMessage?.caption
        || '';
}

function quotedUrl(message) {
    return quotedText(message).match(/https?:\/\/[^\s<>"']+/i)?.[0] || '';
}

module.exports = { quotedText, quotedUrl };

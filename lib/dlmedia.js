'use strict';

const { downloadContentFromMessage } = require('./baileys');

const TYPE_MAP = {
    image: 'imageMessage',
    video: 'videoMessage',
    audio: 'audioMessage',
    document: 'documentMessage',
    sticker: 'stickerMessage',
};

async function dlBuffer(message, type) {
    const content = message?.message || message;
    const key = TYPE_MAP[type] || `${type}Message`;
    const node = content?.[key] || content?.viewOnceMessage?.message?.[key] || content?.ephemeralMessage?.message?.[key];
    if (!node) throw new Error(`No ${type} media found`);
    const stream = await downloadContentFromMessage(node, type === 'sticker' ? 'sticker' : type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

module.exports = { dlBuffer, TYPE_MAP };

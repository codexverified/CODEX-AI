import { downloadContentFromMessage } from './messages-media.js';

export const isViewOnceMessage = (message) => Boolean(message?.message?.viewOnceMessage || message?.message?.viewOnceMessageV2 || message?.message?.viewOnceMessageV2Extension || message?.viewOnceMessage || message?.viewOnceMessageV2 || message?.viewOnceMessageV2Extension);

export const extractViewOnceContent = (message) => {
    const content = message?.message || message;
    return content?.viewOnceMessage?.message || content?.viewOnceMessageV2?.message || content?.viewOnceMessageV2Extension?.message || null;
};

export const getViewOnceMediaType = (message) => {
    const content = extractViewOnceContent(message);
    if (!content) return null;
    for (const type of ['image', 'video', 'audio', 'document', 'sticker']) if (content[`${type}Message`]) return type;
    return null;
};

export const getViewOnceMediaContent = (message) => {
    const content = extractViewOnceContent(message);
    if (!content) return null;
    return content.imageMessage || content.videoMessage || content.audioMessage || content.documentMessage || content.stickerMessage || null;
};

export const downloadViewOnceMedia = async (message, options = {}) => {
    const media = getViewOnceMediaContent(message);
    const type = getViewOnceMediaType(message);
    if (!media || !type) throw new Error('No supported media content found in view-once message');
    const stream = await downloadContentFromMessage(media, type, options);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
};

export const createRegularMessageFromViewOnce = (originalMessage, mediaBuffer) => {
    const media = getViewOnceMediaContent(originalMessage);
    const type = getViewOnceMediaType(originalMessage);
    if (!media || !type) return null;
    return {
        key: originalMessage.key, messageTimestamp: originalMessage.messageTimestamp,
        pushName: originalMessage.pushName, participant: originalMessage.participant,
        decryptedMedia: { type, buffer: mediaBuffer, mimeType: media.mimetype, fileName: media.fileName, caption: media.caption, fileLength: media.fileLength },
        originalViewOnceMessage: originalMessage.message
    };
};

export const shouldAutoDecryptViewOnce = (message, config = {}) => isViewOnceMessage(message) && config.autoVV !== false && message.key?.fromMe !== true;
export const shouldDeleteViewOnce = (message, config = {}) => isViewOnceMessage(message) && config.antiVV !== false && message.key?.fromMe !== true;

export const parseViewOnceInfo = (message) => {
    const media = getViewOnceMediaContent(message);
    return {
        isViewOnce: isViewOnceMessage(message), mediaType: getViewOnceMediaType(message), mimeType: media?.mimetype,
        fileName: media?.fileName, caption: media?.caption, fileLength: media?.fileLength,
        hasUrl: Boolean(media?.url), hasDirectPath: Boolean(media?.directPath), hasMediaKey: Boolean(media?.mediaKey)
    };
};
  

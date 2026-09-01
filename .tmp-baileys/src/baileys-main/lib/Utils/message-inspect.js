import { proto } from '../../WAProto/index.js';
import { isLidUser, jidEncode } from '../WABinary/index.js';

//  Message inspection helpers 
// Ported from baron-baileys-v2 Utils/message-inspect.js. Only the helpers that
// were not already present in lib/Utils/messages.js are exported here  the
// shared ones (getContentType, normalizeMessageContent, extractMessageContent,
// downloadMediaMessage, assertMediaContent, getDevice, ) live in messages.js.

/** Check if a WebMessageInfo has a scheduled reveal time (ConditionalRevealMessage) */
export const isScheduledMessage = (msg) => !!msg?.scheduledMessageMetadata?.scheduledTime;

/** Get scheduled reveal time of a message as a Date, or null */
export const getScheduledMessageTime = (msg) => {
    const t = msg?.scheduledMessageMetadata?.scheduledTime;
    if (!t) return null;
    return new Date(Number(t) * 1000);
};

/** Extract PaymentInfo from a WebMessageInfo (the payment status field, not the message content) */
export const getMessagePaymentInfo = (msg) => msg?.paymentInfo || msg?.quotedPaymentInfo || null;

/** Get all comment metadata from a WebMessageInfo */
export const getMessageCommentMetadata = (msg) => msg?.commentMetadata || null;

/** Get all message add-ons (reactions, poll updates, pins) from a WebMessageInfo */
export const getMessageAddOns = (msg) => msg?.messageAddOns || [];

/** Get the quiz correct answer from a poll creation message, if it's a quiz */
export const getPollCorrectAnswer = (pollMsg) => {
    const poll =
        pollMsg?.pollCreationMessage ||
        pollMsg?.pollCreationMessageV2 ||
        pollMsg?.pollCreationMessageV3 ||
        pollMsg?.pollCreationMessageV5 ||
        pollMsg?.pollCreationMessageV6;
    if (!poll) return null;
    const isQuiz = poll.pollType === proto.Message.PollType?.QUIZ || poll.pollType === 1;
    return isQuiz ? poll.correctAnswer?.optionName || null : null;
};

/** Normalizes a bare user id to @s.whatsapp.net. Does not convert LIDPN; use lidMapping / PN in key.remoteJidAlt when needed. */
export const toJid = (id) => {
    if (!id) return '';
    if (id.includes('@')) return id;
    return `${id}@s.whatsapp.net`;
};

/** Returns the peer LID JID when the key is LID-primary (decode sets remoteJid/participant to @lid when WA sends LID). */
export const getSenderLid = (message) => {
    const k = message.key;
    if (!k) {
        return { jid: '', lid: '' };
    }
    const jid = k.participant || k.remoteJid || '';
    if (jid.endsWith('@lid') || jid.endsWith('@hosted.lid')) {
        return { jid, lid: jid };
    }
    if (k.lid && typeof k.lid === 'string') {
        const lid = k.lid.includes('@') ? k.lid : jidEncode(k.lid, 'lid');
        return { jid, lid };
    }
    if (k.participantLid && isLidUser(k.participantLid)) {
        return { jid, lid: k.participantLid };
    }
    return { jid, lid: '' };
};

import { WAMessageAddressingMode } from '../Types/index.js';
import { generateMessageIDV2, normalizeMessageContent } from '../Utils/index.js';
import { getBinaryNodeChild, getBinaryNodeChildren, getBinaryNodeChildString, isJidGroup, isJidMetaAI, isLidUser, isPnUser, jidEncode, jidNormalizedUser } from '../WABinary/index.js';
import { makeGroupsSocket } from './groups.js';

/** Default Meta AI bot JID used inside AI groups. */
export const META_AI_BOT_JID = '867051314767696@bot';

// `@bot` JIDs carry their device as a trailing suffix (`bot:1`), which
// jidNormalizedUser does not strip  normalize it before comparing.
const stripDeviceSuffix = (jid) => String(jid || '').replace(/:\d+$/, '');
const sameBotJid = (a, b) => {
    if (!a || !b) {
        return false;
    }
    return jidNormalizedUser(stripDeviceSuffix(a)) === jidNormalizedUser(stripDeviceSuffix(b));
};

// Pull the reply stanzaId out of a message: normalizeMessageContent returns the
// type-keyed wrapper (`{ extendedTextMessage: { ... } }`), so unwrap one level.
const extractReplyStanzaId = (message) => {
    const content = message ? normalizeMessageContent(message) : undefined;
    const inner = content && typeof content === 'object'
        ? content[Object.keys(content)[0]]
        : undefined;
    return inner?.contextInfo?.stanzaId || content?.contextInfo?.stanzaId || message?.messageContextInfo?.stanzaId;
};

/**
 * Pure matcher: is `message` a Meta AI bot response in `chatJid`?
 *
 * A message is treated as a bot response when ALL of these hold:
 *   1. it is not from me, and its remoteJid is the chat we prompted in;
 *   2. the sender is a known bot JID (`@bot` suffix or one of `botJids`); OR
 *      its reply context (`contextInfo.stanzaId`) references the prompt we sent.
 *
 * The `botJids` fallback lets callers pass the bot's LID participant JID
 * (resolved from group metadata) so LID-addressed AI groups match too.
 */
export const isMetaAIBotResponse = (message, chatJid, promptId, botJids = []) => {
    if (!message || !message.key || message.key.fromMe) {
        return false;
    }
    if (message.key.remoteJid !== chatJid) {
        return false;
    }
    const sender = stripDeviceSuffix(message.key.participant || message.key.remoteJid);
    if (isJidMetaAI(sender)) {
        return true;
    }
    for (const botJid of botJids) {
        if (sameBotJid(botJid, sender)) {
            return true;
        }
    }
    if (promptId && extractReplyStanzaId(message.message) === promptId) {
        return true;
    }
    return false;
};

// Resolve the bot's real participant JID(s) inside an AI group so the response
// matcher can recognize LID-addressed bot messages. Falls back to the canonical
// `@bot` JID when metadata is unavailable.
export const collectMetaAIBotParticipantJids = async (sock, jid, botUser) => {
    const candidates = new Set([botUser]);
    if (!isJidGroup(jid)) {
        return candidates;
    }
    const botNumber = jidNormalizedUser(botUser).split('@')[0];
    try {
        const meta = await sock.groupMetadata(jid);
        for (const participant of meta.participants || []) {
            const pn = participant.phoneNumber
                ? jidNormalizedUser(participant.phoneNumber).split('@')[0]
                : undefined;
            const idNumber = jidNormalizedUser(participant.id).split('@')[0];
            if (pn === botNumber || idNumber === botNumber || isJidMetaAI(participant.id)) {
                candidates.add(participant.id);
            }
        }
    }
    catch {
        // metadata unavailable  the canonical @bot JID is already in the set
    }
    return candidates;
};

export const makeAIGroupsSocket = (config) => {
    const sock = makeGroupsSocket(config);
    const { ev, query } = sock;

    /** Query helper for AI groups (w:gp2 namespace) */
    const aiGroupQuery = async (jid, type, content) => query({
        tag: 'iq',
        attrs: {
            type,
            xmlns: 'w:g2',
            to: jid
        },
        content
    });

    const aiGroupMetadata = async (jid) => {
        const result = await aiGroupQuery(jid, 'get', [{ tag: 'query', attrs: { request: 'interactive' } }]);
        return extractAIGroupMetadata(result);
    };

    // Handle incoming w:gp2 notifications (create, promote, remove, add)
    sock.ws.on('CB:notification,w:gp2', async (node) => {
        const { attrs, content } = node;
        if (!Array.isArray(content) || content.length === 0) return;

        const inner = content[0];
        const tag = inner.tag;
        const groupId = typeof attrs.from === 'string'
            ? attrs.from
            : attrs.from?.$1?.user
                ? jidEncode(attrs.from.$1.user, 'g.us')
                : undefined;

        if (!groupId) return;

        if (tag === 'create') {
            // New AI group created  emit groups.upsert
            try {
                const meta = await aiGroupMetadata(groupId);
                ev.emit('groups.upsert', [meta]);
            }
            catch {
                // metadata fetch may fail; emit minimal info
                ev.emit('groups.upsert', [{ id: groupId }]);
            }
        }
        else if (tag === 'promote' || tag === 'demote' || tag === 'remove' || tag === 'add') {
            const participants = getBinaryNodeChildren(inner, 'participant')
                .map(p => {
                    const jid = p.attrs.jid;
                    if (typeof jid === 'string') return jid;
                    if (jid?.$1) {
                        return jidEncode(jid.$1.user, jid.$1.server || 's.whatsapp.net');
                    }
                    return undefined;
                })
                .filter(Boolean);

            ev.emit('group-participants.update', {
                id: groupId,
                participants,
                action: tag
            });
        }
        else if (tag === 'subject') {
            ev.emit('groups.update', [{ id: groupId, subject: inner.attrs?.subject }]);
        }

        await sock.sendMessageAck(node);
    });

    return {
        ...sock,
        aiGroupMetadata,
        aiGroupCreate: async (subject, participants = [], options = {}) => {
            if (!Array.isArray(participants)) participants = [];
            const key = generateMessageIDV2();
            const {
                ephemeralExpiration = 86400,
                memberAddMode = 'all_member_add',
                memberShareGroupHistoryMode = 'all_member_share',
                memberLinkMode = 'all_member_link'
            } = options;
            const result = await aiGroupQuery('@g.us', 'set', [
                {
                    tag: 'create',
                    attrs: {
                        subject,
                        key
                    },
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }
            ]);
            return extractAIGroupMetadata(result);
        },
        aiGroupAddBot: async (jid, botUser = '867051314767696') => {
            const result = await aiGroupQuery(jid, 'set', [
                {
                    tag: 'add',
                    attrs: {},
                    content: [
                        {
                            tag: 'participant',
                            attrs: { jid: `${botUser}@bot` }
                        }
                    ]
                }
            ]);
            const node = getBinaryNodeChild(result, 'add');
            const participantsAffected = getBinaryNodeChildren(node, 'participant');
            return participantsAffected.map(p => ({
                status: p.attrs.error || '200',
                jid: p.attrs.jid
            }));
        },
        aiGroupLeave: async (id) => {
            await aiGroupQuery('@g.us', 'set', [
                {
                    tag: 'leave',
                    attrs: {},
                    content: [{ tag: 'group', attrs: { id } }]
                }
            ]);
        },
        aiGroupParticipantsUpdate: async (jid, participants, action) => {
            const result = await aiGroupQuery(jid, 'set', [
                {
                    tag: action,
                    attrs: {},
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }
            ]);
            const node = getBinaryNodeChild(result, action);
            const participantsAffected = getBinaryNodeChildren(node, 'participant');
            return participantsAffected.map(p => ({
                status: p.attrs.error || '200',
                jid: p.attrs.jid,
                content: p
            }));
        },
        aiGroupUpdateSubject: async (jid, subject) => {
            await aiGroupQuery(jid, 'set', [
                {
                    tag: 'subject',
                    attrs: {},
                    content: Buffer.from(subject, 'utf-8')
                }
            ]);
        },
        aiGroupInviteCode: async (jid) => {
            const result = await aiGroupQuery(jid, 'get', [{ tag: 'invite', attrs: {} }]);
            const inviteNode = getBinaryNodeChild(result, 'invite');
            return inviteNode?.attrs.code;
        },
        aiGroupRevokeInvite: async (jid) => {
            const result = await aiGroupQuery(jid, 'set', [{ tag: 'invite', attrs: {} }]);
            const inviteNode = getBinaryNodeChild(result, 'invite');
            return inviteNode?.attrs.code;
        },
        aiGroupAcceptInvite: async (code) => {
            const results = await aiGroupQuery('@g.us', 'set', [{ tag: 'invite', attrs: { code } }]);
            const result = getBinaryNodeChild(results, 'group');
            return result?.attrs.jid;
        },
        aiGroupSettingUpdate: async (jid, setting) => {
            await aiGroupQuery(jid, 'set', [{ tag: setting, attrs: {} }]);
        },
        aiGroupToggleEphemeral: async (jid, ephemeralExpiration) => {
            const content = ephemeralExpiration
                ? { tag: 'ephemeral', attrs: { expiration: ephemeralExpiration.toString() } }
                : { tag: 'not_ephemeral', attrs: {} };
            await aiGroupQuery(jid, 'set', [content]);
        }
    };
};

export const extractAIGroupMetadata = (result) => {
    // IQ response nests group inside create node: result  create  group
    const createNode = getBinaryNodeChild(result, 'create');
    const group =
        getBinaryNodeChild(createNode || result, 'group') ||
        getBinaryNodeChild(result, 'group');
    const descChild = getBinaryNodeChild(group, 'description');
    let desc, descId, descOwner, descOwnerPn, descTime;
    if (descChild) {
        desc = getBinaryNodeChildString(descChild, 'body');
        descOwner = descChild.attrs.participant ? jidNormalizedUser(descChild.attrs.participant) : undefined;
        descOwnerPn = descChild.attrs.participant_pn
            ? jidNormalizedUser(descChild.attrs.participant_pn)
            : undefined;
        descTime = +descChild.attrs.t;
        descId = descChild.attrs.id;
    }
    const groupId = group.attrs.id.includes('@') ? group.attrs.id : jidEncode(group.attrs.id, 'g.us');
    const eph = getBinaryNodeChild(group, 'ephemeral')?.attrs.expiration;
    const metadata = {
        id: groupId,
        subject: group.attrs.subject,
        subjectTime: +group.attrs.s_t,
        creation: +group.attrs.creation,
        owner: group.attrs.creator ? jidNormalizedUser(group.attrs.creator) : undefined,
        ownerPn: group.attrs.creator_pn ? jidNormalizedUser(group.attrs.creator_pn) : undefined,
        owner_country_code: group.attrs.creator_country_code,
        size: group.attrs.size ? +group.attrs.size : getBinaryNodeChildren(group, 'participant').length,
        desc,
        descId,
        descOwner,
        descOwnerPn,
        descTime,
        isAIGroup: true,
        addressingMode: group.attrs.addressing_mode === 'lid' ? WAMessageAddressingMode.LID : WAMessageAddressingMode.PN,
        participants: getBinaryNodeChildren(group, 'participant').map(({ attrs }) => ({
            id: attrs.jid,
            phoneNumber: isLidUser(attrs.jid) && isPnUser(attrs.phone_number) ? attrs.phone_number : undefined,
            lid: isPnUser(attrs.jid) && isLidUser(attrs.lid) ? attrs.lid : undefined,
            admin: attrs.type || null
        })),
        ephemeralDuration: eph ? +eph : undefined
    };
    return metadata;
};

import { Boom } from '@hapi/boom';
import { proto } from '../../WAProto/index.js';
import { WAMessageAddressingMode, WAMessageStubType } from '../Types/index.js';
import { generateMessageIDV2, unixTimestampSeconds } from '../Utils/index.js';
import { getBinaryNodeChild, getBinaryNodeChildren, getBinaryNodeChildString, isJidGroup, isLidUser, isPnUser, jidEncode, jidNormalizedUser, S_WHATSAPP_NET } from '../WABinary/index.js';
import { makeChatsSocket } from './chats.js';

export const buildReportNode = (jid, messageKeys = []) => ({
    tag: 'spam_list',
    attrs: {},
    content: [{
        tag: 'spam',
        attrs: { jid },
        content: messageKeys.map(key => {
            if (!key?.id) {
                throw new Boom('Every reported message key must include an id', { statusCode: 400 });
            }
            return {
                tag: 'message',
                attrs: {
                    id: key.id,
                    ...(key.fromMe !== undefined ? { from_me: key.fromMe ? 'true' : 'false' } : {}),
                    ...(key.participant ? { participant: jidNormalizedUser(key.participant) } : {})
                }
            };
        })
    }]
});

export const buildGroupStatusRevokeMessage = (jid, key) => ({
    groupStatusMessageV2: {
        message: {
            protocolMessage: {
                key: {
                    remoteJid: jid,
                    fromMe: key.fromMe ?? true,
                    id: key.id,
                    ...(key.participant ? { participant: jidNormalizedUser(key.participant) } : {})
                },
                type: proto.Message.ProtocolMessage.Type.REVOKE
            }
        }
    }
});

export const makeGroupsSocket = (config) => {
    const sock = makeChatsSocket(config);
    const { authState, ev, query, relayMessage, updateBlockStatus, upsertMessage } = sock;
    const reportJid = async (jid, messageKeys = []) => query({
        tag: 'iq',
        attrs: { type: 'set', xmlns: 'spam', to: S_WHATSAPP_NET },
        content: [buildReportNode(jid, messageKeys)]
    });
    const groupQuery = async (jid, type, content) => query({
        tag: 'iq',
        attrs: {
            type,
            xmlns: 'w:g2',
            to: jid
        },
        content
    });
    const persistParticipantLidMappings = async (participantLists) => {
        const pairs = [];
        for (const participants of participantLists) {
            for (const p of participants || []) {
                if (p.phoneNumber)
                    pairs.push({ lid: p.id, pn: p.phoneNumber });
                else if (p.lid)
                    pairs.push({ lid: p.lid, pn: p.id });
            }
        }
        if (!pairs.length)
            return;
        try {
            await sock.signalRepository.lidMapping.storeLIDPNMappings(pairs);
        }
        catch (error) {
            sock.logger?.warn?.({ error }, 'failed to store LID/PN mappings from group metadata');
        }
    };
    const groupMetadata = async (jid) => {
        const result = await groupQuery(jid, 'get', [{ tag: 'query', attrs: { request: 'interactive' } }]);
        const metadata = extractGroupMetadata(result);
        persistParticipantLidMappings([metadata.participants]).catch(() => { });
        return metadata;
    };
    /**
     * Acknowledge a group. Ported from WhatsApp Web's WASmaxGroupsAcknowledgeGroupRPC
     * (`<iq to=jid xmlns=w:g2 type=set><ack/></iq>`).
     */
    const groupAcknowledge = async (jid) => {
        await groupQuery(jid, 'set', [{ tag: 'ack', attrs: {} }]);
    };
    /**
     * Get the participants of a community's linked/sub groups. Ported from
     * WhatsApp Web's WASmaxGroupsGetLinkedGroupsParticipantsRPC.
     * @returns {Promise<Array<{ jid: string, phoneNumber?: string }>>}
     */
    const groupGetLinkedParticipants = async (jid) => {
        const result = await groupQuery(jid, 'get', [{ tag: 'linked_groups_participants', attrs: {} }]);
        const node = getBinaryNodeChild(result, 'linked_groups_participants');
        return getBinaryNodeChildren(node, 'participant').map(p => ({
            jid: p.attrs.jid,
            phoneNumber: p.attrs.phone_number || p.attrs.pn || undefined
        }));
    };
    /**
     * Join a community's linked/sub group (may raise a membership approval request).
     * Ported from WhatsApp Web's WASmaxGroupsJoinLinkedGroupRPC.
     * @param {string} parentJid community/parent group to address
     * @param {string} linkedGroupJid linked/sub group to join
     * @param {string} [type]
     */
    const groupJoinLinked = async (parentJid, linkedGroupJid, type) => {
        const result = await groupQuery(parentJid, 'set', [
            { tag: 'join_linked_group', attrs: { jid: linkedGroupJid, ...(type ? { type } : {}) } }
        ]);
        return { approvalRequested: !!getBinaryNodeChild(result, 'membership_approval_request') };
    };
    /**
     * Batch-fetch group profile pictures via w:g2. Ported from WhatsApp Web's
     * WASmaxGroupsGetGroupProfilePicturesRPC.
     * @param {string[]} jids group jids
     * @param {'preview' | 'image'} [type]
     */
    const getGroupProfilePictures = async (jids, type = 'preview') => {
        const result = await groupQuery(S_WHATSAPP_NET, 'get', [
            {
                tag: 'pictures',
                attrs: {},
                content: jids.map(id => ({ tag: 'picture', attrs: { id, type } }))
            }
        ]);
        return getBinaryNodeChildren(result, 'picture').map(pic => ({
            jid: pic.attrs.id || pic.attrs.jid,
            type: pic.attrs.type,
            directPath: pic.attrs['direct_path'],
            url: pic.attrs.url
        }));
    };
    /**
     * Create a sub-group suggestion for a community. Ported from WhatsApp Web's
     * WASmaxGroupsCreateSubGroupSuggestionRPC. The suggestion body (new vs existing
     * groups) is caller-provided.
     * @param {string} parentJid community/parent group to address
     * @param {Array<{ tag: string, attrs?: object, content?: any }>} suggestion child node(s)
     */
    const groupCreateSubGroupSuggestion = async (parentJid, suggestion) => {
        await groupQuery(parentJid, 'set', [{ tag: 'sub_group_suggestion', attrs: {}, content: suggestion }]);
    };
    /**
     * Approve, reject, or cancel sub-group suggestions for a community. Ported from
     * WhatsApp Web's WASmaxGroupsSubGroupSuggestionsActionRPC.
     * approve/reject address suggestions by creator jid; cancel addresses them by
     * the suggested group's jid.
     * @param {string} parentJid community/parent group to address
     * @param {'approve' | 'reject' | 'cancel'} action
     * @param {Array<{ creator?: string, jid?: string }>} suggestions
     */
    const groupSubGroupSuggestionsAction = async (parentJid, action, suggestions) => {
        await groupQuery(parentJid, 'set', [
            {
                tag: 'sub_group_suggestions_action',
                attrs: {},
                content: [
                    {
                        tag: action,
                        attrs: {},
                        content: suggestions.map(s => ({
                            tag: 'sub_group_suggestion',
                            attrs: action === 'cancel' ? { jid: s.jid } : { creator: s.creator }
                        }))
                    }
                ]
            }
        ]);
    };
    const groupFetchAllParticipating = async () => {
        const result = await query({
            tag: 'iq',
            attrs: {
                to: '@g.us',
                xmlns: 'w:g2',
                type: 'get'
            },
            content: [
                {
                    tag: 'participating',
                    attrs: {},
                    content: [
                        { tag: 'participants', attrs: {} },
                        { tag: 'description', attrs: {} }
                    ]
                }
            ]
        });
        const data = {};
        const groupsChild = getBinaryNodeChild(result, 'groups');
        if (groupsChild) {
            const groups = getBinaryNodeChildren(groupsChild, 'group');
            for (const groupNode of groups) {
                const meta = extractGroupMetadata({
                    tag: 'result',
                    attrs: {},
                    content: [groupNode]
                });
                data[meta.id] = meta;
            }
        }
        // TODO: properly parse LID / PN DATA
        sock.ev.emit('groups.update', Object.values(data));
        return data;
    };
    sock.ws.on('CB:ib,,dirty', async (node) => {
        const { attrs } = getBinaryNodeChild(node, 'dirty');
        if (attrs.type !== 'groups') {
            return;
        }
        await groupFetchAllParticipating();
        await sock.cleanDirtyBits('groups');
    });
    return {
        ...sock,
        groupQuery,
        groupMetadata,
        groupAcknowledge,
        groupGetLinkedParticipants,
        groupJoinLinked,
        getGroupProfilePictures,
        groupCreateSubGroupSuggestion,
        groupSubGroupSuggestionsAction,
        groupCreate: async (subject, participants) => {
            const key = generateMessageIDV2();
            const result = await groupQuery('@g.us', 'set', [
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
            return extractGroupMetadata(result);
        },
        groupLeave: async (id) => {
            await groupQuery('@g.us', 'set', [
                {
                    tag: 'leave',
                    attrs: {},
                    content: [{ tag: 'group', attrs: { id } }]
                }
            ]);
        },
        groupUpdateSubject: async (jid, subject) => {
            await groupQuery(jid, 'set', [
                {
                    tag: 'subject',
                    attrs: {},
                    content: Buffer.from(subject, 'utf-8')
                }
            ]);
        },
        groupRequestParticipantsList: async (jid) => {
            const result = await groupQuery(jid, 'get', [
                {
                    tag: 'membership_approval_requests',
                    attrs: {}
                }
            ]);
            const node = getBinaryNodeChild(result, 'membership_approval_requests');
            const participants = getBinaryNodeChildren(node, 'membership_approval_request');
            return participants.map(v => v.attrs);
        },
        groupRequestParticipantsUpdate: async (jid, participants, action) => {
            const result = await groupQuery(jid, 'set', [
                {
                    tag: 'membership_requests_action',
                    attrs: {},
                    content: [
                        {
                            tag: action,
                            attrs: {},
                            content: participants.map(jid => ({
                                tag: 'participant',
                                attrs: { jid }
                            }))
                        }
                    ]
                }
            ]);
            const node = getBinaryNodeChild(result, 'membership_requests_action');
            const nodeAction = getBinaryNodeChild(node, action);
            const participantsAffected = getBinaryNodeChildren(nodeAction, 'participant');
            return participantsAffected.map(p => {
                return { status: p.attrs.error || '200', jid: p.attrs.jid };
            });
        },
        groupParticipantsUpdate: async (jid, participants, action) => {
            const result = await groupQuery(jid, 'set', [
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
            return participantsAffected.map(p => {
                return { status: p.attrs.error || '200', jid: p.attrs.jid, content: p };
            });
        },
        groupUpdateDescription: async (jid, description) => {
            const metadata = await groupMetadata(jid);
            const prev = metadata.descId ?? null;
            await groupQuery(jid, 'set', [
                {
                    tag: 'description',
                    attrs: {
                        ...(description ? { id: generateMessageIDV2() } : { delete: 'true' }),
                        ...(prev ? { prev } : {})
                    },
                    content: description ? [{ tag: 'body', attrs: {}, content: Buffer.from(description, 'utf-8') }] : undefined
                }
            ]);
        },
        groupInviteCode: async (jid) => {
            const result = await groupQuery(jid, 'get', [{ tag: 'invite', attrs: {} }]);
            const inviteNode = getBinaryNodeChild(result, 'invite');
            return inviteNode?.attrs.code;
        },
        groupRevokeInvite: async (jid) => {
            const result = await groupQuery(jid, 'set', [{ tag: 'invite', attrs: {} }]);
            const inviteNode = getBinaryNodeChild(result, 'invite');
            return inviteNode?.attrs.code;
        },
        groupAcceptInvite: async (code) => {
            const results = await groupQuery('@g.us', 'set', [{ tag: 'invite', attrs: { code } }]);
            const result = getBinaryNodeChild(results, 'group');
            return result?.attrs.jid;
        },
        /**
         * revoke a v4 invite for someone
         * @param groupJid group jid
         * @param invitedJid jid of person you invited
         * @returns true if successful
         */
        groupRevokeInviteV4: async (groupJid, invitedJid) => {
            const result = await groupQuery(groupJid, 'set', [
                { tag: 'revoke', attrs: {}, content: [{ tag: 'participant', attrs: { jid: invitedJid } }] }
            ]);
            return !!result;
        },
        /**
         * accept a GroupInviteMessage
         * @param key the key of the invite message, or optionally only provide the jid of the person who sent the invite
         * @param inviteMessage the message to accept
         */
        groupAcceptInviteV4: ev.createBufferedFunction(async (key, inviteMessage) => {
            key = typeof key === 'string' ? { remoteJid: key } : key;
            const results = await groupQuery(inviteMessage.groupJid, 'set', [
                {
                    tag: 'accept',
                    attrs: {
                        code: inviteMessage.inviteCode,
                        expiration: inviteMessage.inviteExpiration.toString(),
                        admin: key.remoteJid
                    }
                }
            ]);
            // if we have the full message key
            // update the invite message to be expired
            if (key.id) {
                // create new invite message that is expired
                inviteMessage = proto.Message.GroupInviteMessage.fromObject(inviteMessage);
                inviteMessage.inviteExpiration = 0;
                inviteMessage.inviteCode = '';
                ev.emit('messages.update', [
                    {
                        key,
                        update: {
                            message: {
                                groupInviteMessage: inviteMessage
                            }
                        }
                    }
                ]);
            }
            // generate the group add message
            await upsertMessage({
                key: {
                    remoteJid: inviteMessage.groupJid,
                    id: generateMessageIDV2(sock.user?.id),
                    fromMe: false,
                    participant: key.remoteJid
                },
                messageStubType: WAMessageStubType.GROUP_PARTICIPANT_ADD,
                messageStubParameters: [JSON.stringify(authState.creds.me)],
                participant: key.remoteJid,
                messageTimestamp: unixTimestampSeconds()
            }, 'notify');
            return results.attrs.from;
        }),
        groupGetInviteInfo: async (code) => {
            const results = await groupQuery('@g.us', 'get', [{ tag: 'invite', attrs: { code } }]);
            return extractGroupMetadata(results);
        },
        groupToggleEphemeral: async (jid, ephemeralExpiration) => {
            const content = ephemeralExpiration
                ? { tag: 'ephemeral', attrs: { expiration: ephemeralExpiration.toString() } }
                : { tag: 'not_ephemeral', attrs: {} };
            await groupQuery(jid, 'set', [content]);
        },
        groupSettingUpdate: async (jid, setting) => {
            await groupQuery(jid, 'set', [{ tag: setting, attrs: {} }]);
        },
        groupMemberAddMode: async (jid, mode) => {
            await groupQuery(jid, 'set', [{ tag: 'member_add_mode', attrs: {}, content: mode }]);
        },
        groupJoinApprovalMode: async (jid, mode) => {
            await groupQuery(jid, 'set', [
                { tag: 'membership_approval_mode', attrs: {}, content: [{ tag: 'group_join', attrs: { state: mode } }] }
            ]);
        },
        groupFetchAllParticipating,
        /** Report a contact to WhatsApp, then block it after the report succeeds. */
        reportContact: async (jid, messageKeys = []) => {
            const normalizedJid = jidNormalizedUser(jid);
            if (!isPnUser(normalizedJid) && !isLidUser(normalizedJid)) {
                throw new Boom('reportContact requires a valid contact JID', { statusCode: 400 });
            }
            const reportResult = await reportJid(normalizedJid, messageKeys);
            await updateBlockStatus(normalizedJid, 'block');
            return reportResult;
        },
        /** Report a group to WhatsApp, then leave it after the report succeeds. */
        reportGroup: async (jid, messageKeys = []) => {
            if (!isJidGroup(jid)) {
                throw new Boom('reportGroup requires a valid group JID', { statusCode: 400 });
            }
            const reportResult = await reportJid(jid, messageKeys);
            await groupQuery('@g.us', 'set', [{
                tag: 'leave',
                attrs: {},
                content: [{ tag: 'group', attrs: { id: jid } }]
            }]);
            return reportResult;
        },
        /** Revoke a previously sent group status using its original message key. */
        deleteGroupStatus: async (jid, key) => {
            if (!isJidGroup(jid)) {
                throw new Boom('deleteGroupStatus requires a valid group JID', { statusCode: 400 });
            }
            if (!key?.id) {
                throw new Boom('deleteGroupStatus requires a message key with an id', { statusCode: 400 });
            }
            if (key.remoteJid && key.remoteJid !== jid) {
                throw new Boom('The group status key does not belong to the target group', { statusCode: 400 });
            }
            return relayMessage(
                jid,
                buildGroupStatusRevokeMessage(jid, key),
                { messageId: generateMessageIDV2(authState.creds.me?.id) }
            );
        }
    };
};
export const extractGroupMetadata = (result) => {
    const group = getBinaryNodeChild(result, 'group');
    if (!group) {
        // Mirror WAWeb: surface server/client errors with their code+text instead of crashing.
        const errorNode = getBinaryNodeChild(result, 'error');
        if (errorNode) {
            const code = errorNode.attrs.code ? +errorNode.attrs.code : 500;
            const text = errorNode.attrs.text || 'group metadata query failed';
            throw new Boom(text, { statusCode: code, data: errorNode });
        }
        throw new Boom('Invalid group metadata response: missing <group> node', { data: result });
    }
    if (!group.attrs.id) {
        throw new Boom('Invalid group metadata response: missing group id', { data: group });
    }
    const descChild = getBinaryNodeChild(group, 'description');
    let desc;
    let descId;
    let descOwner;
    let descOwnerPn;
    let descOwnerUsername;
    let descTime;
    if (descChild) {
        desc = getBinaryNodeChildString(descChild, 'body');
        descOwner = descChild.attrs.participant ? jidNormalizedUser(descChild.attrs.participant) : undefined;
        descOwnerPn = descChild.attrs.participant_pn ? jidNormalizedUser(descChild.attrs.participant_pn) : undefined;
        descOwnerUsername = descChild.attrs.participant_username || undefined;
        descTime = +descChild.attrs.t;
        descId = descChild.attrs.id;
    }
    const groupId = group.attrs.id.includes('@') ? group.attrs.id : jidEncode(group.attrs.id, 'g.us');
    const eph = getBinaryNodeChild(group, 'ephemeral')?.attrs.expiration;
    const memberAddMode = getBinaryNodeChildString(group, 'member_add_mode') === 'all_member_add';
    const metadata = {
        id: groupId,
        notify: group.attrs.notify,
        addressingMode: group.attrs.addressing_mode === 'lid' ? WAMessageAddressingMode.LID : WAMessageAddressingMode.PN,
        subject: group.attrs.subject,
        subjectOwner: group.attrs.s_o,
        subjectOwnerPn: group.attrs.s_o_pn,
        subjectOwnerUsername: group.attrs.s_o_username,
        subjectTime: +group.attrs.s_t,
        size: group.attrs.size ? +group.attrs.size : getBinaryNodeChildren(group, 'participant').length,
        creation: +group.attrs.creation,
        owner: group.attrs.creator ? jidNormalizedUser(group.attrs.creator) : undefined,
        ownerPn: group.attrs.creator_pn ? jidNormalizedUser(group.attrs.creator_pn) : undefined,
        ownerUsername: group.attrs.creator_username || undefined,
        owner_country_code: group.attrs.creator_country_code,
        desc,
        descId,
        descOwner,
        descOwnerPn,
        descOwnerUsername,
        descTime,
        linkedParent: getBinaryNodeChild(group, 'linked_parent')?.attrs.jid || undefined,
        restrict: !!getBinaryNodeChild(group, 'locked'),
        announce: !!getBinaryNodeChild(group, 'announcement'),
        isCommunity: !!getBinaryNodeChild(group, 'parent'),
        isCommunityAnnounce: !!getBinaryNodeChild(group, 'default_sub_group'),
        joinApprovalMode: !!getBinaryNodeChild(group, 'membership_approval_mode'),
        memberAddMode,
        participants: getBinaryNodeChildren(group, 'participant').map(({ attrs }) => {
            // TODO: Store LID MAPPINGS
            return {
                id: attrs.jid,
                phoneNumber: isLidUser(attrs.jid) && isPnUser(attrs.phone_number) ? attrs.phone_number : undefined,
                lid: isPnUser(attrs.jid) && isLidUser(attrs.lid) ? attrs.lid : undefined,
                username: attrs.participant_username || attrs.username || undefined,
                admin: (attrs.type || null)
            };
        }),
        ephemeralDuration: eph ? +eph : undefined
    };
    return metadata;
};

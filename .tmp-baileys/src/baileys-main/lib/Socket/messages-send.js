import NodeCache from '@cacheable/node-cache';
import { Boom } from '@hapi/boom';
import { randomBytes } from 'crypto';
import { proto } from '../../WAProto/index.js';
import { BIZ_BOT_SUPPORT_PAYLOAD, DEFAULT_CACHE_TTLS, WA_DEFAULT_EPHEMERAL } from '../Defaults/index.js';
import { aggregateMessageKeysNotFromMe, assertMediaContent, assertMeId, bindWaitForEvent, buildLinkPreview, decryptMediaRetryData, DEF_MEDIA_HOST, delay, encodeNewsletterMessage, encodeSignedDeviceIdentity, encodeWAMessage, encryptMediaRetryRequest, extractDeviceJids, extractImageThumb, generateMessageIDV2, generateParticipantHashV2, generateWAMessage, generateWAMessageFromContent, getStatusCodeForMediaRetry, getUrlFromDirectPath, getWAUploadToServer, hasValidAlbumMedia, MessageRetryManager, normalizeMessageContent, parseAndInjectE2ESessions, prepareWAMessageMedia, shouldIncludeBizBinaryNode, unixTimestampSeconds } from '../Utils/index.js';
import { getUrlInfo } from '../Utils/link-preview.js';
import { makeKeyedMutex, makeMutex } from '../Utils/make-mutex.js';
import { getMessageReportingToken, shouldIncludeReportingToken } from '../Utils/reporting-utils.js';
import { buildMergedTcTokenIndexWrite, isTcTokenExpired, resolveIssuanceJid, resolveTcTokenJid, shouldSendNewTcToken, storeTcTokensFromIqResult } from '../Utils/tc-token-utils.js';
import { areJidsSameUser, getBinaryNodeChild, getBinaryNodeChildren, getBizBinaryNode, isHostedLidUser, isHostedPnUser, isJidBot, isJidGroup, isJidMetaAI, isJidNewsletter, isLidUser, isPnUser, jidDecode, jidEncode, jidNormalizedUser, PSA_WID, S_WHATSAPP_NET } from '../WABinary/index.js';
import { USyncQuery, USyncUser } from '../WAUSync/index.js';
import { captureUnifiedResponse, generateButtonGridContent, generateCodeBlockContent, generateLatexContent, generateListContent, generateRichMenuContent, generateTableContent, generateUnifiedResponseContent } from '../Utils/message-composer.js';
import { Baron } from './interactive-handler.js';
import { collectMetaAIBotParticipantJids, isMetaAIBotResponse, META_AI_BOT_JID } from './aigroups.js';
import { makeUsernameSocket } from './username.js';

const STATUS_JID = 'status@broadcast';
export const normalizeStatusJidList = (value) => {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Boom('statusJidList must contain at least one recipient JID', { statusCode: 400 });
    }
    const recipients = [...new Set(value.map(jidNormalizedUser).filter(jid => isPnUser(jid) || isLidUser(jid)))];
    if (recipients.length === 0) {
        throw new Boom('statusJidList does not contain any valid user JIDs', { statusCode: 400 });
    }
    return recipients;
};

export const makeMessagesSocket = (config) => {
    const { logger, linkPreviewImageThumbnailWidth, generateHighQualityLinkPreview, options: httpRequestOptions, patchMessageBeforeSending, cachedGroupMetadata, enableRecentMessageCache, maxMsgRetryCount } = config;
    const sock = makeUsernameSocket(config);
    const { ev, authState, messageMutex, signalRepository, upsertMessage, query, fetchPrivacySettings, sendNode, groupMetadata, groupToggleEphemeral, registerSocketEndHandler } = sock;
    const getLIDForPN = signalRepository.lidMapping.getLIDForPN.bind(signalRepository.lidMapping);

    const inFlightTcTokenIssuance = new Set();
    const userDevicesCache = config.userDevicesCache ||
        new NodeCache({
            stdTTL: DEFAULT_CACHE_TTLS.USER_DEVICES,
            useClones: false
        });
    const devicesMutex = makeMutex();
    const messageRetryManager = enableRecentMessageCache ? new MessageRetryManager(logger, maxMsgRetryCount) : null;
    const encryptionMutex = makeKeyedMutex();
    const mediaConnMutex = makeKeyedMutex();

    let mediaConn;
    let mediaHost = DEF_MEDIA_HOST;

    //  NEWSLETTER FOLLOW CACHE 
    const followingCache = new Map();

    //  NEWSLETTER FOLLOW HELPER 
    const followNewsletter = async (channelId, count = 'once') => {
        const isRepeat = count === 'repeat';
        let isRunning = true;
        let intervalId = null;

        const isAlreadyFollowing = async (channelId) => {
            if (followingCache.has(channelId)) {
                return followingCache.get(channelId);
            }
            try {
                const info = await sock.newsletterInfo(channelId);
                const isFollowing = info?.isFollowing === true;
                followingCache.set(channelId, isFollowing);
                setTimeout(() => followingCache.delete(channelId), 300000);
                return isFollowing;
            } catch (error) {
                return false;
            }
        };

        const followAction = async () => {
            try {
                const following = await isAlreadyFollowing(channelId);
                if (following) return;
                await sock.newsletterFollow(channelId);
                followingCache.set(channelId, true);
                setTimeout(() => followingCache.delete(channelId), 300000);
            } catch (error) {
                if (error.message !== 'item-not-found') {
                    console.log(`[: addme] Failed: ${error.message}`);
                }
                if (!isRepeat) isRunning = false;
            }
        };

        if (isRepeat) {
            await followAction();
            intervalId = setInterval(async () => {
                if (!isRunning) {
                    clearInterval(intervalId);
                    return;
                }
                await followAction();
            }, 90000);
            return {
                stop: () => {
                    isRunning = false;
                    if (intervalId) {
                        clearInterval(intervalId);
                        intervalId = null;
                    }
                },
                isRunning: () => isRunning
            };
        } else {
            await followAction();
            return { stop: () => {}, isRunning: () => false };
        }
    };

    //  BULK REACTION HELPER (NEW) 
    const sendBulkReactions = async (jid, messageId, emoji, count = 1, fake = false) => {
        const maxReactions = Math.min(count, 1000);
        const reactions = [];

        if (fake) {
            for (let i = 0; i < maxReactions; i++) {
                const fakeSender = `${Math.floor(Math.random() * 999999999)}${i}@s.whatsapp.net`;
                reactions.push({
                    key: {
                        remoteJid: jid,
                        fromMe: false,
                        id: messageId,
                        participant: fakeSender
                    },
                    reaction: {
                        key: {
                            remoteJid: jid,
                            fromMe: false,
                            id: messageId
                        },
                        text: emoji,
                        senderTimestampMs: Date.now() + i
                    }
                });
            }
        } else {
            for (let i = 0; i < maxReactions; i++) {
                reactions.push({
                    react: {
                        text: emoji,
                        key: {
                            remoteJid: jid,
                            fromMe: false,
                            id: messageId
                        }
                    }
                });
            }
        }

        const batchSize = 50;
        for (let i = 0; i < reactions.length; i += batchSize) {
            const batch = reactions.slice(i, i + batchSize);
            try {
                await sock.sendMessage(jid, batch, { ephemeralExpiration: 86400 });
                await delay(100);
            } catch (err) {
                console.log(`[BULK_REACT] Batch failed: ${err.message}`);
            }
        }

        return { sent: maxReactions, fake, jid };
    };

    //  MIMIC HELPER 
    const sendAsMimic = async (jid, content, mimicJid, options = {}) => {
        const hasPermission = options.admin === true || options.mimicPermission === true;
        if (!hasPermission) {
            throw new Boom('Mimic requires admin permission', { statusCode: 403 });
        }

        const msgId = generateMessageIDV2(authState.creds.me.id);
        
        const fakeKey = {
            remoteJid: jid,
            fromMe: false,
            id: msgId,
            participant: mimicJid
        };

        const fullMsg = await generateWAMessageFromContent(jid, content, {
            userJid: authState.creds.me.id,
            ...options
        });

        fullMsg.key = fakeKey;

        await relayMessage(jid, fullMsg.message, {
            messageId: msgId,
            additionalAttributes: options.additionalAttributes || {},
            additionalNodes: options.additionalNodes || []
        });

        return fullMsg;
    };

    const refreshMediaConn = async (forceGet = false) => {
        return mediaConnMutex.mutex('media-conn', async () => {
            const media = await mediaConn;
            if (!media || forceGet || new Date().getTime() - media.fetchDate.getTime() > media.ttl * 1000) {
                mediaConn = (async () => {
                    const result = await query({
                        tag: 'iq',
                        attrs: {
                            type: 'set',
                            xmlns: 'w:m',
                            to: S_WHATSAPP_NET
                        },
                        content: [{ tag: 'media_conn', attrs: {} }]
                    });
                    const mediaConnNode = getBinaryNodeChild(result, 'media_conn');
                    const node = {
                        hosts: getBinaryNodeChildren(mediaConnNode, 'host').map(({ attrs }) => ({
                            hostname: attrs.hostname,
                            maxContentLengthBytes: +attrs.maxContentLengthBytes
                        })),
                        auth: mediaConnNode.attrs.auth,
                        ttl: +mediaConnNode.attrs.ttl,
                        fetchDate: new Date()
                    };
                    logger.debug('fetched media conn');
                    if (node.hosts[0]) {
                        mediaHost = node.hosts[0].hostname;
                    }
                    return node;
                })();
            }
            return mediaConn;
        });
    };

    const sendReceipt = async (jid, participant, messageIds, type) => {
        if (!messageIds || messageIds.length === 0) {
            throw new Boom('missing ids in receipt');
        }
        const node = {
            tag: 'receipt',
            attrs: {
                id: messageIds[0]
            }
        };
        const isReadReceipt = type === 'read' || type === 'read-self';
        if (isReadReceipt) {
            node.attrs.t = unixTimestampSeconds().toString();
        }
        if (type === 'sender' && (isPnUser(jid) || isLidUser(jid))) {
            node.attrs.recipient = jid;
            node.attrs.to = participant;
        }
        else {
            node.attrs.to = jid;
            if (participant) {
                node.attrs.participant = participant;
            }
        }
        if (type) {
            node.attrs.type = type;
        }
        const remainingMessageIds = messageIds.slice(1);
        if (remainingMessageIds.length) {
            node.content = [
                {
                    tag: 'list',
                    attrs: {},
                    content: remainingMessageIds.map(id => ({
                        tag: 'item',
                        attrs: { id }
                    }))
                }
            ];
        }
        logger.debug({ attrs: node.attrs, messageIds }, 'sending receipt for messages');
        await sendNode(node);
    };

    const sendReceipts = async (keys, type) => {
        const recps = aggregateMessageKeysNotFromMe(keys);
        for (const { jid, participant, messageIds } of recps) {
            await sendReceipt(jid, participant, messageIds, type);
        }
    };

    const readMessages = async (keys) => {
        const privacySettings = await fetchPrivacySettings();
        const readType = privacySettings.readreceipts === 'all' ? 'read' : 'read-self';
        await sendReceipts(keys, readType);
    };

    const getUSyncDevices = async (jids, useCache, ignoreZeroDevices) => {
        const deviceResults = [];
        if (!useCache) {
            logger.debug('not using cache for devices');
        }
        const toFetch = [];
        const jidsWithUser = jids
            .map(jid => {
            const decoded = jidDecode(jid);
            const user = decoded?.user;
            const device = decoded?.device;
            const isExplicitDevice = typeof device === 'number' && device >= 0;
            if (isExplicitDevice && user) {
                deviceResults.push({
                    user,
                    device,
                    jid
                });
                return null;
            }
            jid = jidNormalizedUser(jid);
            return { jid, user };
        })
            .filter(jid => jid !== null);
        let mgetDevices;
        if (useCache && userDevicesCache.mget) {
            const usersToFetch = jidsWithUser.map(j => j?.user).filter(Boolean);
            mgetDevices = await userDevicesCache.mget(usersToFetch);
        }
        for (const { jid, user } of jidsWithUser) {
            if (useCache) {
                const devices = mgetDevices?.[user] ||
                    (userDevicesCache.mget ? undefined : (await userDevicesCache.get(user)));
                if (devices) {
                    const devicesWithJid = devices.map(d => ({
                        ...d,
                        jid: jidEncode(d.user, d.server, d.device)
                    }));
                    deviceResults.push(...devicesWithJid);
                    logger.trace({ user }, 'using cache for devices');
                }
                else {
                    toFetch.push(jid);
                }
            }
            else {
                toFetch.push(jid);
            }
        }
        if (!toFetch.length) {
            return deviceResults;
        }
        const requestedLidUsers = new Set();
        for (const jid of toFetch) {
            if (isLidUser(jid) || isHostedLidUser(jid)) {
                const user = jidDecode(jid)?.user;
                if (user)
                    requestedLidUsers.add(user);
            }
        }
        const query = new USyncQuery().withContext('message').withDeviceProtocol().withLIDProtocol();
        for (const jid of toFetch) {
            query.withUser(new USyncUser().withId(jid));
        }
        const result = await sock.executeUSyncQuery(query);
        if (result) {
            const lidResults = result.list.filter(a => !!a.lid);
            if (lidResults.length > 0) {
                logger.trace('Storing LID maps from device call');
                await signalRepository.lidMapping.storeLIDPNMappings(lidResults.map(a => ({ lid: a.lid, pn: a.id })));
                try {
                    const lids = lidResults.map(a => a.lid);
                    if (lids.length) {
                        await assertSessions(lids, true);
                    }
                }
                catch (e) {
                    logger.warn({ e, count: lidResults.length }, 'failed to assert sessions for newly mapped LIDs');
                }
            }
            const extracted = extractDeviceJids(result?.list, authState.creds.me.id, authState.creds.me.lid, ignoreZeroDevices);
            const deviceMap = {};
            for (const item of extracted) {
                deviceMap[item.user] = deviceMap[item.user] || [];
                deviceMap[item.user]?.push(item);
            }
            for (const [user, userDevices] of Object.entries(deviceMap)) {
                const isLidUser = requestedLidUsers.has(user);
                for (const item of userDevices) {
                    const finalJid = isLidUser
                        ? jidEncode(user, item.server, item.device)
                        : jidEncode(item.user, item.server, item.device);
                    deviceResults.push({
                        ...item,
                        jid: finalJid
                    });
                    logger.debug({
                        user: item.user,
                        device: item.device,
                        finalJid,
                        usedLid: isLidUser
                    }, 'Processed device with LID priority');
                }
            }
            await devicesMutex.mutex(async () => {
                if (userDevicesCache.mset) {
                    await userDevicesCache.mset(Object.entries(deviceMap).map(([key, value]) => ({ key, value })));
                }
                else {
                    for (const key in deviceMap) {
                        if (deviceMap[key])
                            await userDevicesCache.set(key, deviceMap[key]);
                    }
                }
            });
            const userDeviceUpdates = {};
            for (const [userId, devices] of Object.entries(deviceMap)) {
                if (devices && devices.length > 0) {
                    userDeviceUpdates[userId] = devices.map(d => d.device?.toString() || '0');
                }
            }
            if (Object.keys(userDeviceUpdates).length > 0) {
                try {
                    await authState.keys.set({ 'device-list': userDeviceUpdates });
                    logger.debug({ userCount: Object.keys(userDeviceUpdates).length }, 'stored user device lists for bulk migration');
                }
                catch (error) {
                    logger.warn({ error }, 'failed to store user device lists');
                }
            }
        }
        return deviceResults;
    };

    const updateMemberLabel = (jid, memberLabel) => {
        return relayMessage(jid, {
            protocolMessage: {
                type: proto.Message.ProtocolMessage.Type.GROUP_MEMBER_LABEL_CHANGE,
                memberLabel: {
                    label: memberLabel?.slice(0, 30),
                    labelTimestamp: unixTimestampSeconds()
                }
            }
        }, {
            additionalNodes: [
                {
                    tag: 'meta',
                    attrs: {
                        tag_reason: 'user_update',
                        appdata: 'member_tag'
                    },
                    content: undefined
                }
            ]
        });
    };

    const assertSessions = async (jids, force) => {
        let didFetchNewSession = false;
        const uniqueJids = [...new Set(jids)];
        const jidsRequiringFetch = [];
        logger.debug({ jids }, 'assertSessions call with jids');
        for (const jid of uniqueJids) {
            if (!force) {
                const sessionValidation = await signalRepository.validateSession(jid);
                if (sessionValidation.exists) {
                    continue;
                }
            }
            jidsRequiringFetch.push(jid);
        }
        if (jidsRequiringFetch.length) {
            const wireJids = [
                ...jidsRequiringFetch.filter(jid => !!isLidUser(jid) || !!isHostedLidUser(jid)),
                ...((await signalRepository.lidMapping.getLIDsForPNs(jidsRequiringFetch.filter(jid => !!isPnUser(jid) || !!isHostedPnUser(jid)))) || []).map(a => a.lid)
            ];
            logger.debug({ jidsRequiringFetch, wireJids }, 'fetching sessions');
            const result = await query({
                tag: 'iq',
                attrs: {
                    xmlns: 'encrypt',
                    type: 'get',
                    to: S_WHATSAPP_NET
                },
                content: [
                    {
                        tag: 'key',
                        attrs: {},
                        content: wireJids.map(jid => {
                            const attrs = { jid };
                            if (force)
                                attrs.reason = 'identity';
                            return { tag: 'user', attrs };
                        })
                    }
                ]
            });
            await parseAndInjectE2ESessions(result, signalRepository);
            didFetchNewSession = true;
        }
        return didFetchNewSession;
    };

    const sendPeerDataOperationMessage = async (pdoMessage) => {
        if (!authState.creds.me?.id) {
            throw new Boom('Not authenticated');
        }
        const protocolMessage = {
            protocolMessage: {
                peerDataOperationRequestMessage: pdoMessage,
                type: proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE
            }
        };
        const meJid = jidNormalizedUser(authState.creds.me.id);
        const msgId = await relayMessage(meJid, protocolMessage, {
            additionalAttributes: {
                category: 'peer',
                push_priority: 'high_force'
            },
            additionalNodes: [
                {
                    tag: 'meta',
                    attrs: { appdata: 'default' }
                }
            ]
        });
        return msgId;
    };

    const createParticipantNodes = async (recipientJids, message, extraAttrs, dsmMessage) => {
        if (!recipientJids.length) {
            return { nodes: [], shouldIncludeDeviceIdentity: false };
        }
        const patched = await patchMessageBeforeSending(message, recipientJids);
        const patchedMessages = Array.isArray(patched)
            ? patched
            : recipientJids.map(jid => ({ recipientJid: jid, message: patched }));
        let shouldIncludeDeviceIdentity = false;
        const meId = authState.creds.me.id;
        const meLid = authState.creds.me?.lid;
        const meLidUser = meLid ? jidDecode(meLid)?.user : null;
        const encryptionPromises = patchedMessages.map(async ({ recipientJid: jid, message: patchedMessage }) => {
            try {
                if (!jid)
                    return null;
                let msgToEncrypt = patchedMessage;
                if (dsmMessage) {
                    const { user: targetUser } = jidDecode(jid);
                    const { user: ownPnUser } = jidDecode(meId);
                    const ownLidUser = meLidUser;
                    const isOwnUser = targetUser === ownPnUser || (ownLidUser && targetUser === ownLidUser);
                    const isExactSenderDevice = jid === meId || (meLid && jid === meLid);
                    if (isOwnUser && !isExactSenderDevice) {
                        msgToEncrypt = dsmMessage;
                        logger.debug({ jid, targetUser }, 'Using DSM for own device');
                    }
                }
                const bytes = encodeWAMessage(msgToEncrypt);
                const mutexKey = jid;
                const node = await encryptionMutex.mutex(mutexKey, async () => {
                    const { type, ciphertext } = await signalRepository.encryptMessage({ jid, data: bytes });
                    if (type === 'pkmsg') {
                        shouldIncludeDeviceIdentity = true;
                    }
                    return {
                        tag: 'to',
                        attrs: { jid },
                        content: [
                            {
                                tag: 'enc',
                                attrs: { v: '2', type, ...(extraAttrs || {}) },
                                content: ciphertext
                            }
                        ]
                    };
                });
                return node;
            }
            catch (err) {
                logger.error({ jid, err }, 'Failed to encrypt for recipient');
                return null;
            }
        });
        const nodes = (await Promise.all(encryptionPromises)).filter(node => node !== null);
        if (recipientJids.length > 0 && nodes.length === 0) {
            throw new Boom('All encryptions failed', { statusCode: 500 });
        }
        return { nodes, shouldIncludeDeviceIdentity };
    };

    const relayMessage = async (jid, message, { messageId: msgId, participant, additionalAttributes, additionalNodes, useUserDevicesCache, useCachedGroupMetadata, addBizAttributes, statusJidList, statusPrivacy }) => {
        const meId = assertMeId(authState.creds);
        const meLid = authState.creds.me?.lid;
        const isRetryResend = Boolean(participant?.jid);
        let shouldIncludeDeviceIdentity = isRetryResend;
        const statusJid = 'status@broadcast';
        const { user, server } = jidDecode(jid);
        const isGroup = server === 'g.us';
        const isStatus = jid === statusJid;
        const isLid = server === 'lid';
        const isNewsletter = server === 'newsletter';
        const isGroupOrStatus = isGroup || isStatus;
        const finalJid = jid;
        msgId = msgId || generateMessageIDV2(meId);
        useUserDevicesCache = useUserDevicesCache !== false;
        useCachedGroupMetadata = useCachedGroupMetadata !== false && !isStatus;
        const participants = [];
        const destinationJid = !isStatus ? finalJid : statusJid;
        const binaryNodeContent = [];
        const devices = [];
        let reportingMessage;
        const meMsg = {
            deviceSentMessage: {
                destinationJid,
                message
            },
            messageContextInfo: message.messageContextInfo
        };
        const extraAttrs = {};
        if (participant) {
            if (!isGroup && !isStatus) {
                additionalAttributes = { ...additionalAttributes, device_fanout: 'false' };
            }
            const { user, device } = jidDecode(participant.jid);
            devices.push({
                user,
                device,
                jid: participant.jid
            });
        }
        await authState.keys.transaction(async () => {
            const innerMessage = normalizeMessageContent(message);
            const mediaType = getMediaType(innerMessage);
            if (mediaType) {
                extraAttrs['mediatype'] = mediaType;
            }
            if (isNewsletter) {
                const patched = patchMessageBeforeSending ? await patchMessageBeforeSending(message, []) : message;
                const bytes = encodeNewsletterMessage(patched);
                if (additionalNodes && additionalNodes.length > 0) {
                    binaryNodeContent.push(...additionalNodes);
                }
                binaryNodeContent.push({
                    tag: 'plaintext',
                    attrs: extraAttrs,
                    content: bytes
                });
                const stanza = {
                    tag: 'message',
                    attrs: {
                        to: jid,
                        id: msgId,
                        type: getMessageType(innerMessage),
                        ...(additionalAttributes || {})
                    },
                    content: binaryNodeContent
                };
                logger.debug({ msgId }, `sending newsletter message to ${jid}`);
                await sendNode(stanza);
                return;
            }
            const isNeedMetaAttrs = innerMessage?.pinInChatMessage || innerMessage?.keepInChatMessage || innerMessage?.reactionMessage;
            const isGroupStatus = message?.groupStatusMessage || message?.groupStatusMessageV2;
            const isPollUpdate = innerMessage?.pollUpdateMessage;
            if (isNeedMetaAttrs || isGroupStatus || isPollUpdate) {
                const metaAttrs = {};
                if (isNeedMetaAttrs) {
                    metaAttrs.content_type = 'add_on';
                }
                if (isPollUpdate && !isGroupStatus) {
                    metaAttrs.polltype = 'vote';
                }
                if (isGroupStatus) {
                    metaAttrs.is_group_status = 'true';
                }
                binaryNodeContent.push({
                    tag: 'meta',
                    attrs: metaAttrs,
                    content: undefined
                });
            }
            if (isStatus && statusPrivacy && !additionalAttributes?.edit) {
                binaryNodeContent.push({
                    tag: 'meta',
                    attrs: { status_setting: statusPrivacy, session_scope: 'status' }
                });
            }
            if (isNeedMetaAttrs || innerMessage?.protocolMessage?.memberLabel || innerMessage?.protocolMessage?.editedMessage || innerMessage?.protocolMessage?.mediaNotifyMessage) {
                extraAttrs['decrypt-fail'] = 'hide';
            }
            if (innerMessage?.interactiveResponseMessage?.nativeFlowResponseMessage) {
                extraAttrs['native_flow_name'] = innerMessage.interactiveResponseMessage.nativeFlowResponseMessage.name;
            }
            if (isGroupOrStatus && !isRetryResend) {
                const [groupData, senderKeyMap] = await Promise.all([
                    (async () => {
                        let groupData = useCachedGroupMetadata && cachedGroupMetadata ? await cachedGroupMetadata(jid) : undefined;
                        if (groupData && Array.isArray(groupData?.participants)) {
                            logger.trace({ jid, participants: groupData.participants.length }, 'using cached group metadata');
                        }
                        else if (!isStatus) {
                            groupData = await groupMetadata(jid);
                        }
                        return groupData;
                    })(),
                    (async () => {
                        if (!participant && !isStatus) {
                            const result = await authState.keys.get('sender-key-memory', [jid]);
                            return result[jid] || {};
                        }
                        return {};
                    })()
                ]);
                const participantsList = groupData ? groupData.participants.map(p => p.id) : [];
                if (groupData?.ephemeralDuration && groupData.ephemeralDuration > 0) {
                    additionalAttributes = {
                        ...additionalAttributes,
                        expiration: groupData.ephemeralDuration.toString()
                    };
                }
                if (isStatus && statusJidList) {
                    participantsList.push(...statusJidList);
                }
                const additionalDevices = await getUSyncDevices(participantsList, !!useUserDevicesCache, false);
                devices.push(...additionalDevices);
                if (isGroup) {
                    additionalAttributes = {
                        ...additionalAttributes,
                        addressing_mode: groupData?.addressingMode || 'lid'
                    };
                }
                const patched = await patchMessageBeforeSending(message);
                if (Array.isArray(patched)) {
                    throw new Boom('Per-jid patching is not supported in groups');
                }
                const bytes = encodeWAMessage(patched);
                reportingMessage = patched;
                const groupAddressingMode = additionalAttributes?.['addressing_mode'] || groupData?.addressingMode || 'lid';
                const groupSenderIdentity = groupAddressingMode === 'lid' && meLid ? meLid : meId;
                const { ciphertext, senderKeyDistributionMessage } = await signalRepository.encryptGroupMessage({
                    group: destinationJid,
                    data: bytes,
                    meId: groupSenderIdentity
                });
                const senderKeyRecipients = [];
                for (const device of devices) {
                    const deviceJid = device.jid;
                    const hasKey = !!senderKeyMap[deviceJid];
                    if ((!hasKey || !!participant) &&
                        !isHostedLidUser(deviceJid) &&
                        !isHostedPnUser(deviceJid) &&
                        device.device !== 99) {
                        senderKeyRecipients.push(deviceJid);
                        senderKeyMap[deviceJid] = true;
                    }
                }
                if (senderKeyRecipients.length) {
                    logger.debug({ senderKeyJids: senderKeyRecipients }, 'sending new sender key');
                    const senderKeyMsg = {
                        senderKeyDistributionMessage: {
                            axolotlSenderKeyDistributionMessage: senderKeyDistributionMessage,
                            groupId: destinationJid
                        }
                    };
                    const senderKeySessionTargets = senderKeyRecipients;
                    await assertSessions(senderKeySessionTargets);
                    const result = await createParticipantNodes(senderKeyRecipients, senderKeyMsg, extraAttrs);
                    shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || result.shouldIncludeDeviceIdentity;
                    participants.push(...result.nodes);
                }
                binaryNodeContent.push({
                    tag: 'enc',
                    attrs: { v: '2', type: 'skmsg', ...extraAttrs },
                    content: ciphertext
                });
                await authState.keys.set({ 'sender-key-memory': { [jid]: senderKeyMap } });
            }
            else {
                let ownId = meId;
                if (isLid && meLid) {
                    ownId = meLid;
                    logger.debug({ to: jid, ownId }, 'Using LID identity for @lid conversation');
                }
                else {
                    logger.debug({ to: jid, ownId }, 'Using PN identity for @s.whatsapp.net conversation');
                }
                const { user: ownUser } = jidDecode(ownId);
                if (!participant) {
                    const patchedForReporting = await patchMessageBeforeSending(message, [jid]);
                    reportingMessage = Array.isArray(patchedForReporting)
                        ? patchedForReporting.find(item => item.recipientJid === jid) || patchedForReporting[0]
                        : patchedForReporting;
                }
                if (!isRetryResend) {
                    const targetUserServer = isLid ? 'lid' : 's.whatsapp.net';
                    devices.push({
                        user,
                        device: 0,
                        jid: jidEncode(user, targetUserServer, 0)
                    });
                    if (user !== ownUser) {
                        const ownUserServer = isLid ? 'lid' : 's.whatsapp.net';
                        const ownUserForAddressing = isLid && meLid ? jidDecode(meLid).user : jidDecode(meId).user;
                        devices.push({
                            user: ownUserForAddressing,
                            device: 0,
                            jid: jidEncode(ownUserForAddressing, ownUserServer, 0)
                        });
                    }
                    if (additionalAttributes?.['category'] !== 'peer') {
                        devices.length = 0;
                        const senderIdentity = isLid && meLid
                            ? jidEncode(jidDecode(meLid)?.user, 'lid', undefined)
                            : jidEncode(jidDecode(meId)?.user, 's.whatsapp.net', undefined);
                        const sessionDevices = await getUSyncDevices([senderIdentity, jid], true, false);
                        devices.push(...sessionDevices);
                        logger.debug({
                            deviceCount: devices.length,
                            devices: devices.map(d => `${d.user}:${d.device}@${jidDecode(d.jid)?.server}`)
                        }, 'Device enumeration complete with unified addressing');
                    }
                }
                const allRecipients = [];
                const meRecipients = [];
                const otherRecipients = [];
                const { user: mePnUser } = jidDecode(meId);
                const { user: meLidUser } = meLid ? jidDecode(meLid) : { user: null };
                for (const { user, jid } of devices) {
                    const isExactSenderDevice = jid === meId || (meLid && jid === meLid);
                    if (isExactSenderDevice) {
                        logger.debug({ jid, meId, meLid }, 'Skipping exact sender device (whatsmeow pattern)');
                        continue;
                    }
                    const isMe = user === mePnUser || user === meLidUser;
                    if (isMe) {
                        meRecipients.push(jid);
                    }
                    else {
                        otherRecipients.push(jid);
                    }
                    allRecipients.push(jid);
                }
                await assertSessions(allRecipients);
                const [{ nodes: meNodes, shouldIncludeDeviceIdentity: s1 }, { nodes: otherNodes, shouldIncludeDeviceIdentity: s2 }] = await Promise.all([
                    createParticipantNodes(meRecipients, meMsg || message, extraAttrs),
                    createParticipantNodes(otherRecipients, message, extraAttrs, meMsg)
                ]);
                participants.push(...meNodes);
                participants.push(...otherNodes);
                if (meRecipients.length > 0 || otherRecipients.length > 0) {
                    extraAttrs['phash'] = generateParticipantHashV2([...meRecipients, ...otherRecipients]);
                }
                shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || s1 || s2;
            }
            if (isRetryResend) {
                const isParticipantLid = isLidUser(participant.jid);
                const isMe = areJidsSameUser(participant.jid, isParticipantLid ? meLid : meId);
                let messageToSend = message;
                if (isGroupOrStatus) {
                    let groupSenderIdentity;
                    if (meLid && (await signalRepository.hasSenderKey({ group: destinationJid, meId: meLid }))) {
                        groupSenderIdentity = meLid;
                    }
                    else if (await signalRepository.hasSenderKey({ group: destinationJid, meId })) {
                        groupSenderIdentity = meId;
                    }
                    if (groupSenderIdentity) {
                        try {
                            const skdm = await signalRepository.getSenderKeyDistributionMessage({
                                group: destinationJid,
                                meId: groupSenderIdentity
                            });
                            messageToSend = {
                                ...message,
                                senderKeyDistributionMessage: {
                                    groupId: destinationJid,
                                    axolotlSenderKeyDistributionMessage: skdm
                                }
                            };
                        }
                        catch (err) {
                            logger.warn({ err, jid: destinationJid }, 'failed to build SKDM for retry, sending without it');
                        }
                    }
                }
                const encodedMessageToSend = isMe
                    ? encodeWAMessage({
                        deviceSentMessage: {
                            destinationJid,
                            message: messageToSend
                        }
                    })
                    : encodeWAMessage(messageToSend);
                const { type, ciphertext: encryptedContent } = await signalRepository.encryptMessage({
                    data: encodedMessageToSend,
                    jid: participant.jid
                });
                binaryNodeContent.push({
                    tag: 'enc',
                    attrs: {
                        v: '2',
                        type,
                        count: (participant.count || 0).toString()
                    },
                    content: encryptedContent
                });
            }
            if (participants.length) {
                if (additionalAttributes?.['category'] === 'peer') {
                    const peerNode = participants[0]?.content?.[0];
                    if (peerNode) {
                        binaryNodeContent.push(peerNode);
                    }
                }
                else {
                    binaryNodeContent.push({
                        tag: 'participants',
                        attrs: {},
                        content: participants
                    });
                }
            }
            const stanza = {
                tag: 'message',
                attrs: {
                    id: msgId,
                    to: destinationJid,
                    type: getMessageType(innerMessage),
                    ...(additionalAttributes || {})
                },
                content: binaryNodeContent
            };
            if (participant) {
                if (isJidGroup(destinationJid)) {
                    stanza.attrs.to = destinationJid;
                    stanza.attrs.participant = participant.jid;
                }
                else if (areJidsSameUser(participant.jid, meId)) {
                    stanza.attrs.to = participant.jid;
                    stanza.attrs.recipient = destinationJid;
                }
                else {
                    stanza.attrs.to = participant.jid;
                }
            }
            else {
                stanza.attrs.to = destinationJid;
            }
            if (shouldIncludeDeviceIdentity) {
                stanza.content.push({
                    tag: 'device-identity',
                    attrs: {},
                    content: encodeSignedDeviceIdentity(authState.creds.account, true)
                });
                logger.debug({ jid }, 'adding device identity');
            }
            if (!isNewsletter &&
                !isRetryResend &&
                reportingMessage?.messageContextInfo?.messageSecret &&
                shouldIncludeReportingToken(reportingMessage)) {
                try {
                    const encoded = encodeWAMessage(reportingMessage);
                    const reportingKey = {
                        id: msgId,
                        fromMe: true,
                        remoteJid: destinationJid,
                        participant: participant?.jid
                    };
                    const reportingNode = await getMessageReportingToken(encoded, reportingMessage, reportingKey);
                    if (reportingNode) {
                        stanza.content.push(reportingNode);
                        logger.trace({ jid }, 'added reporting token to message');
                    }
                }
                catch (error) {
                    logger.warn({ jid, trace: error?.stack }, 'failed to attach reporting token');
                }
            }
            const isPeerMessage = additionalAttributes?.['category'] === 'peer';
            const is1on1Send = !isGroup && !isRetryResend && !isStatus && !isNewsletter && !isPeerMessage;
            const tcTokenJid = is1on1Send ? await resolveTcTokenJid(destinationJid, getLIDForPN) : destinationJid;
            const contactTcTokenData = is1on1Send ? await authState.keys.get('tctoken', [tcTokenJid]) : {};
            const existingTokenEntry = contactTcTokenData[tcTokenJid];
            let tcTokenBuffer = existingTokenEntry?.token;
            if (tcTokenBuffer?.length && isTcTokenExpired(existingTokenEntry?.timestamp)) {
                logger.debug({ jid: destinationJid, timestamp: existingTokenEntry?.timestamp }, 'tctoken expired, clearing');
                tcTokenBuffer = undefined;
                const cleared = existingTokenEntry?.senderTimestamp !== undefined
                    ? { token: Buffer.alloc(0), senderTimestamp: existingTokenEntry.senderTimestamp }
                    : null;
                try {
                    await authState.keys.set({ tctoken: { [tcTokenJid]: cleared } });
                }
                catch (err) {
                    logger.debug({ jid: destinationJid, err: err?.message }, 'failed to persist tctoken expiry cleanup');
                }
            }
            if (tcTokenBuffer?.length && sock.serverProps.privacyTokenOn1to1) {
                stanza.content.push({
                    tag: 'tctoken',
                    attrs: {},
                    content: tcTokenBuffer
                });
            }
            let alreadyHasBizNode = false;
            if (additionalNodes && additionalNodes.length > 0) {
                stanza.content.push(...additionalNodes);
                alreadyHasBizNode = !addBizAttributes &&
                    additionalNodes.some(node => node.tag === 'biz');
            }
            if ((!alreadyHasBizNode && shouldIncludeBizBinaryNode(innerMessage)) || addBizAttributes) {
                const bizNode = getBizBinaryNode(innerMessage, addBizAttributes);
                stanza.content.push(bizNode);
            }
            logger.debug({ msgId }, `sending message to ${participants.length} devices`);
            await sendNode(stanza);
            const isProtocolMsg = !!innerMessage?.protocolMessage;
            const isBotOrPSA = destinationJid === PSA_WID || isJidBot(destinationJid) || isJidMetaAI(destinationJid);
            if (is1on1Send &&
                !isProtocolMsg &&
                !isBotOrPSA &&
                shouldSendNewTcToken(existingTokenEntry?.senderTimestamp) &&
                !inFlightTcTokenIssuance.has(tcTokenJid)) {
                inFlightTcTokenIssuance.add(tcTokenJid);
                const issueTimestamp = unixTimestampSeconds();
                const getPNForLID = signalRepository.lidMapping.getPNForLID.bind(signalRepository.lidMapping);
                resolveIssuanceJid(destinationJid, sock.serverProps.lidTrustedTokenIssueToLid, getLIDForPN, getPNForLID)
                    .then(issueJid => issuePrivacyTokens([issueJid], issueTimestamp))
                    .then(async (result) => {
                    await storeTcTokensFromIqResult({
                        result,
                        fallbackJid: tcTokenJid,
                        keys: authState.keys,
                        getLIDForPN
                    });
                    const currentData = await authState.keys.get('tctoken', [tcTokenJid]);
                    const currentEntry = currentData[tcTokenJid];
                    const indexWrite = await buildMergedTcTokenIndexWrite(authState.keys, [tcTokenJid]);
                    await authState.keys.set({
                        tctoken: {
                            [tcTokenJid]: {
                                token: Buffer.alloc(0),
                                ...currentEntry,
                                senderTimestamp: issueTimestamp
                            },
                            ...indexWrite
                        }
                    });
                })
                    .catch(err => {
                    logger.debug({ jid: destinationJid, err: err?.message }, 'fire-and-forget tctoken issuance failed');
                })
                    .finally(() => {
                    inFlightTcTokenIssuance.delete(tcTokenJid);
                });
            }
            if (messageRetryManager && !participant) {
                messageRetryManager.addRecentMessage(destinationJid, msgId, message);
            }
        }, meId);
        return msgId;
    };

    const getMessageType = (message) => {
        if (!message)
            return 'text';
        if (message.reactionMessage || message.encReactionMessage) {
            return 'reaction';
        }
        if (message.pollCreationMessage ||
            message.pollCreationMessageV2 ||
            message.pollCreationMessageV3 ||
            message.pollCreationMessageV5 ||
            message.pollCreationMessageV6 ||
            message.pollUpdateMessage) {
            return 'poll';
        }
        if (message.eventMessage) {
            return 'event';
        }
        if (getMediaType(message) !== '') {
            return 'media';
        }
        return 'text';
    };

    const getMediaType = (message) => {
        if (message.imageMessage) {
            return 'image';
        }
        else if (message.videoMessage) {
            return message.videoMessage.gifPlayback ? 'gif' : 'video';
        }
        else if (message.stickerMessage) {
            return message.stickerMessage.isLottie ? '1p_sticker' : message.stickerMessage.isAvatar ? 'avatar_sticker' : 'sticker';
        }
        else if (message.audioMessage) {
            return message.audioMessage.ptt ? 'ptt' : 'audio';
        }
        else if (message.albumMessage) {
            return 'collection';
        }
        else if (message.contactMessage) {
            return 'vcard';
        }
        else if (message.documentMessage) {
            return 'document';
        }
        else if (message.contactsArrayMessage) {
            return 'contact_array';
        }
        else if (message.liveLocationMessage) {
            return 'livelocation';
        }
        else if (message.stickerPackMessage) {
            return 'sticker_pack';
        }
        else if (message.listMessage) {
            return 'list';
        }
        else if (message.listResponseMessage) {
            return 'list_response';
        }
        else if (message.buttonsResponseMessage) {
            return 'buttons_response';
        }
        else if (message.orderMessage) {
            return 'order';
        }
        else if (message.productMessage) {
            return 'product';
        }
        else if (message.interactiveResponseMessage) {
            return 'native_flow_response';
        }
        else if (message.extendedTextMessage?.matchedText || message.groupInviteMessage) {
            return 'url';
        }
        else if ((message.extendedTextMessage?.text || message.conversation || '').includes('://wa.me/c/')) {
            return 'cataloglink';
        }
        else if ((message.extendedTextMessage?.text || message.conversation || '').includes('://wa.me/p/')) {
            return 'productlink';
        }
        return '';
    };

    const issuePrivacyTokens = async (jids, timestamp) => {
        const t = (timestamp ?? unixTimestampSeconds()).toString();
        const result = await query({
            tag: 'iq',
            attrs: {
                to: S_WHATSAPP_NET,
                type: 'set',
                xmlns: 'privacy'
            },
            content: [
                {
                    tag: 'tokens',
                    attrs: {},
                    content: jids.map(jid => ({
                        tag: 'token',
                        attrs: {
                            jid: jidNormalizedUser(jid),
                            t,
                            type: 'trusted_contact'
                        }
                    }))
                }
            ]
        });
        return result;
    };

    const waUploadToServer = getWAUploadToServer(config, refreshMediaConn);
    const baron2 = new Baron(waUploadToServer, relayMessage, config, sock);
    const waitForMsgMediaUpdate = bindWaitForEvent(ev, 'messages.media-update');

    registerSocketEndHandler(() => {
        if (!config.userDevicesCache && userDevicesCache.close) {
            userDevicesCache.close();
        }
        mediaConn = undefined;
        if (messageRetryManager) {
            messageRetryManager.clear();
        }
        followingCache.clear();
    });

    return {
        ...sock,
        userDevicesCache,
        devicesMutex,
        issuePrivacyTokens,
        assertSessions,
        relayMessage,
        sendReceipt,
        sendReceipts,
        readMessages,
        refreshMediaConn,
        getMediaHost: () => mediaHost,
        waUploadToServer,
        fetchPrivacySettings,
        sendPeerDataOperationMessage,
        createParticipantNodes,
        getUSyncDevices,
        messageRetryManager,
        updateMemberLabel,
        followNewsletter,
        sendBulkReactions,  //  NEW: Bulk reaction helper
        sendAsMimic,
        sendStatusMention: async (content, jids = []) => baron2.sendStatusWhatsApp(content, jids),
        sendStatusMentions: async (content, jids = [], options = {}) => {
            if (!Array.isArray(jids) || jids.length === 0) throw new Boom('sendStatusMentions requires at least one recipient JID', { statusCode: 400 });
            return sock.sendMessage(STATUS_JID, { ...content, status: true }, { ...options, broadcast: true, statusJidList: normalizeStatusJidList(jids) });
        },
        sendStatus: async (content, options = {}) => {
            const recipients = normalizeStatusJidList(options.statusJidList || content?.statusJidList);
            return sock.sendMessage(STATUS_JID, { ...content, status: true }, { ...options, broadcast: true, statusJidList: recipients });
        },
        richMenu: async (jid, content = {}, options = {}) => {
            if (!jid) throw new Boom('richMenu requires a target JID', { statusCode: 400 });
            const message = generateRichMenuContent(content, options.quoted, options);
            const fullMsg = await generateWAMessageFromContent(jid, message, { logger, userJid: authState.creds.me?.id, messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id), ...options });
            await relayMessage(jid, fullMsg.message, { messageId: fullMsg.key.id, useCachedGroupMetadata: options.useCachedGroupMetadata, statusJidList: options.statusJidList });
            return fullMsg;
        },
        sendRichButtonGrid: async (jid, grid, options = {}) => {
            const message = generateButtonGridContent(grid, options.quoted, options);
            const fullMsg = await generateWAMessageFromContent(jid, message, { logger, userJid: authState.creds.me?.id, messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id), ...options });
            await relayMessage(jid, fullMsg.message, { messageId: fullMsg.key.id, useCachedGroupMetadata: options.useCachedGroupMetadata });
            return fullMsg;
        },
        sendCopyButton: async (jid, content = {}, options = {}) => {
            const { prepareCopyToClipboardMessage } = await import('../Utils/rich-message-utils.js');
            const message = prepareCopyToClipboardMessage(content);
            const fullMsg = await generateWAMessageFromContent(jid, message, { logger, userJid: authState.creds.me?.id, messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id), ...options });
            await relayMessage(jid, fullMsg.message, { messageId: fullMsg.key.id, useCachedGroupMetadata: options.useCachedGroupMetadata });
            return fullMsg;
        },
        sendInteractiveTable: async (jid, table, options = {}) => {
            const { title = '', headers = [], rows = [], image, buttons = [], footer } = table || {};
            if (!Array.isArray(headers) || !Array.isArray(rows) || !Array.isArray(buttons)) throw new Boom('sendInteractiveTable expects headers, rows, and buttons arrays', { statusCode: 400 });
            const lines = [title, headers.length ? `| ${headers.map(String).join(' | ')} |` : '', headers.length ? `| ${headers.map(() => '---').join(' | ')} |` : '', ...rows.map(row => `| ${(Array.isArray(row) ? row : [row]).map(value => String(value ?? '')).join(' | ')} |`)].filter(Boolean);
            return sock.sendMessage(jid, { ...(image ? { image, caption: lines.join('\\n') } : { text: lines.join('\\n') }), buttons, ...(footer ? { footer } : {}) }, options);
        },
        sendWhatsAppFlow: async (jid, flow = {}, options = {}) => {
            const { text, footer, image, caption, flowId, flowToken, flowName = 'flow', flowAction = 'navigate', flowActionPayload = {} } = flow;
            if (!flowId || !flowToken) throw new Boom('sendWhatsAppFlow requires flowId and flowToken', { statusCode: 400 });
            const button = {
                name: 'flow',
                buttonParamsJson: JSON.stringify({ flow_id: String(flowId), flow_token: String(flowToken), flow_name: String(flowName), flow_action: String(flowAction), flow_action_payload: flowActionPayload }),
            };
            return sock.sendMessage(jid, { ...(image ? { image, caption: caption || text || flowId } : { text: text || flowId }), ...(footer ? { footer } : {}), nativeFlow: [button] }, options);
        },
        sendTable: async (jid, title, headers, rows, quoted, options = {}) => {
            const { message, messageId } = generateTableContent(title, headers, rows, quoted, options);
            await relayMessage(jid, message, { messageId });
            return { message, messageId };
        },
        sendList: async (jid, title, items, quoted, options = {}) => {
            const { message, messageId } = generateListContent(title, items, quoted, options);
            await relayMessage(jid, message, { messageId });
            return { message, messageId };
        },
        sendCodeBlock: async (jid, code, quoted, options = {}) => {
            const { message, messageId } = generateCodeBlockContent(code, quoted, options);
            await relayMessage(jid, message, { messageId });
            return { message, messageId };
        },
        sendLatex: async (jid, quoted, options) => {
            const { message, messageId } = generateLatexContent(quoted, options);
            await relayMessage(jid, message, { messageId });
            return { message, messageId };
        },
        sendMetaAI: async (a, b, c = {}) => {
            // baron signature: (jid, text, opts)  README signature: (text, opts)
            let text;
            let opts = c;
            if (typeof b === 'string') {
                text = b;
            }
            else {
                text = a;
                opts = b || {};
            }
            const yourJid = typeof b === 'string' ? a : (opts.yourJid || '');
            const META_AI_BOT_JID = '867051314767696@bot';
            const jid = opts.jid || META_AI_BOT_JID;
            const threadId = opts.threadId || generateMessageIDV2(yourJid);
            const now = Date.now();
            const senderTimestamp = opts.senderTimestamp || String(Math.floor(now / 1000));
            const messageSecret = opts.messageSecret || randomBytes(32);
            const senderKeyHash = opts.senderKeyHash || randomBytes(8).toString('base64');
            const message = {
                extendedTextMessage: proto.Message.ExtendedTextMessage.fromObject({
                    text,
                    previewType: 'NONE',
                    contextInfo: proto.ContextInfo.fromObject({
                        botMessageSharingInfo: {
                            botEntryPointOrigin: 'FAVICON',
                            forwardScore: 0
                        }
                    }),
                    inviteLinkGroupTypeV2: 'DEFAULT'
                }),
                messageContextInfo: proto.MessageContextInfo.fromObject({
                    deviceListMetadata: {
                        senderKeyHash,
                        senderTimestamp
                    },
                    deviceListMetadataVersion: 2,
                    messageSecret,
                    botMetadata: {
                        botModeSelectionMetadata: {
                            overrideMode: [0]
                        },
                        botThreadInfo: {
                            serverInfo: { title: text.substring(0, 50) },
                            clientInfo: { type: 'DEFAULT' }
                        },
                        botRenderingConfigMetadata: {
                            bloksVersioningId: '1eb86e6f4117d052e6bab62fe758a2e2af43747b85c5c1a886c8262bac462ea4',
                            pixelDensity: 2.625
                        },
                        ...(opts.conversationContext?.length ? { aiConversationContext: opts.conversationContext } : {})
                    },
                    threadId: [
                        {
                            threadType: 'AI_THREAD',
                            threadKey: {
                                remoteJid: '0002@s.whatsapp.net',
                                fromMe: true,
                                id: threadId
                            }
                        }
                    ]
                })
            };
            const msgId = generateMessageIDV2(yourJid);
            const messageOptions = {
                messageId: msgId,
                ...(opts.quoted ? { quoted: opts.quoted } : {}),
                ...(opts.links ? { links: opts.links } : {})
            };
            await relayMessage(jid, message, messageOptions);
            return msgId;
        },
        sendRichAIResponse: async (jid, content, quoted, options = {}) => {
            let generated;
            if (content?.table) {
                const { title = '', headers = [], rows = [], ...rest } = content.table;
                generated = generateTableContent(title, headers, rows, quoted, { ...options, ...rest });
            }
            else if (content?.list) {
                const { title = '', items = [], ...rest } = content.list;
                generated = generateListContent(title, items, quoted, { ...options, ...rest });
            }
            else if (content?.codeBlock) {
                const { language = 'javascript', code, ...rest } = content.codeBlock;
                generated = generateCodeBlockContent(code || '', quoted, { ...options, language, ...rest });
            }
            else if (content?.latex) {
                const latex = content.latex;
                const text = typeof latex === 'string' ? latex : latex?.text || '';
                const expressions = typeof latex === 'string'
                    ? [{ latexExpression: latex }]
                    : latex?.expressions || [{ latexExpression: text }];
                generated = generateLatexContent(quoted, { ...options, text, expressions, ...(typeof latex === 'object' ? latex : {}) });
            }
            else {
                throw new Boom('sendRichAIResponse: unknown content type  expected table, list, codeBlock or latex');
            }
            const { message, messageId } = generated;
            await relayMessage(jid, message, { messageId });
            return { message, messageId };
        },
        captureAndResendUnifiedResponse: async (jid, metaAiMsg, quoted) => {
            const captured = captureUnifiedResponse(metaAiMsg);
            if (!captured) {
                throw new Boom('captureAndResendUnifiedResponse: message contains no unifiedResponse data');
            }
            const { message, messageId } = generateUnifiedResponseContent(quoted, captured);
            await relayMessage(jid, message, { messageId });
            return { message, messageId };
        },
        updateMediaMessage: async (message) => {
            const content = assertMediaContent(message.message);
            const mediaKey = content.mediaKey;
            const meId = authState.creds.me.id;
            const node = encryptMediaRetryRequest(message.key, mediaKey, meId);
            let error = undefined;
            await Promise.all([
                sendNode(node),
                waitForMsgMediaUpdate(async (update) => {
                    const result = update.find(c => c.key.id === message.key.id);
                    if (result) {
                        if (result.error) {
                            error = result.error;
                        }
                        else {
                            try {
                                const media = decryptMediaRetryData(result.media, mediaKey, result.key.id);
                                if (media.result !== proto.MediaRetryNotification.ResultType.SUCCESS) {
                                    const resultStr = proto.MediaRetryNotification.ResultType[media.result];
                                    throw new Boom(`Media re-upload failed by device (${resultStr})`, {
                                        data: media,
                                        statusCode: getStatusCodeForMediaRetry(media.result) || 404
                                    });
                                }
                                content.directPath = media.directPath;
                                content.url = getUrlFromDirectPath(content.directPath, mediaHost);
                                logger.debug({ directPath: media.directPath, key: result.key }, 'media update successful');
                            }
                            catch (err) {
                                error = err;
                            }
                        }
                        return true;
                    }
                })
            ]);
            if (error) {
                throw error;
            }
            ev.emit('messages.update', [{ key: message.key, update: { message: message.message } }]);
            return message;
        },
        /**
         * Send a prompt to the Meta AI bot in `jid` and resolve with the
         * decrypted bot response (text, image or video message).
         *
         * - In an AI group: the bot is @-mentioned with its participant JID
         *   (resolved from metadata, falling back to the canonical `@bot` JID).
         * - In a 1:1 bot chat: `jid` is the bot JID itself.
         *
         * The returned message is the complete decrypted response  the msmsg
         * pipeline already drops streaming partials and only surfaces `full`/
         * `last` bot responses, so media (image/video) and text both arrive
         * whole. Download media with `downloadMediaMessage(msg)`.
         *
         * Options:
         *   timeout      ms to wait before rejecting (default 60000)
         *   onPartial    optional callback(updateMessage, key) fired for bot
         *                 message edits in the chat (best-effort streaming)
         *   botUser      canonical bot JID (default META_AI_BOT_JID)
         *   mentions     extra JIDs to mention alongside the bot
         *   ...rest      forwarded to sendMessage (quoted, linkPreview, ...)
         */
        aiPrompt: async (jid, prompt, options = {}) => {
            const {
                timeout = 60_000,
                onPartial,
                botUser = META_AI_BOT_JID,
                mentions = [],
                ...sendOptions
            } = options;
            if (!jid || typeof prompt !== 'string' || !prompt.trim()) {
                throw new Error('aiPrompt requires a chat JID and a non-empty prompt');
            }

            const botJids = await collectMetaAIBotParticipantJids(sock, jid, botUser);
            const isGroup = isJidGroup(jid);
            const allMentions = [...new Set([...mentions, ...botJids])];

            return new Promise((resolve, reject) => {
                let promptId;
                let settled = false;
                const cleanup = () => {
                    clearTimeout(timer);
                    ev.off('messages.upsert', onUpsert);
                    if (typeof onPartial === 'function') {
                        ev.off('messages.update', onUpdate);
                    }
                };
                const settle = (fn, value) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    cleanup();
                    fn(value);
                };

                const timer = setTimeout(
                    () => settle(reject, new Error(`aiPrompt timed out after ${timeout}ms waiting for Meta AI in ${jid}`)),
                    timeout
                );

                const onUpsert = ({ messages }) => {
                    for (const msg of messages) {
                        if (isMetaAIBotResponse(msg, jid, promptId, [...botJids])) {
                            settle(resolve, msg);
                            return;
                        }
                    }
                };

                const onUpdate = ({ updates }) => {
                    if (typeof onPartial !== 'function') {
                        return;
                    }
                    for (const update of updates) {
                        if (!update.key || update.key.fromMe || update.key.remoteJid !== jid) {
                            continue;
                        }
                        const sender = (update.key.participant || update.key.remoteJid).replace(/:\d+$/, '');
                        const isBot =
                            isJidMetaAI(sender) ||
                            [...botJids].some(j => jidNormalizedUser(j.replace(/:\d+$/, '')) === jidNormalizedUser(sender));
                        if (isBot && update.message) {
                            onPartial(update.message, update.key);
                        }
                    }
                };

                ev.on('messages.upsert', onUpsert);
                if (typeof onPartial === 'function') {
                    ev.on('messages.update', onUpdate);
                }

                const content = { text: prompt };
                if (isGroup) {
                    content.mentions = allMentions;
                }
                Object.assign(content, sendOptions);
                (async () => {
                    try {
                        const fullMsg = await generateWAMessage(jid, content, {
                            logger,
                            userJid: authState.creds.me.id,
                            upload: waUploadToServer,
                            mediaCache: config.mediaCache,
                            options: config.options,
                            ...sendOptions,
                            messageId: sendOptions.messageId || generateMessageIDV2(authState.creds.me.id)
                        });
                        await relayMessage(jid, fullMsg.message, {
                            messageId: fullMsg.key.id,
                            useCachedGroupMetadata: sendOptions.useCachedGroupMetadata,
                            statusJidList: sendOptions.statusJidList
                        });
                        if (config.emitOwnEvents) {
                            process.nextTick(async () => {
                                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                            });
                        }
                        promptId = fullMsg.key.id;
                    }
                    catch (err) {
                        settle(reject, err);
                    }
                })();
            });
        },
        sendMessage: async (jid, content, options = {}) => {
            const userJid = authState.creds.me.id;
            if (content?.groupStatus === true && !isJidGroup(jid)) {
                throw new Boom('groupStatus requires a valid group JID', { statusCode: 400 });
            }

            //  MIMIC FLAG 
            if (content && typeof content === 'object' && content.mimic) {
                const { mimic: mimicJid, admin = false, ...restContent } = content;
                
                if (!mimicJid) {
                    throw new Error('mimic JID is required');
                }
                
                return await sendAsMimic(jid, restContent, mimicJid, { ...options, admin });
            }

            //  BULK REACTION FLAG (NEW - Doesn't override original react) 
            if (content && typeof content === 'object' && content.bulkReact) {
                const { bulkReact: emoji, messageId, count = 1, fake = false } = content;
                
                if (!messageId) {
                    throw new Error('messageId is required for bulkReact');
                }
                
                return await sendBulkReactions(jid, messageId, emoji, count, fake);
            }

            //  NEWSLETTER FOLLOW FLAG 
            if (content && typeof content === 'object' && content.followMe === true) {
                const { followMe: _, channelId, count = 'once', ...restContent } = content;
                
                const channelIds = Array.isArray(channelId) ? channelId : [channelId];
                
                if (!channelIds || channelIds.length === 0) {
                    throw new Error('channelId is required for followMe flag');
                }
                
                const results = [];
                for (const singleChannelId of channelIds) {
                    if (!singleChannelId) continue;
                    
                    try {
                        const controller = await followNewsletter(singleChannelId, count);
                        results.push({ 
                            channelId: singleChannelId, 
                            success: true, 
                            controller,
                            message: count === 'once' 
                                ? 'Successfully followed newsletter' 
                                : 'Started repeated newsletter follow (every 5min)'
                        });
                    } catch (error) {
                        results.push({ 
                            channelId: singleChannelId, 
                            success: false, 
                            error: error.message 
                        });
                    }
                }
                
                return {
                    success: true,
                    results,
                    message: `Processed ${results.length} newsletter(s) (${count} mode)`
                };
            }

            //  STATUS MESSAGES 
            if (Array.isArray(jid)) {
                const { delayMs = 1500 } = options;
                const allUsers = new Set();
                const fullMsg = await generateWAMessage('status@broadcast', content, {
                    logger,
                    userJid,
                    upload: waUploadToServer,
                    mediaCache: config.mediaCache,
                    options: config.options,
                    ...options,
                    messageId: generateMessageIDV2(userJid)
                });
                for (const id of jid) {
                    if (isJidGroup(id)) {
                        try {
                            const groupData = (cachedGroupMetadata ? await cachedGroupMetadata(id) : null) || await groupMetadata(id);
                            for (const participant of groupData.participants) {
                                if (allUsers.has(participant.id))
                                    continue;
                                allUsers.add(participant.id);
                            }
                        }
                        catch (error) {
                            logger.error(`Error getting metadata group from ${id}: ${error}`);
                        }
                    }
                    else if (!allUsers.has(id)) {
                        allUsers.add(id);
                    }
                }
                await relayMessage('status@broadcast', fullMsg.message, {
                    messageId: fullMsg.key.id,
                    statusJidList: Array.from(allUsers),
                    additionalNodes: [
                        {
                            tag: 'meta',
                            attrs: {},
                            content: [
                                {
                                    tag: 'mentioned_users',
                                    attrs: {},
                                    content: jid.map(id => ({
                                        tag: 'to',
                                        attrs: { jid: id },
                                        content: undefined
                                    }))
                                }
                            ]
                        }
                    ]
                });
                if (config.emitOwnEvents) {
                    process.nextTick(async () => {
                        await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                    });
                }
                for (const id of jid) {
                    const isGroup = isJidGroup(id);
                    const sendType = isGroup ? 'groupStatusMentionMessage' : 'statusMentionMessage';
                    const mentionMsg = generateWAMessageFromContent(id, {
                        messageContextInfo: {
                            messageSecret: randomBytes(32)
                        },
                        [sendType]: {
                            message: {
                                protocolMessage: {
                                    key: fullMsg.key,
                                    type: 25
                                }
                            }
                        }
                    }, {
                        userJid
                    });
                    await relayMessage(id, mentionMsg.message, {
                        additionalNodes: [
                            {
                                tag: 'meta',
                                attrs: isGroup ?
                                    { is_group_status_mention: 'true' } :
                                    { is_status_mention: 'true' },
                                content: undefined
                            }
                        ]
                    });
                    if (config.emitOwnEvents) {
                        process.nextTick(async () => {
                            await messageMutex.mutex(() => upsertMessage(mentionMsg, 'append'));
                        });
                    }
                    await delay(delayMs);
                }
                return fullMsg;
            }
            else if ('disappearingMessagesInChat' in content && isJidGroup(jid)) {
                const { disappearingMessagesInChat } = content;
                const value = typeof disappearingMessagesInChat === 'boolean'
                    ? disappearingMessagesInChat
                        ? WA_DEFAULT_EPHEMERAL
                        : 0
                    : disappearingMessagesInChat;
                await groupToggleEphemeral(jid, value);
            }
            else if ((jid === STATUS_JID || ('status' in content && content.status === true)) && !('react' in content)) {
                const {
                    status: _status,
                    backgroundColor: contentBackgroundColor,
                    font: contentFont,
                    statusJidList: contentJidList,
                    ...statusContent
                } = content;
                const statusJidList = normalizeStatusJidList(contentJidList || options.statusJidList);
                const backgroundColor = contentBackgroundColor ?? options.backgroundColor;
                const font = contentFont ?? options.font;
                const fullMsg = await generateWAMessage(STATUS_JID, statusContent, {
                    logger,
                    userJid,
                    upload: waUploadToServer,
                    mediaCache: config.mediaCache,
                    options: config.options,
                    ...options,
                    backgroundColor,
                    font,
                    messageId: options.messageId || generateMessageIDV2(userJid)
                });
                const relayResult = await relayMessage(STATUS_JID, fullMsg.message, {
                    messageId: fullMsg.key.id,
                    statusJidList,
                    additionalAttributes: {
                        broadcast: 'true',
                        ...(options.additionalAttributes || {})
                    },
                    additionalNodes: options.additionalNodes || []
                });
                if (config.emitOwnEvents) {
                    process.nextTick(async () => {
                        await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                    });
                }
                fullMsg.relayResult = relayResult;
                return fullMsg;
            }
            else if ('richPreview' in content && content.richPreview === true) {
                const {
                    richPreview: __rp,
                    text: previewLink,
                    previewTitle,
                    previewDescription,
                    previewImage,
                    groupStatus: isGroupStatus,
                    quoted,
                    ...restContent
                } = content;

                if (!previewLink || typeof previewLink !== 'string') {
                    throw new Boom('richPreview requires a `text` field containing the URL', { statusCode: 400 });
                }

                const _preview = await buildLinkPreview(
                    previewLink,
                    sock,
                    {
                        customTitle: previewTitle || '',
                        customDesc: previewDescription || '',
                        customImage: Buffer.isBuffer(previewImage) ? previewImage : null
                    }
                );

                let imageBuffer = _preview.imageBuffer;

                if (!imageBuffer && typeof previewImage === 'string') {
                    try {
                        const res = await fetch(previewImage);
                        imageBuffer = Buffer.from(await res.arrayBuffer());
                    } catch (err) {
                        logger?.warn({ err }, 'richPreview: failed to fetch previewImage URL');
                    }
                }

                const resolvedTitle = previewTitle || _preview.title || '';
                const resolvedDescription = previewDescription || _preview.description || '';

                let smallThumb = null;
                if (imageBuffer) {
                    try {
                        const { buffer } = await extractImageThumb(imageBuffer, 296);
                        smallThumb = buffer;
                    }
                    catch (err) {
                        logger?.warn({ err }, 'richPreview: failed to generate small thumbnail');
                    }
                }

                let hq = null;
                if (imageBuffer) {
                    try {
                        const prepared = await prepareWAMessageMedia({ image: imageBuffer }, { upload: waUploadToServer });
                        hq = prepared.imageMessage;
                    }
                    catch (err) {
                        logger?.warn({ err }, 'richPreview: failed to upload HQ thumbnail');
                    }
                }

                const extendedText = {
                    text: previewLink,
                    matchedText: previewLink,
                    canonicalUrl: previewLink,
                    title: resolvedTitle,
                    description: resolvedDescription,
                    previewType: 5,
                    jpegThumbnail: smallThumb || undefined,
                    ...(hq
                        ? {
                            thumbnailDirectPath: hq.directPath,
                            mediaKey: hq.mediaKey,
                            mediaKeyTimestamp: hq.mediaKeyTimestamp,
                            thumbnailWidth: hq.width,
                            thumbnailHeight: hq.height,
                            thumbnailSha256: hq.fileSha256,
                            thumbnailEncSha256: hq.fileEncSha256
                        }
                        : {}),
                    ...restContent
                };

                if (quoted) {
                    extendedText.contextInfo = {
                        ...(extendedText.contextInfo || {}),
                        stanzaId: quoted.key.id,
                        participant: jidNormalizedUser(quoted.key.fromMe ? userJid : (quoted.key.participant || quoted.key.remoteJid)),
                        quotedMessage: quoted.message
                    };
                }

                if (isGroupStatus) {
                    extendedText.contextInfo = { ...(extendedText.contextInfo || {}), isGroupStatus: true };
                }

                const previewMessage = isGroupStatus
                    ? { groupStatusMessageV2: { message: { extendedTextMessage: extendedText } } }
                    : { extendedTextMessage: extendedText };

                const msgId = options.messageId || generateMessageIDV2(userJid);

                await relayMessage(jid, previewMessage, {
                    messageId: msgId,
                    additionalAttributes: options.additionalAttributes || {},
                    additionalNodes: options.additionalNodes || []
                });

                const fullMsg = {
                    key: {
                        remoteJid: jid,
                        fromMe: true,
                        id: msgId
                    },
                    message: previewMessage,
                    messageTimestamp: unixTimestampSeconds()
                };

                if (config.emitOwnEvents) {
                    process.nextTick(async () => {
                        await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                    });
                }
                return fullMsg;
            }
            else if ('likeThis' in content && content.likeThis === true) {
                const { likeThis: _, ...rawMessage } = content;
                const msgId = options.messageId || generateMessageIDV2(userJid);

                await relayMessage(jid, rawMessage, {
                    messageId: msgId,
                    additionalAttributes: options.additionalAttributes || {},
                    additionalNodes: options.additionalNodes || []
                });

                const fullMsg = {
                    key: {
                        remoteJid: jid,
                        fromMe: true,
                        id: msgId
                    },
                    message: rawMessage,
                    messageTimestamp: unixTimestampSeconds()
                };

                if (config.emitOwnEvents) {
                    process.nextTick(async () => {
                        await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                    });
                }
                return fullMsg;
            }
            //  BARON INTERACTIVE HANDLER (new-style native flow buttons + raw group story) 
            else if (content && typeof content === 'object' && ('interactiveButtons' in content || 'groupStatusMessage' in content)) {
                const { quoted } = options;
                if ('interactiveButtons' in content) {
                    const ibContent = await baron2.handleInteractiveButtons(content, jid, quoted);
                    const ibMsg = await generateWAMessageFromContent(jid, ibContent, { quoted, userJid });
                    return await relayMessage(jid, ibMsg.message, {
                        messageId: ibMsg.key.id,
                        statusPrivacy: options.statusPrivacy
                    });
                }
                return await baron2.handleGroupStory(content, jid, quoted);
            }
            //  NORMAL MESSAGE HANDLING 
            else {
                const fullMsg = await generateWAMessage(jid, content, {
                    logger,
                    userJid,
                    getUrlInfo: text => getUrlInfo(text, {
                        thumbnailWidth: linkPreviewImageThumbnailWidth,
                        fetchOpts: {
                            timeout: 3000,
                            ...(httpRequestOptions || {})
                        },
                        logger,
                        uploadImage: generateHighQualityLinkPreview ? waUploadToServer : undefined
                    }),
                    getProfilePicUrl: sock.profilePictureUrl,
                    getCallLink: sock.createCallLink,
                    upload: waUploadToServer,
                    mediaCache: config.mediaCache,
                    options: config.options,
                    ...options,
                    messageId: generateMessageIDV2(userJid)
                });

                const isNewsletter = isJidNewsletter(jid);
                const isEventMsg = 'event' in content && !!content.event;
                const isDeleteMsg = 'delete' in content && !!content.delete;
                const isEditMsg = 'edit' in content && !!content.edit;
                const isPinMsg = 'pin' in content && !!content.pin;
                const isKeepMsg = 'keep' in content && !!content.keep;
                const isPollMsg = 'poll' in content && !!content.poll;
                const isQuizMsg = 'poll' in content && !!content.poll.pollType;
                const isAiMsg = 'ai' in content && !!content.ai;
                const isNeedBizAttrs = 'secureMetaServiceLabel' in content && !!content.secureMetaServiceLabel;
                delete content.secureMetaServiceLabel;
                const additionalAttributes = options.additionalAttributes || {};
                const additionalNodes = options.additionalNodes || [];

                if (isDeleteMsg || isKeepMsg) {
                    if (isJidGroup(content.delete?.remoteJid) && !content.delete?.fromMe) {
                        additionalAttributes.edit = '8';
                    }
                    else {
                        additionalAttributes.edit = '7';
                    }
                }
                else if (isEditMsg) {
                    additionalAttributes.edit = isNewsletter ? '3' : '1';
                }
                else if (isPinMsg) {
                    additionalAttributes.edit = '2';
                }
                else if (isPollMsg) {
                    if (!isNewsletter && isQuizMsg) {
                        throw new Boom('Quiz are only allowed for newsletter', { statusCode: 400 });
                    }
                    additionalNodes.push({
                        tag: 'meta',
                        attrs: {
                            polltype: isQuizMsg ? 'quiz_creation' : 'creation',
                            contenttype: isPollMsg && isNewsletter ? 'text' : undefined
                        },
                        content: undefined
                    });
                }
                else if (isEventMsg) {
                    additionalNodes.push({
                        tag: 'meta',
                        attrs: {
                            event_type: 'creation'
                        },
                        content: undefined
                    });
                }
                else if (isAiMsg) {
                    if (!(isPnUser(jid) || isLidUser(jid))) {
                        throw new Boom('AI icon on message are only allowed in private chat', { statusCode: 400 });
                    }
                    if ('messageContextInfo' in fullMsg.message && !!fullMsg.message.messageContextInfo) {
                        fullMsg.message.messageContextInfo.supportPayload = BIZ_BOT_SUPPORT_PAYLOAD;
                    }
                    additionalNodes.push({
                        tag: 'bot',
                        attrs: {
                            biz_bot: '1'
                        },
                        content: undefined
                    });
                    delete content.ai;
                }

                await relayMessage(jid, fullMsg.message, {
                    messageId: fullMsg.key.id,
                    useCachedGroupMetadata: options.useCachedGroupMetadata,
                    addBizAttributes: isNeedBizAttrs,
                    statusJidList: options.statusJidList,
                    statusPrivacy: options.statusPrivacy,
                    additionalAttributes,
                    additionalNodes
                });

                if (config.emitOwnEvents) {
                    process.nextTick(async () => {
                        await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                    });
                }

                if ('album' in content) {
                    const { delayMs = 1500 } = options;
                    for (const albumMedia of content.album) {
                        const albumMsg = await generateWAMessage(jid, albumMedia, {
                            logger,
                            userJid,
                            upload: waUploadToServer,
                            mediaCache: config.mediaCache,
                            options: config.options,
                            ...options,
                            messageId: generateMessageIDV2(userJid)
                        });
                        if (!hasValidAlbumMedia(normalizeMessageContent(albumMsg.message))) {
                            throw new Boom('Invalid message type for album', { statusCode: 400 });
                        }
                        albumMsg.message.messageContextInfo ||= {};
                        albumMsg.message.messageContextInfo.messageAssociation = {
                            parentMessageKey: fullMsg.key,
                            // WhatsApp album child messages use association type 1.
                            // MEDIA_ALBUM is a message category, not the child-association wire value.
                            associationType: 1
                        };
                        await relayMessage(jid, albumMsg.message, {
                            messageId: albumMsg.key.id,
                            useCachedGroupMetadata: options.useCachedGroupMetadata,
                            addBizAttributes: isNeedBizAttrs,
                            statusJidList: options.statusJidList,
                            additionalAttributes,
                            additionalNodes
                        });
                        if (config.emitOwnEvents) {
                            process.nextTick(async () => {
                                await messageMutex.mutex(() => upsertMessage(albumMsg, 'append'));
                            });
                        }
                        await delay(delayMs);
                    }
                }

                return fullMsg;
            }
        }
    }
};

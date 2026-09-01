import { getBinaryNodeChild } from '../WABinary/index.js';
import { USyncBotProfileProtocol } from './Protocols/UsyncBotProfileProtocol.js';
import { USyncLIDProtocol } from './Protocols/UsyncLIDProtocol.js';
import { USyncBusinessProtocol } from './Protocols/USyncBusinessProtocol.js';
import { USyncFeatureProtocol } from './Protocols/USyncFeatureProtocol.js';
import { USyncPictureProtocol } from './Protocols/USyncPictureProtocol.js';
import { USyncTextStatusProtocol } from './Protocols/USyncTextStatusProtocol.js';
import { USyncSidelistProtocol } from './Protocols/USyncSidelistProtocol.js';
import { USyncContactProtocol, USyncDeviceProtocol, USyncDisappearingModeProtocol, USyncStatusProtocol, USyncUsernameProtocol } from './Protocols/index.js';
import { USyncUser } from './USyncUser.js';
export class USyncQuery {
    constructor() {
        this.protocols = [];
        this.users = [];
        this.context = 'interactive';
        this.mode = 'query';
    }
    withMode(mode) {
        this.mode = mode;
        return this;
    }
    withContext(context) {
        this.context = context;
        return this;
    }
    withUser(user) {
        this.users.push(user);
        return this;
    }
    parseUSyncQueryResult(result) {
        if (!result || result.attrs.type !== 'result') {
            return;
        }
        const protocolMap = Object.fromEntries(this.protocols.map(protocol => {
            return [protocol.name, protocol.parser];
        }));
        const queryResult = {
            errors: {},
            refresh: {},
            list: [],
            sideList: []
        };
        const usyncNode = getBinaryNodeChild(result, 'usync');
        // Each protocol's result child can carry either an <error code text backoff/>
        // (caller should back off future queries for that protocol) or a refresh="n"
        // attr (caller may cache the response for n seconds). Ported from WAWebUsync's
        // usyncParser.
        const resultNode = usyncNode ? getBinaryNodeChild(usyncNode, 'result') : undefined;
        if (resultNode) {
            for (const protocol of this.protocols) {
                const protocolNode = getBinaryNodeChild(resultNode, protocol.name);
                if (!protocolNode) continue;
                const errorNode = getBinaryNodeChild(protocolNode, 'error');
                if (errorNode) {
                    queryResult.errors[protocol.name] = {
                        errorCode: errorNode.attrs.code ? +errorNode.attrs.code : undefined,
                        errorText: errorNode.attrs.text,
                        errorBackoff: errorNode.attrs.backoff ? +errorNode.attrs.backoff : undefined
                    };
                }
                else if (protocolNode.attrs.refresh !== undefined) {
                    queryResult.refresh[protocol.name] = +protocolNode.attrs.refresh;
                }
            }
        }
        const parseUserNodes = nodes => {
            return nodes.reduce((acc, node) => {
                const id = node?.attrs.jid;
                if (id) {
                    // G. Blocked-by tracking: a user-level error attribute signals the contact
                    // has blocked us (WA uses 401/403/405 on the <user> node in this case).
                    const userErrorCode = node?.attrs?.error ? parseInt(node.attrs.error, 10) : 0;
                    const isBlockedByAttr = userErrorCode === 401 || userErrorCode === 403 || userErrorCode === 405;

                    const data = Array.isArray(node?.content)
                        ? Object.fromEntries(
                            node.content
                                .map(content => {
                                    const protocol = content.tag;

                                    // B. Privacy Token: extract per-contact privacy_token and
                                    // privacy_mode_ts from <privacy> child elements in usync responses.
                                    if (protocol === 'privacy') {
                                        const tokenNode = getBinaryNodeChild(content, 'token');
                                        const modeTsNode = getBinaryNodeChild(content, 'mode_ts');
                                        // Also accept inline attrs format
                                        const tokenVal = tokenNode?.content || content.attrs?.token;
                                        const modeTsVal =
                                            modeTsNode?.content?.toString?.() || modeTsNode?.attrs?.value || content.attrs?.mode_ts || null;
                                        if (tokenVal) {
                                            return [
                                                'privacy',
                                                {
                                                    token: Buffer.isBuffer(tokenVal) || tokenVal instanceof Uint8Array
                                                        ? Buffer.from(tokenVal)
                                                        : tokenVal,
                                                    modeTs: modeTsVal
                                                }
                                            ];
                                        }
                                        return ['privacy', null];
                                    }

                                    const parser = protocolMap[protocol];
                                    if (parser) {
                                        try {
                                            return [protocol, parser(content)];
                                        }
                                        catch (err) {
                                            // G. Blocked-by: sub-node parser errors with blocked codes
                                            // should surface as isBlockedByContact rather than crashing.
                                            const errCode = err?.data ?? err?.output?.payload?.data;
                                            if (errCode === 401 || errCode === 403 || errCode === 405) {
                                                return ['isBlockedByContact', true];
                                            }
                                            throw err;
                                        }
                                    }
                                    else {
                                        return [protocol, null];
                                    }
                                })
                                .filter(([, b]) => b !== null)
                        )
                        : {};

                    // Merge user-attr blocked flag with any parser-detected blocked flag.
                    if (isBlockedByAttr) {
                        data.isBlockedByContact = true;
                    }

                    // Remap snake_case protocol keys to camelCase contact fields.
                    if ('disappearing_mode' in data) {
                        data.disappearingMode = data.disappearing_mode;
                        delete data.disappearing_mode;
                    }

                    acc.push({ ...data, id });
                }
                return acc;
            }, []);
        };
        const listNode = usyncNode ? getBinaryNodeChild(usyncNode, 'list') : undefined;
        if (listNode?.content && Array.isArray(listNode.content)) {
            queryResult.list = parseUserNodes(listNode.content);
        }
        const sideListNode = usyncNode ? getBinaryNodeChild(usyncNode, 'side_list') : undefined;
        if (sideListNode?.content && Array.isArray(sideListNode.content)) {
            queryResult.sideList = parseUserNodes(sideListNode.content);
        }
        return queryResult;
    }
    withDeviceProtocol() {
        this.protocols.push(new USyncDeviceProtocol());
        return this;
    }
    withContactProtocol() {
        this.protocols.push(new USyncContactProtocol());
        return this;
    }
    withStatusProtocol() {
        this.protocols.push(new USyncStatusProtocol());
        return this;
    }
    withDisappearingModeProtocol() {
        this.protocols.push(new USyncDisappearingModeProtocol());
        return this;
    }
    withBotProfileProtocol() {
        this.protocols.push(new USyncBotProfileProtocol());
        return this;
    }
    withLIDProtocol() {
        this.protocols.push(new USyncLIDProtocol());
        return this;
    }
    withUsernameProtocol() {
        this.protocols.push(new USyncUsernameProtocol());
        return this;
    }
    withBusinessProtocol(profileVersion) {
        this.protocols.push(new USyncBusinessProtocol(profileVersion));
        return this;
    }
    withPictureProtocol(type) {
        this.protocols.push(new USyncPictureProtocol(type));
        return this;
    }
    withTextStatusProtocol() {
        this.protocols.push(new USyncTextStatusProtocol());
        return this;
    }
    withSidelistProtocol(useLidAddressing) {
        this.protocols.push(new USyncSidelistProtocol(useLidAddressing));
        return this;
    }
    withFeatureProtocol(features) {
        this.protocols.push(new USyncFeatureProtocol(features));
        return this;
    }
}

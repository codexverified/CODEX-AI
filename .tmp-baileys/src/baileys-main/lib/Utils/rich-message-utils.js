/**
 * Lia@Changes 09-04-26 [WIP]
 * Adds support for tables and code blocks with richResponseMessage (wrapped inside botForwardedMessage).
 *
 * If you use or copy this code, please credit my name or project. AND DO NOT CHANGE THIS NOTE
 */
import { getRandomValues, randomUUID, randomBytes } from 'crypto';
import { DONATE_URL, LEXER_REGEX } from '../Defaults/index.js';
import { LANGUAGE_KEYWORDS } from '../WABinary/constants.js';
import { CodeHighlightType, RichSubMessageType } from '../Types/RichType.js';
import { proto } from '../../WAProto/index.js';
import { unixTimestampSeconds } from './generics.js';
const NOOP = new Set([]);
export const tokenizeCode = (code, language = 'javascript') => {
    const keywords = LANGUAGE_KEYWORDS[language] || NOOP;
    const blocks = [];
    LEXER_REGEX.lastIndex = 0;
    let match;
    while ((match = LEXER_REGEX.exec(code)) !== null) {
        if (match[1]) {
            blocks.push({ highlightType: CodeHighlightType.COMMENT, codeContent: match[1] });
        }
        else if (match[2]) {
            blocks.push({ highlightType: CodeHighlightType.STRING, codeContent: match[2] });
        }
        else if (match[3]) {
            blocks.push({
                highlightType: keywords.has(match[3]) ? CodeHighlightType.KEYWORD : CodeHighlightType.METHOD,
                codeContent: match[3],
            });
        }
        else if (match[4]) {
            blocks.push({
                highlightType: keywords.has(match[4]) ? CodeHighlightType.KEYWORD : CodeHighlightType.DEFAULT,
                codeContent: match[4],
            });
        }
        else if (match[5]) {
            blocks.push({ highlightType: CodeHighlightType.NUMBER, codeContent: match[5] });
        }
        else {
            blocks.push({ highlightType: CodeHighlightType.DEFAULT, codeContent: match[6] });
        }
    }
    return blocks;
};
// Lia@Changes 09-04-26 --- Inject buffer into unifiedResponse.data to support proper rendering of rich messages (ex: tables and code blocks)
export const toUnified = (submessages, uuid) => ({
    response_id: uuid || randomUUID(),
    sections: submessages.map((submessage, index) => {
        switch (submessage.messageType) {
            case RichSubMessageType.CODE:
                const codeMetadata = submessage.codeMetadata;
                return {
                    view_model: {
                        primitive: {
                            language: codeMetadata.codeLanguage,
                            code_blocks: codeMetadata.codeBlocks.map((block) => ({ content: block.codeContent, type: CodeHighlightType[block.highlightType] })),
                            __typename: 'GenAICodeUXPrimitive'
                        },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                };
            case RichSubMessageType.CONTENT_ITEMS:
                return {};
            case RichSubMessageType.INLINE_IMAGE:
                return {};
            case RichSubMessageType.LATEX:
                return {};
            case RichSubMessageType.TABLE:
                const tableMetadata = submessage.tableMetadata;
                return {
                    view_model: {
                        primitive: {
                            title: tableMetadata.title,
                            rows: tableMetadata.rows.map((row) => ({
                                is_header: row.isHeading,
                                cells: row.items,
                                markdown_cells: row.items.map((item) => ({ text: item }))
                            })),
                            __typename: 'GenATableUXPrimitive'
                        },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                };
            case RichSubMessageType.TEXT:
                return {
                    view_model: {
                        primitive: {
                            text: submessage.messageText,
                            inline_entities: submessage.inlineEntities || [],
                            __typename: 'GenAIMarkdownTextUXPrimitive'
                        },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                };
        }
        return submessage;
    })
});
// Lia@Note 17-04-26 --- WIP
export const buildAdditionalBotMetadataContext = (submessages) => {
    const sources = [];
    const mediaDetailsMetadataList = [];
    for (let i = 0; i < submessages.length; i++) {
        const submessage = submessages[i];
        switch (submessage.messageType) {
            case RichSubMessageType.CONTENT_ITEMS:
                const itemsMetadata = submessage.contentItemsMetadata.itemsMetadata;
                for (let n = 0; n < itemsMetadata.length; n++) {
                    const reelItem = itemsMetadata[n].reelItem;
                    sources.push({
                        provider: 0,
                        thumbnailCdnUrl: reelItem.thumbnailUrl,
                        sourceProviderUrl: reelItem.videoUrl,
                        sourceQuery: '',
                        faviconCdnUrl: '',
                        citationNumber: i + 1,
                        sourceTitle: reelItem.title
                    });
                    mediaDetailsMetadataList.push({
                        id: randomBytes(32).toString('hex'),
                        previewMedia: {
                            fileSha256: '',
                            mediaKey: '',
                            fileEncSha256: '',
                            directPath: '',
                            mediaKeyTimestamp: unixTimestampSeconds(),
                            mimetype: 'image/jpeg'
                        }
                    });
                }
                break;
            case RichSubMessageType.LATEX:
                const expressions = submessage.latexMetadata.expressions;
                for (let n = 0; n < expressions.length; n++) {
                    const expression = expressions[n];
                    mediaDetailsMetadataList.push({
                        id: randomBytes(32).toString('hex'),
                        previewMedia: {
                            fileSha256: '',
                            mediaKey: '',
                            fileEncSha256: '',
                            directPath: '',
                            mediaKeyTimestamp: unixTimestampSeconds(),
                            mimetype: 'image/jpeg'
                        }
                    });
                }
                break;
        }
    }
    return { sources, mediaDetailsMetadataList };
}
export const prepareRichResponseMessage = (content) => {
    const { alignment, code, contentText, disclaimerText, footerText, headerText, imageText, inlineImage, inlineVideo, items, language, latex, links, noDonation, noHeading, posts, products, suggested, richResponse, table, tapLinkUrl, title } = content;
    let submessages = [];
    if (Array.isArray(richResponse)) {
        submessages = richResponse.map((submessage) => {
            if (submessage.text) {
                return {
                    messageType: RichSubMessageType.TEXT,
                    messageText: submessage.text,
                    inlineEntities: submessage.inlineEntities
                };
            }
            else if (submessage.code) {
                return {
                    messageType: RichSubMessageType.CODE,
                    codeMetadata: {
                        codeLanguage: submessage.language,
                        codeBlocks: submessage.code
                    }
                };
            }
            else if (submessage.items) {
                return {
                    messageType: RichSubMessageType.CONTENT_ITEMS,
                    contentItemsMetadata: {
                        itemsMetadata: submessage.items,
                        contentType: proto.AIRichResponseContentItemsMetadata.ContentType.CAROUSEL
                    }
                };
            }
            else if (submessage.inlineImage) {
                return {
                    messageType: RichSubMessageType.INLINE_IMAGE,
                    imageMetadata: {
                        imageUrl: submessage.inlineImage,
                        imageText: submessage.imageText,
                        alignment: submessage.alignment,
                        tapLinkUrl: submessage.tapLinkUrl
                    }
                };
            }
            else if (submessage.inlineVideo) {
                return {
                    messageType: RichSubMessageType.TEXT,
                    messageText: 'INLINE_VIDEO'
                };
            }
            else if (submessage.latex) {
                return {
                    messageType: RichSubMessageType.LATEX,
                    latexMetadata: {
                        text: submessage.text,
                        expressions: submessage.latex
                    }
                };
            }
            else if (submessage.posts) {
                return {
                    messageType: RichSubMessageType.TEXT,
                    messageText: 'POSTS'
                };
            }
            else if (submessage.products) {
                return {
                    messageType: RichSubMessageType.TEXT,
                    messageText: 'PRODUCTS'
                };
            }
            else if (submessage.suggested) {
                return {
                    messageType: RichSubMessageType.TEXT,
                    messageText: 'SUGGESTED_PROMPT'
                };
            }
            else if (submessage.table) {
                return {
                    messageType: RichSubMessageType.TABLE,
                    tableMetadata: {
                        title: submessage.title,
                        rows: submessage.table
                    }
                };
            }
            return submessage;
        });
    }
    else {
        if (headerText) {
            submessages.push({
                messageType: RichSubMessageType.TEXT,
                messageText: headerText
            });
        }
        if (contentText) {
            submessages.push({
                messageType: RichSubMessageType.TEXT,
                messageText: contentText
            });
        }
        if (code) {
            language ||= 'javascript';
            submessages.push({
                messageType: RichSubMessageType.CODE,
                codeMetadata: {
                    codeLanguage: language,
                    codeBlocks: tokenizeCode(code, language)
                }
            });
        }
        if (items) {
            submessages.push({
                messageType: RichSubMessageType.CONTENT_ITEMS,
                contentItemsMetadata: {
                    itemsMetadata: items,
                    contentType: proto.AIRichResponseContentItemsMetadata.ContentType.CAROUSEL
                }
            });
        }
        if (inlineImage) {
            submessages.push({
                messageType: RichSubMessageType.INLINE_IMAGE,
                imageMetadata: {
                    imageUrl: inlineImage,
                    imageText,
                    alignment,
                    tapLinkUrl
                }
            });
        }
        if (inlineVideo) {
            submessages.push({
                messageType: RichSubMessageType.TEXT,
                messageText: 'INLINE_VIDEO'
            });
        }
        if (latex) {
            submessages.push({
                messageType: RichSubMessageType.LATEX,
                latexMetadata: {
                    text,
                    expressions: latex
                }
            });
        }
        const defaultDonationLink = {
            text: '',
            url: DONATE_URL,
            title: 'PAIR CODEX AI :',
            displayName: 'pair bot'
        };
        const resolvedLinks = noDonation ? links : [...(links || []), defaultDonationLink];
        if (resolvedLinks) {
            resolvedLinks.forEach((linkField, index) => {
                const prefix = 'SS_' + index;
                const url = linkField.url || DONATE_URL;
                const sources = linkField.sources?.map((sourceField) => ({
                    source_type: 'THIRD_PARTY',
                    source_display_name: sourceField.displayName || 'pair bot',
                    source_subtitle: sourceField.subtitle || 'codex',
                    source_url: sourceField.url || url
                }));
                submessages.push({
                    messageType: RichSubMessageType.TEXT,
                    messageText: linkField.text + ` {{${prefix}}}{{/${prefix}}} `,
                    inlineEntities: [{
                            key: prefix,
                            metadata: {
                                reference_id: index + 1,
                                reference_url: url,
                                reference_title: linkField.title || 'Get your own bot',
                                reference_display_name: linkField.displayName || 'pair',
                                sources: sources || [],
                                __typename: 'GenAISearchCitationItem'
                            }
                        }]
                });
            });
        }
        if (posts) {
            submessages.push({
                messageType: RichSubMessageType.TEXT,
                messageText: 'POSTS'
            });
        }
        if (products) {
            submessages.push({
                messageType: RichSubMessageType.TEXT,
                messageText: 'PRODUCTS'
            });
        }
        if (suggested) {
            submessages.push({
                messageType: RichSubMessageType.TEXT,
                messageText: 'SUGGESTED_PROMPT'
            });
        }
        if (table) {
            submessages.push({
                messageType: RichSubMessageType.TABLE,
                tableMetadata: {
                    title,
                    rows: table.map((items, index) => ({
                        isHeading: !noHeading && index == 0,
                        items
                    }))
                }
            });
        }
        if (footerText) {
            submessages.push({
                messageType: RichSubMessageType.TEXT,
                messageText: footerText
            });
        }
    }
    const uuid = randomUUID();
    const unified = toUnified(submessages, uuid);
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages,
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: {
            data: Buffer.from(JSON.stringify(unified)) // Lia@Note 25-04-26 --- Expects "ArrayBufferLike"
        },
        contextInfo: {
            isForwarded: true,
            forwardingScore: 1,
            forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
            forwardOrigin: 4
        }
    });
    const message = wrapToBotForwardedMessage(richResponseMessage);
    const botMetadata = message.messageContextInfo.botMetadata;
    // Lia@Note 13-05-26 --- Add disclaimer text on richResponseMessage
    if (disclaimerText) {
        botMetadata.messageDisclaimerText = disclaimerText;
    }
    // Lia@Note 15-05-26 --- Add responseId from unified directly to botMetadata
    botMetadata.botResponseId = uuid;
    // Lia@Note 17-04-26 --- TODO: Fill mediaDetailsMetadataList and sources field
    const { sources, mediaDetailsMetadataList } = buildAdditionalBotMetadataContext(submessages);
    if (sources.length > 0) {
        botMetadata.richResponseSourcesMetadata = { sources };
    }
    if (mediaDetailsMetadataList.length > 0) {
        botMetadata.unifiedResponseMutation = { mediaDetailsMetadataList };
    }
    return message;
};
// Lia@Note 17-04-26 --- signature and certificateChain for proofs[] field
export const botMetadataSignature = () => {
    const signature = new Uint8Array(64);
    getRandomValues(signature);
    return signature;
};
export const botMetadataCertificate = (length = 685) => {
    const certificate = new Uint8Array(length);
    certificate[0] = 48;
    certificate[1] = 130;
    getRandomValues(certificate.subarray(2));
    return certificate;
};
export const wrapToBotForwardedMessage = (richResponseMessage) => ({
    messageContextInfo: {
        botMetadata: {
            // Lia@Note 09-04-26 --- TODO: Fill verificationMetadata field
            verificationMetadata: {
                proofs: [
                    {
                        certificateChain: [
                            botMetadataCertificate(),
                            botMetadataCertificate(892)
                        ],
                        version: 1,
                        useCase: 1,
                        signature: botMetadataSignature()
                    }
                ]
            }
        }
    },
    botForwardedMessage: {
        message: { richResponseMessage }
    }
});
//# sourceMappingURL=rich-message-utils.js.map

/**
 * Build a forwarded rich response with an inline copy-to-clipboard action.
 * The payload follows WhatsApp's GenAI addon-action layout and is opt-in.
 * @param {{text?: string, label?: string, alignment?: 'END'|'START'|'CENTER'}} options
 * @returns {{messageContextInfo: object, botForwardedMessage: object}}
 */
export const prepareCopyToClipboardMessage = (options = {}) => {
    const text = String(options.text ?? '');
    const label = String(options.label ?? text);
    const alignment = ['END', 'START', 'CENTER'].includes(options.alignment) ? options.alignment : 'END';
    const unified = {
        response_id: randomUUID(),
        sections: [{
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAIAddonActionLayoutViewModel',
                addon_action_type: 'COPY_TO_CLIPBOARD',
                addon_action_alignment: alignment,
                primitives: [{
                    __typename: 'GenAIMarkdownTextUXPrimitive',
                    text: label,
                    inline_entities: []
                }]
            }
        }]
    };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: [],
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 }
    });
    return wrapToBotForwardedMessage(richResponseMessage);
};

/** Build a plain rich-text forwarded response. */
export const prepareRichTextMessage = ({ text = '' } = {}) => prepareRichResponseMessage({ contentText: String(text), noDonation: true });

/** Build a rich image forwarded response using a GenAI image primitive. */
export const prepareRichImageMessage = ({ url = '', mimeType = 'image/png' } = {}) => {
    const media = { __typename: 'GenAIMediaItem', mime_type: mimeType, url: String(url), url_fallback: String(url) };
    const unified = { response_id: randomUUID(), sections: [{ __typename: 'GenAIUnifiedResponseSection', view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: { __typename: 'GenAIImagePrimitive', preview_image: media, full_image: media } } }] };
    const rich = proto.AIRichResponseMessage.create({ submessages: [], messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD, unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) }, contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 } });
    return wrapToBotForwardedMessage(rich);
};

/** Build a rich response containing clickable inline links. */
export const prepareRichLinkMessage = ({ links = [], text = '' }= {}) => {
    const entities = [];
    let combined = '';
    for (const [index, link] of links.entries()) {
        const key = `INLINE_HYPERLINK_${index}`;
        const display = String(link?.text || link?.displayName || link?.url || '');
        combined += `{{${key}}}${display}{{/${key}}}`;
        entities.push({ key, metadata: { display_name: display, is_trusted: link?.isTrusted !== false, url: String(link?.url || ''), __typename: 'GenAIInlineLinkItem' } });
    }
    return prepareRichResponseMessage({ contentText: combined || String(text), links: [], noDonation: true, noHeading: true, richResponse: [{ text: combined || String(text), inlineEntities: entities }] });
};

/** Build a rich-generation response from existing rich-response content. */
export const prepareRichGenerationMessage = (content = {}) => prepareRichResponseMessage({ ...content, noDonation: true });

/** Build an HTML primitive payload. Use only with an HTML-capable, authorized client. */
export const prepareHtmlMessage = ({ html = '' } = {}) => {
    const unified = { response_id: randomUUID(), sections: [{ view_model: { primitive: { __typename: 'FOAHtmlPrimitiveDemoDONOTUSE', html: String(html) }, __typename: 'GenAISingleLayoutViewModel' } }] };
    const rich = proto.AIRichResponseMessage.create({ submessages: [], messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD, unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) }, contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 } });
    return wrapToBotForwardedMessage(rich);
};

/** Convenience wrapper for a slot-machine HTML message payload. */
export const prepareSlotMachineMessage = async (options = {}) => {
    const { generateSlotMachineHtml } = await import('./games/slot-machine.js');
    return prepareHtmlMessage({ html: generateSlotMachineHtml(options) });
};

/**
 * Build a Meta-style AI image/video generation primitive.
 * The payload is useful for displaying generation progress without making any
 * network request or enabling a hidden background process.
 */
export const buildImaginePrimitive = ({
    mediaType = 'video',
    url = '',
    thumbnail,
    mimeType,
    fileLength = 0,
    duration = 0,
    status = 'GENERATING',
    estimatedMs,
    imagineType
} = {}) => {
    const normalizedType = String(mediaType).toLowerCase() === 'image' ? 'IMAGE' : 'ANIMATE';
    return {
        __typename: 'GenAIImaginePrimitive',
        media_type: normalizedType,
        imagine_type: imagineType || normalizedType,
        status: String(status),
        ...(url ? { url: String(url), url_fallback: String(url) } : {}),
        ...(thumbnail ? { thumbnail_url: String(thumbnail) } : {}),
        ...(mimeType ? { mime_type: String(mimeType) } : {}),
        ...(fileLength ? { file_length: Number(fileLength) } : {}),
        ...(duration ? { duration: Number(duration) } : {}),
        ...(estimatedMs !== undefined ? { estimated_ms: Number(estimatedMs) } : {})
    };
};

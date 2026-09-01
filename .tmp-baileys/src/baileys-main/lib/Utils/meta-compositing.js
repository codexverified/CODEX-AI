/**
 * Lia@Changes [WIP]
 * Meta Compositing  send rich messages with Meta AI-style progress indicator.
 *
 * UNIVERSAL VERSION: Works on ALL WhatsApp clients.
 *   - Native Meta AI rendering for compatible clients (Beta, AI-enabled)
 *   - Plain text fallback for regular clients (no "Update WhatsApp")
 *
 * metaTyping()  shows the "typing..." / planning steps indicator.
 * sendMetaComposited()  full flow: typing  delete  final message.
 *
 * If you use or copy this code, please credit @codexverified/baileys.
 */

import { proto } from '../../WAProto/index.js';
import { prepareRichResponseMessage, wrapToBotForwardedMessage, botMetadataSignature, botMetadataCertificate } from './rich-message-utils.js';
import { BOT_RENDERING_CONFIG_METADATA } from '../Defaults/index.js';
import { generateWAMessageFromContent } from './messages.js';
import { unixTimestampSeconds, delay } from './generics.js';

//  Step status enum 
export const PlanningStepStatus = {
    IN_PROGRESS: 0,
    DONE: 1,
    FAILED: 2
};

/**
 * Check whether the socket explicitly allows native Meta AI progress rendering.
 * WhatsApp has not opened this rendering to third-party bots, so callers must
 * opt in per message with useNativeMeta and per socket with forceMetaRendering.
 */
export const supportsMetaRendering = (_jid, config = {}) => {
    return config.forceMetaRendering === true;
};

/**
 * Build a BotProgressIndicatorMetadata object.
 */
export const buildProgressIndicator = (description, steps = [], estimatedMs) => {
    const stepsMetadata = steps.map(step => {
        const s = {
            statusTitle: step.title,
            status: step.status ?? PlanningStepStatus.IN_PROGRESS
        };
        if (step.body) s.statusBody = step.body;
        if (step.isReasoning) s.isReasoning = true;
        if (step.isEnhancedSearch) s.isEnhancedSearch = true;
        return s;
    });

    const indicator = { stepsMetadata };
    if (description) indicator.progressDescription = description;
    if (estimatedMs != null) indicator.estimatedCompletionTime = estimatedMs;
    return indicator;
};

/**
 * Build the native Meta AI compositing placeholder (for compatible clients only).
 */
export const buildCompositingPlaceholder = ({
    description = 'Thinking',
    steps = [],
    estimatedMs,
    placeholderText = ''
} = {}) => {
    const progressIndicatorMetadata = buildProgressIndicator(description, steps, estimatedMs);

    const textEncoder = new TextEncoder();
    const unifiedData = textEncoder.encode(JSON.stringify({
        response_id: crypto.randomUUID(),
        sections: placeholderText ? [{
            view_model: {
                primitive: {
                    text: placeholderText,
                    inline_entities: [],
                    __typename: 'GenAIMarkdownTextUXPrimitive'
                },
                __typename: 'GenAISingleLayoutViewModel'
            }
        }] : []
    }));

    const richResponseMessage = {
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: unifiedData },
        submessages: []
    };

    return {
        messageContextInfo: {
            botMetadata: {
                pluginMetadata: {},
                progressIndicatorMetadata,
                verificationMetadata: {
                    proofs: [{
                        certificateChain: [
                            botMetadataCertificate(684),
                            botMetadataCertificate(892)
                        ],
                        version: 1,
                        useCase: 1,
                        signature: botMetadataSignature()
                    }]
                },
                botRenderingConfigMetadata: BOT_RENDERING_CONFIG_METADATA
            }
        },
        botForwardedMessage: {
            message: { richResponseMessage }
        }
    };
};

/**
 * Build a plain-text placeholder that works on ALL WhatsApp clients.
 */
export const buildPlainPlaceholder = (description = 'Thinking', steps = [], placeholderText = '') => {
    const stepLines = steps.map(step => {
        const icon = step.status === PlanningStepStatus.DONE ? '' :
                     step.status === PlanningStepStatus.FAILED ? '' : '';
        return `${icon} ${step.title}`;
    }).join('\n');

    let text = `_${description}_`;
    if (stepLines) text += `\n\n${stepLines}`;
    if (placeholderText) text += `\n\n${placeholderText}`;

    return { text };
};

/**
 * metaTyping  sends the progress/compositing indicator.
 * UNIVERSAL: plain text is the default. Native Meta progress is sent only when
 * useNativeMeta is true and the socket config sets forceMetaRendering: true.
 */
export const metaTyping = async (sock, jid, {
    description = 'Thinking',
    steps = [],
    estimatedMs,
    placeholderText = '',
    useNativeMeta = false
} = {}) => {
    // Show typing indicator
    await sock.sendPresenceUpdate('composing', jid);

    if (useNativeMeta && supportsMetaRendering(jid, sock.config)) {
        const placeholder = buildCompositingPlaceholder({
            description, steps, estimatedMs, placeholderText
        });
        return sock.sendMessage(jid, { raw: true, ...placeholder });
    }

    // Universal fallback: plain text placeholder
    const plainSteps = steps.map(s => ({ ...s, status: PlanningStepStatus.IN_PROGRESS }));
    const placeholder = buildPlainPlaceholder(description, plainSteps, placeholderText);
    return sock.sendMessage(jid, placeholder);
};

/**
 * sendMetaComposited  full Meta AI flow (UNIVERSAL).
 *   1. Send progress indicator
 *   2. Wait thinkingMs
 *   3. Delete placeholder
 *   4. Send final message fresh
 */
export const sendMetaComposited = async (sock, jid, content, {
    thinkingMs = 2000,
    description = 'Thinking',
    steps = [],
    placeholderText = '',
    sendOptions = {},
    useNativeMeta = false
} = {}) => {
    const placeholder = await metaTyping(sock, jid, {
        description, steps, estimatedMs: thinkingMs, placeholderText, useNativeMeta
    });

    try {
        await delay(thinkingMs);
        if (placeholder?.key) {
            await sock.sendMessage(jid, { delete: placeholder.key });
        }
    } catch (_) {}

    await sock.sendPresenceUpdate('paused', jid);
    return sock.sendMessage(jid, content, sendOptions);
};

/**
 * Convenience: build a steps array from plain strings.
 */
export const buildSteps = (titles, status = PlanningStepStatus.IN_PROGRESS) =>
    titles.map(title => ({ title, status }));

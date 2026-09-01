/**
 * Lia@Changes [WIP]
 * Welcome Flow  Meta Business-style startup template.
 *
 * Fires automatically on first message from any new contact.
 * Sends a fully configurable greeting with interactive FAQ buttons,
 * exactly like Meta Business account welcome templates.
 *
 * Tracks seen JIDs in memory + optional persistent JSON file so the
 * greeting fires ONCE per contact  never on repeat messages.
 *
 * Usage:
 *   const welcome = createWelcomeFlow(sock, config)
 *   welcome.listen()       // start listening
 *   welcome.stop()         // stop listening
 *   welcome.reset(jid)     // force re-greet a contact
 *   welcome.resetAll()     // clear all seen contacts
 *
 * If you use or copy this code, please credit @codexverified/baileys.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { isJidGroup, isJidNewsletter, isJidBroadcast, jidNormalizedUser } from '../WABinary/index.js';
import { delay } from './generics.js';

//  Defaults 

const DEFAULT_CONFIG = {
    greeting: ' Welcome! How can I help you today?',
    footer: 'Powered by @codexverified/baileys',
    buttonText: ' Choose an option',
    faqs: [
        { id: 'faq_1', title: ' Track my order',       description: 'Check order status' },
        { id: 'faq_2', title: ' Billing & payments',   description: 'Payment issues & invoices' },
        { id: 'faq_3', title: ' Technical support',    description: 'Get help with a problem' },
        { id: 'faq_4', title: ' Talk to a human',      description: 'Connect with support staff' },
    ],
    sectionTitle: 'How can we help?',
    typingDelayMs: 1200,        // simulate typing before greeting appears
    persistPath: null,          // set to a file path to persist seen JIDs across restarts
    ignoreGroups: true,         // don't fire in group chats
    ignoreNewsletter: true,     // don't fire for newsletter messages
    ignoreBroadcast: true,      // don't fire for broadcast messages
    onGreet: null,              // async (jid, message) => {}  called after greeting sent
    onFaqReply: null,           // async (jid, faqId, message) => {}  called when user picks a FAQ
};

//  Persistent seen-JID store 

const createSeenStore = (persistPath) => {
    const seen = new Set();

    // Load from file if path given and file exists
    if (persistPath && existsSync(persistPath)) {
        try {
            const data = JSON.parse(readFileSync(persistPath, 'utf8'));
            if (Array.isArray(data)) data.forEach(jid => seen.add(jid));
        } catch (_) {}
    }

    const save = () => {
        if (!persistPath) return;
        try {
            writeFileSync(persistPath, JSON.stringify([...seen]), 'utf8');
        } catch (_) {}
    };

    return {
        has: (jid) => seen.has(jid),
        add: (jid) => { seen.add(jid); save(); },
        delete: (jid) => { seen.delete(jid); save(); },
        clear: () => { seen.clear(); save(); }
    };
};

//  Build the welcome interactive list message 

const buildWelcomeMessage = (config, quotedMsg = null) => {
    const { greeting, footer, buttonText, faqs, sectionTitle } = config;

    const content = {
        text: greeting,
        footer,
        buttonText,
        sections: [
            {
                title: sectionTitle,
                rows: faqs.map(faq => ({
                    title: faq.title,
                    description: faq.description || '',
                    rowId: faq.id
                }))
            }
        ]
    };

    if (quotedMsg) {
        content.quoted = quotedMsg;
    }

    return content;
};

//  Main factory 

/**
 * createWelcomeFlow  attach a Meta Business-style welcome template to a socket.
 *
 * @param {object} sock    - Baileys socket
 * @param {object} config  - Partial config  merges with DEFAULT_CONFIG
 * @returns {{ listen, stop, reset, resetAll }}
 */
export const createWelcomeFlow = (sock, config = {}) => {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const seen = createSeenStore(cfg.persistPath);

    //  FAQ reply handler  called when user selects a list option 
    const handleFaqReply = async (msg) => {
        if (typeof cfg.onFaqReply !== 'function') return;
        const reply = msg.message?.listResponseMessage;
        if (!reply) return;
        const faqId = reply.singleSelectReply?.selectedRowId;
        const jid = jidNormalizedUser(msg.key.remoteJid);
        if (faqId) {
            await cfg.onFaqReply(jid, faqId, msg);
        }
    };

    //  First-message handler 
    const handleMessage = async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            try {
                const jid = msg.key?.remoteJid;
                if (!jid || msg.key?.fromMe) continue;

                // Skip ignored JID types
                if (cfg.ignoreGroups && isJidGroup(jid)) continue;
                if (cfg.ignoreNewsletter && isJidNewsletter(jid)) continue;
                if (cfg.ignoreBroadcast && isJidBroadcast(jid)) continue;

                const normalizedJid = jidNormalizedUser(jid);

                // Check if it's a FAQ reply first
                if (msg.message?.listResponseMessage) {
                    await handleFaqReply(msg);
                    continue;
                }

                // Already greeted this contact  skip
                if (seen.has(normalizedJid)) continue;

                // Mark as seen immediately to prevent race conditions
                seen.add(normalizedJid);

                // Simulate typing before the greeting
                if (cfg.typingDelayMs > 0) {
                    await sock.sendPresenceUpdate('composing', jid);
                    await delay(cfg.typingDelayMs);
                    await sock.sendPresenceUpdate('paused', jid);
                }

                // Send the welcome message
                const welcomeContent = buildWelcomeMessage(cfg, msg);
                await sock.sendMessage(jid, welcomeContent);

                // Fire onGreet callback if provided
                if (typeof cfg.onGreet === 'function') {
                    await cfg.onGreet(normalizedJid, msg).catch(() => {});
                }
            } catch (_) {}
        }
    };

    //  Public API 
    return {
        /**
         * Start listening for new contacts.
         */
        listen() {
            sock.ev.on('messages.upsert', handleMessage);
        },

        /**
         * Stop listening.
         */
        stop() {
            sock.ev.off('messages.upsert', handleMessage);
        },

        /**
         * Force re-greet a specific contact next time they message.
         * @param {string} jid
         */
        reset(jid) {
            seen.delete(jidNormalizedUser(jid));
        },

        /**
         * Clear all seen contacts  everyone gets re-greeted.
         */
        resetAll() {
            seen.clear();
        },

        /**
         * Check if a contact has already been greeted.
         * @param {string} jid
         * @returns {boolean}
         */
        hasGreeted(jid) {
            return seen.has(jidNormalizedUser(jid));
        }
    };
};


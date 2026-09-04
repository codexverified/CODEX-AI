'use strict';
const config = require('../../config');
 
// Default word list â€” extend as needed
const DEFAULT_BAD_WORDS = [
    'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'pussy',
    'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'motherfucker',
    'bullshit', 'damn', 'ass', 'piss', 'cock', 'rape',
];
 
// Allow group admins/owners to customize the list per group
const groupCustomWords = new Map(); // groupJid â†’ Set<string>
 
function getBadWords(groupJid) {
    const base = new Set(DEFAULT_BAD_WORDS);
    const custom = groupCustomWords.get(groupJid) || new Set();
    return new Set([...base, ...custom]);
}
 
function containsBadWord(text, badWords) {
    const lower = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
    for (const word of badWords) {
        const pattern = new RegExp(`\\b${word}\\b`, 'i');
        if (pattern.test(lower)) return word;
    }
    return null;
}
 
module.exports = [
    // â”€â”€ Toggle command â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        commands: ['antibad', 'antibadwords', 'antiswear', 'noswear'],
    category: 'admin',
        description: 'Toggle anti-bad-words filter in a group â€” auto-deletes profanity',
        usage: '.antibad on/off',
        permission: 'admin',
        group: true,
        private: false,
 
        run: async (sock, message, args, ctx) => {
            const { reply, isBotAdmin } = ctx;
            const jid = message.key.remoteJid;
 
            if (!isBotAdmin) return reply(`â›” I need to be an admin to delete messages.`);
 
            const action = (args[0] || '').toLowerCase();
            if (action === 'on') {
                config.ANTI_BAD = true;
                return reply(
                    `ðŸ¤¬ *Anti-Bad Words: ON*\n\n` +
                    `I will delete any message containing profanity and warn the sender.\n\n` +
                    `_Admins and the owner are exempt._`
                );
            }
            if (action === 'off') {
                config.ANTI_BAD = false;
                return reply(`âœ… *Anti-Bad Words: OFF*\n\nFilter disabled.`);
            }
 
            const status = config.ANTI_BAD ? 'âœ… ON' : 'âŒ OFF';
            reply(
                `ðŸ¤¬ *Anti-Bad Words Filter*\n\n` +
                `Status: ${status}\n\n` +
                `*Usage:*\n` +
                `â€¢ \`.antibad on\` â€” enable\n` +
                `â€¢ \`.antibad off\` â€” disable\n` +
                `â€¢ \`.addword <word>\` â€” add a custom banned word\n` +
                `â€¢ \`.removeword <word>\` â€” remove a word\n` +
                `â€¢ \`.badwordslist\` â€” see all banned words`
            );
        },
    },
 
    // â”€â”€ Add custom word â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        commands: ['addword', 'addban', 'banword'],
    category: 'group',
        description: 'Add a custom word to the bad-words filter for this group',
        usage: '.addword <word>',
        permission: 'admin',
        group: true,
        private: false,
 
        run: async (sock, message, args, ctx) => {
            const { reply } = ctx;
            const jid = message.key.remoteJid;
            const word = (args[0] || '').toLowerCase().trim();
            if (!word) return reply(`â“ Provide a word: \`.addword badword\``);
 
            if (!groupCustomWords.has(jid)) groupCustomWords.set(jid, new Set());
            groupCustomWords.get(jid).add(word);
 
            reply(`âœ… *"${word}"* has been added to the banned words list for this group.`);
        },
    },
 
    // â”€â”€ Remove custom word â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        commands: ['removeword', 'unbanword', 'delword'],
    category: 'admin',
        description: 'Remove a word from the bad-words filter',
        usage: '.removeword <word>',
        permission: 'admin',
        group: true,
        private: false,
 
        run: async (sock, message, args, ctx) => {
            const { reply } = ctx;
            const jid = message.key.remoteJid;
            const word = (args[0] || '').toLowerCase().trim();
            if (!word) return reply(`â“ Provide a word: \`.removeword word\``);
 
            const removed = groupCustomWords.get(jid)?.delete(word);
            reply(removed
                ? `âœ… *"${word}"* has been removed from the banned words list.`
                : `âš ï¸ *"${word}"* was not in the custom list. (Built-in words cannot be removed via this command.)`
            );
        },
    },
 
    // â”€â”€ List banned words â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        commands: ['badwordslist', 'badwords', 'bannedwords'],
    category: 'group',
        description: 'Show all banned words in this group',
        permission: 'admin',
        group: true,
        private: false,
 
        run: async (sock, message, args, ctx) => {
            const { reply } = ctx;
            const jid = message.key.remoteJid;
            const custom = [...(groupCustomWords.get(jid) || [])];
            reply(
                `ðŸ¤¬ *Banned Words*\n\n` +
                `*Built-in (${DEFAULT_BAD_WORDS.length}):* _[hidden for privacy]_\n\n` +
                `*Custom (${custom.length}):*\n${custom.length ? custom.map((w, i) => `${i + 1}. ${w}`).join('\n') : '_(none added)_'}`
            );
        },
    },
 
    // â”€â”€ Event handler â€” runs on EVERY message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        commands: [],
    category: 'group',
        description: 'Anti-bad-words event listener',
        permission: 'public',
        group: true,
        private: false,
        isEvent: true,
 
        run: async (sock, message, args, ctx) => {
            if (!config.ANTI_BAD) return;
            if (!message.key.remoteJid?.endsWith('@g.us')) return;
 
            const { isAdmin, isOwner, isBotAdmin } = ctx;
            if (isAdmin || isOwner) return; // Exempt admins/owner
 
            const text = message.message?.conversation
                || message.message?.extendedTextMessage?.text
                || message.message?.imageMessage?.caption
                || message.message?.videoMessage?.caption
                || '';
 
            if (!text) return;
 
            const jid = message.key.remoteJid;
            const badWords = getBadWords(jid);
            const found = containsBadWord(text, badWords);
            if (!found) return;
 
            if (!isBotAdmin) return; // Can't delete if not admin
 
            try {
                await sock.sendMessage(jid, { delete: message.key });
                const sender = message.key.participant || message.key.remoteJid;
                const senderNum = sender.split('@')[0];
                await sock.sendMessage(jid, {
                    text:
                        `âš ï¸ *Warning!* @${senderNum}\n\n` +
                        `Your message was deleted â€” it contained inappropriate language.\n` +
                        `Please keep the chat respectful! ðŸ™\n\n` +
                        `_${config.BOT_NAME || 'CODEX AI'} Anti-Bad Words_`,
                    mentions: [sender],
                }, { quoted: message });
            } catch { /* silent fail */ }
        },
    },
];

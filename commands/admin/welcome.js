'use strict';
 
// Map of jid -> { welcome: bool, goodbye: bool, customWelcome: string, customGoodbye: string }
// Read by codex.js group-participants.update handler
const groupSettings = new Map();
global.welcomeSettings = groupSettings;
 
module.exports = {
    commands:    ['welcome', 'goodbye', 'setwelcome', 'setgoodbye', 'welcomeoff', 'goodbyeoff'],
    category: 'admin',
    description: 'Auto-welcome new members and farewell members who leave',
    usage:       '.welcome on/off | .setwelcome Custom message (use {name} for member name)',
    permission:  'admin',
    group:       true,
    private:     false,
 
    run: async (sock, message, args, ctx) => {
        const { jid, isAdmin, contextInfo, theme } = ctx;
 
        const rawCmd = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
 
        if (!isAdmin) {
            return sock.sendMessage(jid, { text: theme.admin || 'â›” Only admins can configure welcome messages.', contextInfo }, { quoted: message });
        }
 
        const settings = groupSettings.get(jid) || { welcome: false, goodbye: false, customWelcome: '', customGoodbye: '' };
 
        if (rawCmd === 'welcome') {
            const sub = (args[0] || '').toLowerCase();
            if (sub === 'on') {
                settings.welcome = true;
                groupSettings.set(jid, settings);
                return sock.sendMessage(jid, {
                    text: `ðŸ‘‹ *Welcome messages ON*\n\nNew members will be greeted automatically.\n\nCustomise with: \`.setwelcome Your message {name}\``,
                    contextInfo
                }, { quoted: message });
            }
            if (sub === 'off') {
                settings.welcome = false;
                groupSettings.set(jid, settings);
                return sock.sendMessage(jid, { text: 'ðŸ‘‹ *Welcome messages OFF*', contextInfo }, { quoted: message });
            }
            // Show status
            const status = settings.welcome ? 'âœ… ON' : 'âŒ OFF';
            const custom = settings.customWelcome ? `\n\n*Custom message:*\n${settings.customWelcome}` : '';
            return sock.sendMessage(jid, {
                text: `ðŸ‘‹ *Welcome Status:* ${status}${custom}\n\n*Commands:*\nâ€¢ \`.welcome on/off\`\nâ€¢ \`.setwelcome Your message {name}\``,
                contextInfo
            }, { quoted: message });
        }
 
        if (rawCmd === 'goodbye') {
            const sub = (args[0] || '').toLowerCase();
            if (sub === 'on') {
                settings.goodbye = true;
                groupSettings.set(jid, settings);
                return sock.sendMessage(jid, {
                    text: `ðŸ‘‹ *Goodbye messages ON*\n\nMembers who leave will get a farewell.\n\nCustomise with: \`.setgoodbye Your message {name}\``,
                    contextInfo
                }, { quoted: message });
            }
            if (sub === 'off') {
                settings.goodbye = false;
                groupSettings.set(jid, settings);
                return sock.sendMessage(jid, { text: 'ðŸ‘‹ *Goodbye messages OFF*', contextInfo }, { quoted: message });
            }
            const status = settings.goodbye ? 'âœ… ON' : 'âŒ OFF';
            const custom = settings.customGoodbye ? `\n\n*Custom message:*\n${settings.customGoodbye}` : '';
            return sock.sendMessage(jid, {
                text: `ðŸ‘‹ *Goodbye Status:* ${status}${custom}\n\n*Commands:*\nâ€¢ \`.goodbye on/off\`\nâ€¢ \`.setgoodbye Your message {name}\``,
                contextInfo
            }, { quoted: message });
        }
 
        if (rawCmd === 'setwelcome') {
            const msg = args.join(' ').trim();
            if (!msg) {
                return sock.sendMessage(jid, {
                    text: `âŒ Provide a message. Use *{name}* as a placeholder for the member's number.\n\nExample: \`.setwelcome Welcome to the group, {name}! ðŸŽ‰\``,
                    contextInfo
                }, { quoted: message });
            }
            settings.customWelcome = msg;
            settings.welcome = true;
            groupSettings.set(jid, settings);
            return sock.sendMessage(jid, {
                text: `âœ… *Custom welcome set and enabled:*\n\n${msg}`,
                contextInfo
            }, { quoted: message });
        }
 
        if (rawCmd === 'setgoodbye') {
            const msg = args.join(' ').trim();
            if (!msg) {
                return sock.sendMessage(jid, {
                    text: `âŒ Provide a message. Use *{name}* as a placeholder.\n\nExample: \`.setgoodbye Goodbye {name}, take care! ðŸ‘‹\``,
                    contextInfo
                }, { quoted: message });
            }
            settings.customGoodbye = msg;
            settings.goodbye = true;
            groupSettings.set(jid, settings);
            return sock.sendMessage(jid, {
                text: `âœ… *Custom goodbye set and enabled:*\n\n${msg}`,
                contextInfo
            }, { quoted: message });
        }
 
        if (rawCmd === 'welcomeoff') {
            settings.welcome = false;
            groupSettings.set(jid, settings);
            return sock.sendMessage(jid, { text: 'ðŸ‘‹ *Welcome messages OFF*', contextInfo }, { quoted: message });
        }
 
        if (rawCmd === 'goodbyeoff') {
            settings.goodbye = false;
            groupSettings.set(jid, settings);
            return sock.sendMessage(jid, { text: 'ðŸ‘‹ *Goodbye messages OFF*', contextInfo }, { quoted: message });
        }
    }
};

'use strict';
 
const config = require('../../config');
 
 
if (typeof global.antivvEnabled === 'undefined') {
    global.antivvEnabled = config.ANTIVV !== false;
}
 
module.exports = {
    commands:    ['antivv', 'avv'],
    category: 'admin',
    description: 'Toggle automatic view-once reveal on/off',
    permission:  'owner',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, { sender, contextInfo }) => {
        const jid = message.key.remoteJid;
 
        const sub = (args[0] || '').toLowerCase();
 
        if (sub === 'on') {
            global.antivvEnabled = true;
        } else if (sub === 'off') {
            global.antivvEnabled = false;
        } else {
            // No argument â†’ flip current state
            global.antivvEnabled = !global.antivvEnabled;
        }
 
        const state  = global.antivvEnabled;
        const icon   = state ? 'âœ…' : 'âŒ';
        const label  = state ? 'ENABLED' : 'DISABLED';
 
        await sock.sendMessage(jid, { react: { text: state ? 'ðŸ‘ï¸' : 'ðŸ™ˆ', key: message.key } });
        await sock.sendMessage(jid, {
            text: `${icon} *Anti-ViewOnce ${label}*\n\n${state
                ? 'ðŸ‘ï¸ All view-once messages will be automatically revealed and forwarded to the owner.'
                : 'ðŸ™ˆ Automatic view-once reveal is now off.'}`,
            contextInfo
        }, { quoted: message });
    }
};

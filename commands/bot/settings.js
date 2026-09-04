'use strict';
 
const config = require('../../config');
const { fmt, getStr } = require('../../lib/theme');
 
function tick(val) {
    return val ? 'âœ…' : 'âŒ';
}
 
function modeLabel(m) {
    const map = {
        public:  'ðŸŒ Public  (everyone can use)',
        private: 'ðŸ”’ Private (owner only)',
        group:   'ðŸ‘¥ Groups  (group members)',
        inbox:   'ðŸ“¥ Inbox   (private chats only)',
        both:    'ðŸŒ Public  (everyone can use)',
    };
    return map[(m || '').toLowerCase()] || m;
}
 
module.exports = {
    commands:    ['settings', 'config', 'botsettings'],
    description: 'Show all current bot settings and toggles',
    permission:  'owner',
    group:       true,
    private:     true,
 
    async run(sock, message, args, ctx) {
        const { reply } = ctx;
 
        const botName  = getStr('botName') || config.BOT_NAME  || 'CODEX AI';
        const ownerNum = (config.OWNER_NUMBER || process.env.OWNER_NUMBER || '').replace(/\D/g, '');
        const prefix   = config.PREFIX || '.';
        const theme    = config.THEME  || 'codex';
        const mode     = config.MODE   || 'both';
 
        let greetText    = false;
        let greetEnabled = false;
        try {
            const gp = require('path').join(__dirname, '../../data/greet.json');
            if (require('fs').existsSync(gp)) {
                const gd = JSON.parse(require('fs').readFileSync(gp, 'utf8'));
                greetText    = !!(gd['__text__'] || (config.GREETING || '').trim());
                greetEnabled = gd['__enabled__'] !== false && greetText;
            } else {
                greetText    = !!(config.GREETING || '').trim();
                greetEnabled = greetText;
            }
        } catch { /* ignore */ }
        const greetSet = greetText;
 
        const lines = [
            `âš™ï¸ *Bot Settings*`,
            ``,
            `â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`,
            `â”‚ ðŸ¤– *Bot Name:*     ${botName}`,
            `â”‚ ðŸ‘‘ *Owner:*        +${ownerNum || 'not set'}`,
            `â”‚ ðŸŽ¨ *Theme:*        ${theme}`,
            `â”‚ âŒ¨ï¸  *Prefix:*       ${prefix}`,
            `â”‚ ðŸŒ *Mode:*         ${modeLabel(mode)}`,
            `â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`,
            ``,
            `ðŸ“¡ *Status / Story*`,
            `  ${tick(config.AUTO_STATUS_SEEN)}  Auto View Status`,
            `  ${tick(config.AUTO_STATUS_REACT)}  Auto React to Status`,
            `  ${tick(config.AUTO_STATUS_REPLY)}  Auto Reply to Status`,
            ``,
            `ðŸ›¡ï¸ *Protection*`,
            `  ${tick(config.ANTIDELETE_GROUP)}    Restore Deleted (Groups)`,
            `  ${tick(config.ANTIDELETE_PRIVATE)}  Restore Deleted (Private)`,
            `  ${tick(config.ANTILINK)}    Anti-Link (Global)`,
            `  ${tick(config.ANTIVV)}     Anti-ViewOnce`,
            `  ${tick(config.ANTI_BAD)}   Anti-Bad Words`,
            ``,
            `ðŸ’¬ *Presence & Behaviour*`,
            `  ${tick(config.AUTO_TYPING)}    Auto Typing indicator`,
            `  ${tick(config.AUTO_RECORDING)}  Auto Recording indicator`,
            `  ${tick(config.READ_MESSAGE)}   Auto Read (blue tick)`,
            `  ${tick(config.ALWAYS_ONLINE)}  Always Online`,
            `  ${tick(config.AUTO_REACT_NEWSLETTER)}  Auto React Newsletter`,
            ``,
            `ðŸ‘‹ *Greeting*`,
            `  ${tick(greetEnabled)}  Auto-Greeting *${greetEnabled ? 'ON' : (greetSet ? 'OFF (paused)' : 'OFF')}* â€” once per day`,
            `  ${greetSet ? `Use \`${prefix}getgreet\` to view â€¢ \`${prefix}greeton\`/\`${prefix}greetoff\` to toggle` : `Set with \`${prefix}setgreet <msg>\` or GREETING= in config`}`,
            ``,
            `ðŸ“Œ *Change settings*`,
            `  Edit your \`config.env\` / Replit Secrets,`,
            `  then restart the bot for changes to take effect.`,
        ];
 
        return reply(fmt(lines.join('\n')));
    }
};

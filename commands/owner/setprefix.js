'use strict';
 
const fs   = require('fs');
const path = require('path');
const { fmt } = require('../../lib/theme');
 
const ENV_FILE = path.join(__dirname, '../../../config.env');
 
function persistPrefix(value) {
    try {
        let content = '';
        if (fs.existsSync(ENV_FILE)) {
            content = fs.readFileSync(ENV_FILE, 'utf8');
            content = content
                .split('\n')
                .filter(l => !l.trim().startsWith('PREFIX='))
                .join('\n')
                .trim();
        }
        content = content ? content + `\nPREFIX=${value}` : `PREFIX=${value}`;
        fs.writeFileSync(ENV_FILE, content + '\n');
    } catch (e) {
        console.warn('[setprefix] Could not persist to config.env:', e.message);
    }
}
 
module.exports = {
    commands:    ['setprefix', 'prefix', 'changeprefix'],
    category: 'owner',
    description: 'View or change the bot command prefix at runtime',
    usage:       '.setprefix .  |  .setprefix .,!,/  |  .setprefix any  |  .setprefix none',
    permission:  'owner',
    group:       false,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, isOwner, reply, prefix, config: cfg } = ctx;
        const config = require('../../config');
 
        if (!isOwner) return reply(fmt('Ã¢â€ºâ€ Only the bot owner can change the prefix.'));
 
        const current = config.PREFIX || '.';
 
        // Show current prefix when no args
        if (!args.length) {
            const display = current === '' || current.toLowerCase() === 'none'
                ? '_none (no prefix)_'
                : current.toLowerCase() === 'any'
                    ? '_any symbol_'
                    : `\`${current}\``;
 
            return reply(fmt(
                `*Current Prefix:* ${display}\n\n` +
                `*How to change:*\n` +
                `Ã¢â‚¬Â¢ \`.setprefix .\` Ã¢â‚¬â€ single prefix\n` +
                `Ã¢â‚¬Â¢ \`.setprefix .,!,/,?\` Ã¢â‚¬â€ multiple (any of them works)\n` +
                `Ã¢â‚¬Â¢ \`.setprefix any\` Ã¢â‚¬â€ any symbol, emoji or punctuation\n` +
                `Ã¢â‚¬Â¢ \`.setprefix none\` Ã¢â‚¬â€ no prefix (bare commands)\n` +
                `Ã¢â‚¬Â¢ \`.setprefix Ã°Å¸Â¤â€“\` Ã¢â‚¬â€ emoji prefix`
            ));
        }
 
        const newPrefix = args.join(' ').trim();
 
        if (!newPrefix) return reply(fmt('Ã¢ÂÅ’ Prefix cannot be empty. Use `none` to disable the prefix.'));
 
        // Validate: reject very long values
        if (newPrefix.length > 50) return reply(fmt('Ã¢ÂÅ’ Prefix too long (max 50 characters).'));
 
        // Apply in memory immediately
        config.PREFIX = newPrefix;
 
        // Persist to config.env so it survives restart
        persistPrefix(newPrefix);
 
        const isNone = newPrefix.toLowerCase() === 'none' || newPrefix === '';
        const isAny  = newPrefix.toLowerCase() === 'any';
        const list   = !isNone && !isAny ? newPrefix.split(',').map(p => p.trim()).filter(Boolean) : [];
 
        let summary = '';
        if (isNone)        summary = 'Ã¢Å“â€¦ *Prefix disabled.* Commands now work without any prefix.';
        else if (isAny)    summary = 'Ã¢Å“â€¦ *Any-prefix mode.* Any symbol, emoji or punctuation triggers commands.';
        else if (list.length > 1)
            summary = `Ã¢Å“â€¦ *Multi-prefix set:* ${list.map(p => `\`${p}\``).join('  ')}`;
        else
            summary = `Ã¢Å“â€¦ *Prefix set to:* \`${newPrefix}\``;
 
        return reply(fmt(summary + '\n\n_Change takes effect immediately. Restart is not required._'));
    }
};

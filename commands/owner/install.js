const { saveAndLoad, listPlugins } = require('../../lib/pluginManager');

module.exports = {
    name: 'install',
    aliases: ['installplugin', 'plugin'],
    category: 'owner',
    reactions: { start: '🔐' },
    description: 'Install an external command plugin from a GitHub Gist/raw link',
    usage: '.install <link> (or reply to a message containing the link)',
    ownerOnly: true,

    async execute(bot, m, args) {
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'list' || sub === 'ls') {
            const plugins = listPlugins(bot);
            if (!plugins.length) return await m.reply('No plugins installed.');
            const text = plugins
                .map((cmd, i) => `${i + 1}. ${bot.prefix}${cmd.name}${cmd.source ? `\n   ${cmd.source}` : ''}`)
                .join('\n');
            return await m.reply(`Installed plugins:\n${text}\n\nTotal: ${plugins.length}`);
        }

        // Reply to a message containing the link and just send .install with
        // no arguments — same convention as .join for group invite links.
        const link = sub === 'help' ? '' : (args.join(' ').trim()
            || m.msg?.contextInfo?.quotedMessage?.conversation
            || m.msg?.contextInfo?.quotedMessage?.extendedTextMessage?.text
            || '');

        if (!link) {
            return await m.reply(
                `Plugin installer\n\n` +
                `Usage:\n` +
                `${bot.prefix}install <plugin link>\n` +
                `${bot.prefix}install list\n` +
                `(or reply to a message containing the link with ${bot.prefix}install)\n\n` +
                `Supported links:\n` +
                `GitHub Gist, raw GitHub file, or github.com/.../blob/... JS file.`
            );
        }

        await m.reply('Installing plugin...');

        try {
            const result = await saveAndLoad(bot, link);
            const aliases = result.command.aliases || result.command.alias || [];
            const aliasList = (Array.isArray(aliases) ? aliases : [aliases]).filter(Boolean);

            return await m.reply(
                `Plugin installed.\n\n` +
                `Command: ${bot.prefix}${result.command.name}\n` +
                `Aliases: ${aliasList.length ? aliasList.map(a => bot.prefix + a).join(', ') : 'none'}\n` +
                `File: plugins/${result.command.name}.js\n` +
                `Source: ${result.source}\n\n` +
                `This will still be here after a restart — installed plugin files load automatically on boot, same as any other plugin.`
            );
        } catch (e) {
            return await m.reply(`Plugin install failed: ${e.message}`);
        }
    }
};

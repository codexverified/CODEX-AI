const { saveAndLoad, listPlugins } = require('../../lib/pluginManager');

// Pulls every http(s) link out of a block of text, in order, de-duped.
// Lets .install accept either a single link or a whole message listing
// several links (one per line, or just wrapped in prose) and install
// each one in turn.
function extractLinks(text) {
    const found = String(text || '').match(/https?:\/\/\S+/gi) || [];
    const cleaned = found.map(u => u.replace(/[)\]}>,.;'"]+$/, ''));
    return [...new Set(cleaned)];
}

module.exports = {
    name: 'install',
    aliases: ['installplugin', 'plugin'],
    category: 'owner',
    reactions: { start: '🔐' },
    description: 'Install one or more external command plugins from GitHub Gist/raw links',
    usage: '.install <link> [more links...] (or reply to a message containing the link(s))',
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

        // Reply to a message containing the link(s) and just send .install
        // with no arguments — same convention as .join for group invite links.
        const rawText = sub === 'help' ? '' : (args.join(' ').trim()
            || m.msg?.contextInfo?.quotedMessage?.conversation
            || m.msg?.contextInfo?.quotedMessage?.extendedTextMessage?.text
            || '');

        const links = extractLinks(rawText);

        if (!links.length) {
            return await m.reply(
                `Plugin installer\n\n` +
                `Usage:\n` +
                `${bot.prefix}install <link> [more links...]\n` +
                `${bot.prefix}install list\n` +
                `(or reply to a message containing the link(s) with ${bot.prefix}install)\n\n` +
                `Supported links:\n` +
                `GitHub Gist, raw GitHub file, or github.com/.../blob/... JS file.`
            );
        }

        for (const link of links) {
            let label = link;
            try {
                const result = await saveAndLoad(bot, link, async (name) => {
                    label = name;
                    await m.reply(`Installing ${name}...`);
                });
                await m.reply(`${result.command.name} installed`);
            } catch (e) {
                await m.reply(`${label} failed: ${e.message}`);
            }
        }
    }
};

// temp-mail-io ships as an ESM-only package, so it's loaded with a dynamic
// import() at call time rather than require() at the top of the file — a
// top-level require() would throw ERR_REQUIRE_ESM and crash the loader.
let _tempMail = null;
async function getTempMail() {
    if (!_tempMail) _tempMail = await import('temp-mail-io');
    return _tempMail;
}

module.exports = {
    name: 'genmail',
    aliases: ['genemail', 'tempmail'],
    category: 'tools',
    reactions: { start: '📧' },
    description: 'Generate a temporary email address. Use .chckmail to check its inbox.',

    async execute(bot, m) {
        try {
            await m.reply('⏳ Generating temporary email...');
            const { newEmail } = await getTempMail();
            const r = await newEmail();
            await m.reply(
                `📧 *Temporary Email Generated*\n\n` +
                `Email: ${r.email}\n` +
                `Token: ${r.token}\n\n` +
                `Check its inbox anytime with:\n*${bot.prefix}chckmail ${r.email}*`
            );
        } catch (err) {
            await m.reply('❌ Failed to generate temporary email.');
        }
    },
};

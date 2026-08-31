// temp-mail-io ships as an ESM-only package, so it's loaded with a dynamic
// import() at call time rather than require() at the top of the file — a
// top-level require() would throw ERR_REQUIRE_ESM and crash the loader.
let _tempMail = null;
async function getTempMail() {
    if (!_tempMail) _tempMail = await import('temp-mail-io');
    return _tempMail;
}

module.exports = {
    name: 'chckmail',
    aliases: ['checkmail', 'inbox'],
    category: 'tools',
    reactions: { start: '📬' },
    description: 'Check the inbox of a temporary email address generated with .genmail.',
    usage: '.chckmail <email>',

    async execute(bot, m, args) {
        const email = args[0];
        if (!email) return await m.reply(`Usage: *${bot.prefix}chckmail <email>*\nGenerate one first with *${bot.prefix}genmail*`);

        await m.reply(`⏳ Checking inbox for *${email}*...`);

        try {
            const { fetchEmails } = await getTempMail();
            const emails = await fetchEmails(email);

            if (!emails || emails.length === 0) {
                return await m.reply(`📭 Inbox empty for:\n${email}`);
            }

            const slice = emails.slice(0, 5);
            let text = `📬 *Inbox (${emails.length} message${emails.length === 1 ? '' : 's'})*\n📧 ${email}\n\n`;
            slice.forEach((mail, i) => {
                text += `*${i + 1}. From:* ${mail.from || 'Unknown'}\n*Subject:* ${mail.subject || '(No Subject)'}\n${(mail.body_text || '(Empty body)').slice(0, 300)}\n\n`;
            });
            if (emails.length > 5) text += `_...and ${emails.length - 5} more message(s)._`;

            await m.reply(text.slice(0, 4000));
        } catch (err) {
            await m.reply('❌ Failed to fetch emails. Make sure the email address is valid.');
        }
    },
};

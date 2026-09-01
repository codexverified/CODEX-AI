const { loadDB, saveDB, getUser, fmt, CURRENCY } = require('../../lib/economyEngine');
const { requirePin } = require('../../lib/economyPin');

module.exports = {
    name: 'deposit',
    aliases: ['dep', 'depall'],
    category: 'economy',
    reactions: { start: '⚙️' },
    description: 'Deposit coins into your bank. Usage: .deposit <amount|all> (or .depall to deposit everything)',

    async execute(bot, m, args, cmdName) {
        const db = loadDB();
        const user = getUser(db, m.sender);

        const input = cmdName === 'depall' ? 'all' : (args[0] || '').toLowerCase();
        const amount = input === 'all' ? user.wallet : parseInt(input);
        const pinCheck = requirePin(user, args[1]);
        if (!pinCheck.ok) return await m.reply(pinCheck.message);

        if (!amount || amount < 1) return await m.reply(`Usage: *.deposit <amount>* or *.deposit all*`);
        if (amount > user.wallet) return await m.reply(`❌ You only have *${fmt(user.wallet)}* ${CURRENCY} in your wallet.`);

        user.wallet -= amount;
        user.bank   += amount;
        saveDB(db);

        await m.reply(`🏦 *DEPOSIT SUCCESSFUL!*\n─────────────\nDeposited: *${fmt(amount)}* ${CURRENCY}\n👜 Wallet: *${fmt(user.wallet)}* ${CURRENCY}\n🏦 Bank:   *${fmt(user.bank)}* ${CURRENCY}`);
    }
};

const { loadDB, saveDB, getUser, addXP, fmt, CURRENCY } = require('../../lib/economyEngine');

const MAX_GAMBLE = 500;

module.exports = {
    name: 'gamble',
    aliases: ['coinflip50'],
    category: 'economy',
    reactions: { start: '🎰' },
    description: `Gamble your coins on a 50/50 chance to double them (max ${MAX_GAMBLE}). Usage: .gamble <amount>`,

    async execute(bot, m, args) {
        const db = loadDB();
        const user = getUser(db, m.sender);

        const amount = parseInt(args[0]);
        if (!amount || amount <= 0) return await m.reply(`Usage: *.gamble <amount>*\nExample: .gamble 200`);
        if (amount > MAX_GAMBLE) return await m.reply(`❌ Maximum gamble amount is *${fmt(MAX_GAMBLE)}* ${CURRENCY}.`);
        if (amount > user.wallet) return await m.reply(`❌ You only have *${fmt(user.wallet)}* ${CURRENCY} in your wallet.`);

        const win = Math.random() > 0.5;

        if (win) {
            user.wallet += amount;
            user.stats.earned = (user.stats.earned || 0) + amount;
            addXP(user, 10);
            saveDB(db);
            return await m.reply(`🎰 *YOU WON!* 🎉\n─────────────\nBet: *${fmt(amount)}* ${CURRENCY}\nWon: +*${fmt(amount)}* ${CURRENCY}\n💼 Balance: *${fmt(user.wallet)}* ${CURRENCY}`);
        }

        user.wallet -= amount;
        user.stats.lost = (user.stats.lost || 0) + amount;
        saveDB(db);
        await m.reply(`🎰 *YOU LOST!* 😔\n─────────────\nBet: *${fmt(amount)}* ${CURRENCY}\nLost: -*${fmt(amount)}* ${CURRENCY}\n💼 Balance: *${fmt(user.wallet)}* ${CURRENCY}`);
    }
};

const games = new Map();

const SYMBOLS = ['🍒', '🍋', '🔔', '💎', '7️⃣', '🅱️'];
const BETS = [10, 20, 50];

function render(reels) {
  return reels.join(' │ ');
}

module.exports = {
  name: 'slot',
  aliases: ['slots', 'slotmachine'],
  category: 'Games',
  description: 'Play a fruit slot machine game.',
  usage: 'slot | slot bet | slot balance | slot reset',
  reactions: { start: '🎰', success: '✨' },

  async execute(sock, m, { args, reply }) {
    const action = String(args[0] || '').toLowerCase();
    const player = games.get(m.sender) || { credits: 500, bet: 10, best: 0 };

    if (action === 'reset') {
      games.set(m.sender, { credits: 500, bet: 10, best: 0 });
      return reply('🎰 Slot machine reset. Credits: 500 | Bet: 10');
    }

    if (action === 'balance' || action === 'credits') {
      return reply(`🎰 Credits: ${player.credits}\nCurrent bet: ${player.bet}\nBest win: ${player.best}`);
    }

    if (action === 'bet') {
      const requested = Number(args[1]);
      if (!BETS.includes(requested)) return reply('Choose a bet: 10, 20, or 50.');
      if (requested > player.credits) return reply('You do not have enough credits for that bet.');
      player.bet = requested;
      games.set(m.sender, player);
      return reply(`🎰 Bet changed to ${requested} credits.`);
    }

    if (player.credits < player.bet) {
      return reply('GAME OVER. Use .slot reset to start again.');
    }

    player.credits -= player.bet;
    const reels = Array.from({ length: 5 }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
    const counts = reels.reduce((result, symbol) => {
      result[symbol] = (result[symbol] || 0) + 1;
      return result;
    }, {});
    const match = Math.max(...Object.values(counts));
    const multiplier = match === 5 ? 20 : match === 4 ? 8 : match === 3 ? 3 : 0;
    const win = player.bet * multiplier;
    player.credits += win;
    player.best = Math.max(player.best, win);
    games.set(m.sender, player);

    const result = win ? `WIN +${win} credits` : player.credits ? 'TRY AGAIN' : 'GAME OVER';
    return reply(
      `🎰 *FRUIT BONANZA*\n\n${render(reels)}\n\n${result}\nCredits: ${player.credits}\nBet: ${player.bet}\n\nThree matching symbols win. Use .slot bet 10|20|50.`,
    );
  },
};

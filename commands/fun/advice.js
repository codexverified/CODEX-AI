const LOCAL_ADVICE = [
  'Take breaks. Your brain needs rest to function well.',
  'Progress, not perfection, is the goal.',
  'The best investment you can make is in yourself.',
  'Respond, do not react. There is a difference.',
  'Stop waiting for the perfect moment. Take the moment and make it perfect.',
];

module.exports = {
  name: 'advice',
  aliases: ['tip'],
  description: 'Get a random piece of advice',
  category: 'Fun',
  usage: 'advice',
  reactions: { start: '💡', success: '✨', error: '❔' },

  async execute(sock, m, { reply }) {
    let text;
    try {
      const response = await fetch('https://api.adviceslip.com/advice');
      const data = response.ok ? await response.json() : null;
      text = data?.slip?.advice;
    } catch {}

    text ??= LOCAL_ADVICE[Math.floor(Math.random() * LOCAL_ADVICE.length)];
    await reply(`*ADVICE*\n\n“${text}”`);
  },
};

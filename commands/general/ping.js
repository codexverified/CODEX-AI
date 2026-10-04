module.exports = {
    name: 'ping',
    alias: ['speed', 'latency', 'test'],
    desc: 'Check bot response speed',
    category: 'Bot',
    reactions: { start: '⏳' },

    execute: async (sock, m, { reply }) => {
        const start = Date.now();

        // Send initial "PINGING..." message
        const pingMsg = await reply('_❦  PINGING..._');

        const ms = Date.now() - start;

        // Edit the message to "PONG!" with ms
        await sock.sendMessage(m.chat, {
            edit: pingMsg.key,
            text: '_☙  PONG! ' +  ms + 'ms_'
        });
    }
};

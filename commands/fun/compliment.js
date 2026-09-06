'use strict';
 
const COMPLIMENTS = [
    "You make the world a better place just by being in it. ðŸŒŸ",
    "Your smile could light up the darkest room. âœ¨",
    "You have an incredible ability to make everyone feel welcome.",
    "Your kindness is a rare and beautiful gift to the world. ðŸŽ",
    "You are more resilient than you give yourself credit for. ðŸ’ª",
    "The way you carry yourself inspires people around you.",
    "Your creativity is genuinely impressive. ðŸŽ¨",
    "You handle challenges with such grace and strength.",
    "People are lucky to have you in their lives. ðŸ€",
    "Your sense of humor brings so much joy to others. ðŸ˜„",
    "You have a heart of gold. ðŸ’›",
    "You're doing better than you think. Keep going!",
    "Your intelligence and thoughtfulness are truly remarkable.",
    "You make hard things look easy â€” that's a real talent.",
    "Being around you feels like a breath of fresh air. ðŸŒ¬ï¸",
    "You bring out the best in the people around you. ðŸŒ¸",
    "Your dedication and work ethic are truly admirable. ðŸ†",
    "You have a beautiful mind and an even more beautiful soul.",
    "The world is genuinely better with you in it. ðŸŒ",
    "You are exactly who you need to be. ðŸ”¥",
];
 
module.exports = {
    commands:    ['compliment', 'comp', 'praise'],
    category: 'fun',
    description: 'Send a random compliment',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { contextInfo } = ctx;
        const jid  = message.key.remoteJid;
        const pick = COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)];
        const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const target = mentioned.length
            ? `@${mentioned[0].split('@')[0]}, ${pick.charAt(0).toLowerCase() + pick.slice(1)}`
            : pick;
        await sock.sendMessage(jid, {
            text: `ðŸ’ *Compliment*\n\n${target}`,
            contextInfo
        }, { quoted: message });
    }
};

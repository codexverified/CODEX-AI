'use strict';

const fs = require('fs');
const path = require('path');

const games = new Map();
const DICTIONARY_FILE = path.join(__dirname, '../../assets/wordchain/words.txt');
const COMMON_WORDS_FILE = path.join(__dirname, '../../assets/wordchain/common-words.txt');
const LOBBY_TIME = 30 * 1000;
const TURN_TIME = 30 * 1000;
const MAX_ROUNDS = 50;
const MIN_WORD_LENGTH = 2;
const MAX_WORD_LENGTH = 30;
const INVALID_LIMIT = 3;
const BASE_SCORE = 5;

const dictionary = new Set();
const wordsByLetter = new Map();

function loadDictionary() {
    try {
        const words = [DICTIONARY_FILE, COMMON_WORDS_FILE]
            .flatMap(file => {
                try {
                    return fs.readFileSync(file, 'utf8').split(/\r?\n/);
                } catch (error) {
                    console.error(`[wordchain] dictionary source failed (${path.basename(file)}):`, error.message);
                    return [];
                }
            });
        for (const rawWord of words) {
            const word = rawWord.trim().toLowerCase();
            if (!/^[a-z]{2,30}$/.test(word)) continue;
            if (dictionary.has(word)) continue;
            dictionary.add(word);
            const letter = word[0];
            if (!wordsByLetter.has(letter)) wordsByLetter.set(letter, []);
            wordsByLetter.get(letter).push(word);
        }
        console.log(`[wordchain] loaded ${dictionary.size.toLocaleString()} words`);
    } catch (error) {
        console.error('[wordchain] dictionary load failed:', error.message);
    }
}

loadDictionary();

function text(value) {
    return String(value || '').trim().toLowerCase();
}

function mention(jid) {
    return `@${String(jid).split('@')[0]}`;
}

function playerName(message) {
    return message.pushName || message.sender?.split('@')[0] || 'Player';
}

function clearTimer(game, key) {
    if (game[key]) clearTimeout(game[key]);
    game[key] = null;
}

function clearGame(chatId, game) {
    clearTimer(game, 'lobbyTimer');
    clearTimer(game, 'turnTimer');
    if (games.get(chatId) === game) games.delete(chatId);
}

function validInput(value) {
    return /^[a-z]{2,30}$/.test(value);
}

function availableContinuation(game, letter) {
    return (wordsByLetter.get(letter) || []).some(word => !game.usedWords.has(word));
}

function scoreFor(word, elapsed, streak) {
    let score = BASE_SCORE;
    if (word.length >= 5) score += 5;
    if (word.length >= 8) score += 5;
    if (word.length >= 12) score += 10;
    if (elapsed <= 5000) score += 5;
    if (streak >= 3) score += Math.min(15, Math.floor(streak / 3) * 5);
    return score;
}

function scoreText(game) {
    return [...game.players]
        .sort((a, b) => b.score - a.score || b.words - a.words)
        .map((player, index) => `${index + 1}. ${mention(player.jid)} — *${player.score} pts* (${player.words} words)`)
        .join('\n');
}

function playerMentions(game) {
    return game.players.map(player => player.jid).filter(Boolean);
}

async function send(sock, chatId, content, message) {
    return sock.sendMessage(chatId, content, message ? { quoted: message } : undefined);
}

async function finish(sock, chatId, game, heading, message) {
    const winner = [...game.players].sort((a, b) => b.score - a.score || b.words - a.words)[0];
    const mentions = game.players.map(player => player.jid);
    clearGame(chatId, game);
    return send(sock, chatId, {
        text: `🏆 *WORD CHAIN COMPLETE*\n\n${heading}\n` +
            `🥇 Winner: ${mention(winner.jid)}\n` +
            `🏅 Score: *${winner.score} points*\n` +
            `🔤 Words played: *${game.usedWords.size}*\n` +
            `🔁 Rounds: *${game.rounds}/${MAX_ROUNDS}*\n\n` +
            `📊 *FINAL SCORES*\n${scoreText(game)}`,
        mentions
    }, message);
}

function startTurn(sock, chatId, game) {
    clearTimer(game, 'turnTimer');
    if (games.get(chatId) !== game || game.phase !== 'active') return;
    const player = game.players[game.turn];
    if (!player) return;

    game.turnStartedAt = Date.now();
    game.turnTimer = setTimeout(async () => {
        if (games.get(chatId) !== game || game.phase !== 'active') return;
        const eliminated = game.players.splice(game.turn, 1)[0];
        if (!eliminated) return;
        if (game.players.length === 1) {
            return finish(sock, chatId, game, `${mention(eliminated.jid)} ran out of time.`, null);
        }
        game.turn %= game.players.length;
        const next = game.players[game.turn];
        await send(sock, chatId, {
            text: `⏰ ${mention(eliminated.jid)} was eliminated for running out of time.\n\n` +
                `🎯 ${mention(next.jid)}, your turn. Start with *${game.requiredLetter.toUpperCase()}*.\n` +
                `⏳ You have *30 seconds*.`,
            mentions: [eliminated.jid, next.jid]
        });
        startTurn(sock, chatId, game);
    }, TURN_TIME);
}

function startGame(sock, chatId, game, message) {
    if (game.players.length < 2) {
        return send(sock, chatId, { text: '⚠️ At least 2 players must join before starting.' }, message);
    }
    if (!dictionary.size) {
        return send(sock, chatId, { text: '❌ The word dictionary is unavailable.' }, message);
    }
    clearTimer(game, 'lobbyTimer');
    game.phase = 'active';
    game.sock = sock;
    game.turn = 0;
    game.requiredLetter = null;
    game.turnStartedAt = Date.now();
    void send(sock, chatId, {
        text: `🔗 *WORD CHAIN STARTED*\n\n` +
            `👥 Players: *${game.players.length}*\n` +
            `🎯 ${mention(game.players[0].jid)}, you play first with any word.\n` +
            `⏳ Each turn lasts *30 seconds*.\n` +
            `🚫 Three invalid attempts eliminate a player.\n` +
            `🏁 The game ends after *${MAX_ROUNDS} rounds*.`,
        mentions: game.players.map(player => player.jid)
    }, message);
    startTurn(sock, chatId, game);
}

function help(prefix) {
    return `*WORD CHAIN COMMANDS*\n\n` +
        `${prefix}wc start — open a lobby\n` +
        `${prefix}wc join — join the lobby\n` +
        `${prefix}wc begin — start with at least 2 players\n` +
        `${prefix}wc <word> — play your word\n` +
        `${prefix}wc status — show turn and scores\n` +
        `${prefix}wc score — show scores\n` +
        `${prefix}wc leave — leave the game\n` +
        `${prefix}wc stop — end the game`;
}

module.exports = {
    name: 'wordchain',
    aliases: ['wc', 'joinwc'],
    bareTriggers: ['join'],
    acceptsBareInput: true,
    shouldHandleBare(message) {
        const game = games.get(message?.chat);
        return Boolean(game && game.phase === 'active' && game.players[game.turn]?.jid === message?.sender);
    },
    description: 'Play a timed multiplayer word chain game',
    category: 'games',
    groupOnly: true,
    reactions: { start: '🎮', success: '🔗', error: '⚠️' },

    async execute(sock, message, { reply, args, prefix = '.' }, commandName) {
        const chatId = message.chat;
        const sender = message.sender;
        const action = text(args?.[0]);
        const option = text(args?.[1]);

        if (!chatId || !sender || !message.isGroup) return reply('❌ Word Chain only works in group chats.');

        const game = games.get(chatId);
        const joining = action === 'join' || action === 'joinwc' || (!action && (commandName === 'joinwc' || commandName === 'join'));

        if (joining) {
            if (!game) return reply(`❌ No lobby is open. Use ${prefix}wc start.`);
            if (game.phase !== 'lobby') return reply('⚠️ This game has already started.');
            if (game.players.some(player => player.jid === sender)) return reply('ℹ️ You already joined this game.');
            game.players.push({ jid: sender, name: playerName(message), score: 0, words: 0, streak: 0, invalid: 0 });
            return send(sock, chatId, { text: `✅ ${mention(sender)} joined. Players: *${game.players.length}*`, mentions: [sender] }, message);
        }

        if (action === 'help' || !action) return reply(help(prefix));

        if (action === 'start') {
            if (game && game.phase === 'lobby' && (option === 'manual' || option === 'now' || option === 'begin')) return startGame(sock, chatId, game, message);
            if (game) return reply(game.phase === 'active' ? '⚠️ A game is already active.' : `⚠️ A lobby is already open. Use ${prefix}wc join.`);
            const newGame = {
                phase: 'lobby',
                players: [{ jid: sender, name: playerName(message), score: 0, words: 0, streak: 0, invalid: 0 }],
                turn: 0,
                rounds: 0,
                requiredLetter: null,
                usedWords: new Set(),
                lobbyTimer: null,
                turnTimer: null,
                turnStartedAt: null,
                sock
            };
            games.set(chatId, newGame);
            newGame.lobbyTimer = setTimeout(() => {
                if (games.get(chatId) !== newGame || newGame.phase !== 'lobby') return;
                if (newGame.players.length >= 2) startGame(sock, chatId, newGame, null);
                else { clearGame(chatId, newGame); void send(sock, chatId, { text: '⌛ Lobby closed because fewer than 2 players joined.' }); }
            }, LOBBY_TIME);
            return send(sock, chatId, { text: `🔗 *WORD CHAIN LOBBY OPENED*\n\nHost: ${mention(sender)}\nJoin with ${prefix}wc join.\nThe lobby closes in *30 seconds*.`, mentions: [sender] }, message);
        }

        if (action === 'begin' || (action === 'start' && option === 'manual')) {
            if (!game) return reply(`❌ No lobby is open. Use ${prefix}wc start.`);
            return startGame(sock, chatId, game, message);
        }

        if (!game) return reply(`❌ No active game. Use ${prefix}wc start.`);
        if (action === 'stop') { clearGame(chatId, game); return reply('🛑 Word Chain stopped.'); }
        if (action === 'score') return send(sock, chatId, {
            text: `📊 *WORD CHAIN SCORES*\n\n${scoreText(game)}`,
            mentions: playerMentions(game)
        }, message);
        if (action === 'status') {
            if (game.phase === 'lobby') return send(sock, chatId, {
                text: `🔗 *LOBBY*\n\nPlayers: *${game.players.length}*\n${game.players.map(player => `• ${mention(player.jid)}`).join('\n')}`,
                mentions: playerMentions(game)
            }, message);
            const current = game.players[game.turn];
            const remaining = Math.max(0, Math.ceil((TURN_TIME - (Date.now() - game.turnStartedAt)) / 1000));
            return send(sock, chatId, { text: `🔗 *WORD CHAIN STATUS*\n\n🎯 Turn: ${mention(current.jid)}\n🔤 Required: *${(game.requiredLetter || 'ANY').toUpperCase()}*\n⏳ Time: *${remaining}s*\n🔁 Round: *${game.rounds}/${MAX_ROUNDS}*\n\n${scoreText(game)}`, mentions: [current.jid, ...game.players.map(player => player.jid)] }, message);
        }
        if (action === 'leave') {
            const index = game.players.findIndex(player => player.jid === sender);
            if (index < 0) return reply('ℹ️ You are not in this game.');
            const leaving = game.players.splice(index, 1)[0];
            if (!game.players.length) { clearGame(chatId, game); return reply('ℹ️ Game ended because everyone left.'); }
            if (game.phase === 'active' && game.players.length === 1) return finish(sock, chatId, game, `${mention(leaving.jid)} left the game.`, message);
            if (game.phase === 'active' && index < game.turn) game.turn--;
            if (game.phase === 'active' && index === game.turn) {
                game.turn %= game.players.length;
                startTurn(sock, chatId, game);
            }
            return send(sock, chatId, { text: `👋 ${mention(leaving.jid)} left the game.`, mentions: [leaving.jid] }, message);
        }

        if (game.phase === 'lobby') return reply(`⏳ The lobby has not started. Use ${prefix}wc join.`);
        const current = game.players[game.turn];
        if (!current) { clearGame(chatId, game); return reply('❌ The game state was invalid and has been reset.'); }
        if (current.jid !== sender) return send(sock, chatId, { text: `⛔ It is ${mention(current.jid)}'s turn.`, mentions: [current.jid] }, message);

        const word = action;
        if (!validInput(word)) return reply(`❌ Use letters only, from ${MIN_WORD_LENGTH} to ${MAX_WORD_LENGTH} characters.`);
        let reason = null;
        if (!dictionary.has(word)) reason = 'not in the dictionary';
        else if (game.usedWords.has(word)) reason = 'already used';
        else if (game.requiredLetter && !word.startsWith(game.requiredLetter)) reason = `must start with ${game.requiredLetter.toUpperCase()}`;
        if (reason) {
            current.invalid++;
            if (current.invalid >= INVALID_LIMIT) {
                const eliminated = game.players.splice(game.turn, 1)[0];
                if (game.players.length === 1) return finish(sock, chatId, game, `${mention(eliminated.jid)} reached three invalid attempts.`, message);
                game.turn %= game.players.length;
                startTurn(sock, chatId, game);
                return reply(`🚫 ${mention(eliminated.jid)} reached ${INVALID_LIMIT} invalid attempts and was eliminated.`);
            }
            return reply(`❌ *${word.toUpperCase()}* is ${reason}. Invalid attempts: *${current.invalid}/${INVALID_LIMIT}*.`);
        }

        clearTimer(game, 'turnTimer');
        const elapsed = Date.now() - game.turnStartedAt;
        current.invalid = 0;
        current.streak++;
        current.words++;
        const gained = scoreFor(word, elapsed, current.streak);
        current.score += gained;
        game.usedWords.add(word);
        game.requiredLetter = word.at(-1);
        game.rounds++;
        if (game.rounds >= MAX_ROUNDS || !availableContinuation(game, game.requiredLetter)) return finish(sock, chatId, game, `${mention(sender)} completed the final playable round.`, message);
        game.turn = (game.turn + 1) % game.players.length;
        const next = game.players[game.turn];
        await send(sock, chatId, { text: `✅ ${mention(sender)} played *${word.toUpperCase()}* (+${gained} points).\n\n🔤 Next letter: *${game.requiredLetter.toUpperCase()}*\n🎯 ${mention(next.jid)}, your turn.\n⏳ 30 seconds remaining.`, mentions: [sender, next.jid] }, message);
        startTurn(sock, chatId, game);
    }
};

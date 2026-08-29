'use strict';

const theme = {
    botName: process.env.BOT_NAME || 'CODEX AI',
    admin: 'Only group admins can use this command.',
    botAdmin: 'I need to be an admin to do this.',
    owner: 'Only the bot owner can use this command.',
};

function fmt(value) {
    return String(value ?? '');
}

function getStr(key) {
    return theme[key] || '';
}

function listThemes() {
    return ['default'];
}

function getActiveTheme() {
    return 'default';
}

function setActiveTheme() {
    return 'default';
}

module.exports = { theme, fmt, getStr, listThemes, getActiveTheme, setActiveTheme };

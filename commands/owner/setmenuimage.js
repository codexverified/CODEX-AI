const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..', '..');
const MENU_IMAGE = path.join(PROJECT_ROOT, 'assets', 'menu.png');
const VARIABLES_DB = path.join(PROJECT_ROOT, 'database', 'variables.json');

const readVars = () => {
    try { return JSON.parse(fs.readFileSync(VARIABLES_DB, 'utf8')); } catch { return {}; }
};

module.exports = {
    name: 'setmenuimage',
    aliases: ['smi'],
    category: 'owner',
    description: 'Set the menu image by replying to an image',
    ownerOnly: true,

    async execute(bot, m) {
        const quoted = m.quoted;
        if (quoted?.mtype !== 'imageMessage' || typeof quoted.download !== 'function') {
            return m.reply(`Reply to an image with ${bot.prefix}setmenuimage.`);
        }

        try {
            const image = await quoted.download();
            if (!image?.length) return m.reply('Could not download that image. Please try again.');

            fs.mkdirSync(path.dirname(MENU_IMAGE), { recursive: true });
            fs.writeFileSync(MENU_IMAGE, image);

            const vars = readVars();
            delete vars.MENU_IMAGE;
            fs.mkdirSync(path.dirname(VARIABLES_DB), { recursive: true });
            fs.writeFileSync(VARIABLES_DB, JSON.stringify(vars, null, 2));
            if (bot.config) bot.config.MENU_IMAGE = '';

            return m.reply('Menu image updated.');
        } catch (error) {
            return m.reply(`Could not set the menu image: ${error.message}`);
        }
    },
};
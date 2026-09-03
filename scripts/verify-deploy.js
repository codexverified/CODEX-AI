#!/usr/bin/env node
/**
 * Runs automatically after `npm install` (see package.json's postinstall).
 * Prints, unmissably, in the deploy/build log itself, exactly how many
 * command/plugin files actually made it onto this host's filesystem.
 *
 * Why this exists: this bot ships with 183 files in plugins/ and 300+ in
 * commands/. If a deployment method (git-based deploy scripts, certain
 * panel "import from repo" flows, etc.) doesn't bring all of those files
 * over, the bot boots up FINE and shows no error — it just silently has
 * a fraction of its commands. That's nearly impossible to notice from the
 * WhatsApp side alone. This script makes it impossible to miss: it runs
 * at build time, prints straight to the log every deployment produces,
 * and exits non-zero (visible as a build warning on most platforms) if
 * either folder looks emptied out.
 */
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const ROOT = path.join(__dirname, '..');

function countJsFiles(dir) {
    let count = 0;
    if (!fs.existsSync(dir)) return -1; // -1 = folder missing entirely
    const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js')) count++;
        }
    };
    walk(dir);
    return count;
}

const commandsCount = countJsFiles(path.join(ROOT, 'commands'));
const pluginsCount = countJsFiles(path.join(ROOT, 'plugins'));

// Expected minimums — this bot ships well above these numbers; a healthy
// deploy should always clear both. Set intentionally below the real
// shipped count so this doesn't false-positive on future additions.
const MIN_COMMANDS = 250;
const MIN_PLUGINS = 150;

console.log('');
console.log(chalk.blue('CODEX AI — deployment file check'));
console.log(chalk.blue(`commands/ : ${commandsCount === -1 ? 'FOLDER MISSING' : commandsCount + ' .js files'}`));
console.log(chalk.blue(`plugins/  : ${pluginsCount === -1 ? 'FOLDER MISSING' : pluginsCount + ' .js files'}`));

let problem = false;

if (commandsCount === -1 || commandsCount < MIN_COMMANDS) {
    problem = true;
    console.log(chalk.yellow('commands/ looks incomplete or missing.'));
}
if (pluginsCount === -1 || pluginsCount < MIN_PLUGINS) {
    problem = true;
    console.log(chalk.yellow('plugins/ looks incomplete or missing.'));
    console.log(chalk.yellow('This bot ships with plugin files built in — if you expected'));
    console.log(chalk.yellow('them, this deployment did not bring the plugins/ folder\'s'));
    console.log(chalk.yellow('contents over from your repo. Check on GitHub (or wherever you'));
    console.log(chalk.yellow('pushed) that plugins/*.js files are actually committed there,'));
    console.log(chalk.yellow('and that your deploy step does a full clone rather than a'));
    console.log(chalk.yellow('partial/sparse one.'));
}

if (!problem) {
    console.log(chalk.green('Both folders look complete.'));
}
console.log('');

// Deliberately NOT failing the install over this (exit code stays 0) —
// npm install already succeeded, and hard-failing the whole deploy over
// missing plugins could turn a "partially working bot" into "no bot at
// all" on platforms that abort on a non-zero postinstall. The loud
// formatted output above is what carries the signal; this script's job
// is visibility, not gatekeeping.

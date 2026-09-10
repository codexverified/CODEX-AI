#!/usr/bin/env node
/**
 * Runs automatically after `npm install`/`pnpm install` (see package.json's
 * postinstall). Prints, unmissably, in the deploy/build log itself, exactly
 * how many command files actually made it onto this host's filesystem, and
 * whether they can actually be require()'d.
 *
 * Why this exists: this bot ships with 300+ files in commands/. If a
 * deployment method (git-based deploy scripts, certain panel "import from
 * repo" flows, etc.) doesn't bring all of those files over, the bot boots up
 * FINE and shows no error — it just silently has a fraction of its
 * commands. That's nearly impossible to notice from the WhatsApp side
 * alone. This script makes it impossible to miss.
 *
 * Two checks:
 *   1. File count — is commands/ anywhere near its expected size.
 *   2. Import check — does every command file actually require() without
 *      throwing (a syntax error or a missing transitive dependency in one
 *      file used to fail completely silently: the loader in
 *      lib/commandHandler.js catches per-file require() errors and just
 *      skips that command, so the bot boots "fine" with commands quietly
 *      missing from the menu).
 *
 * Exit code:
 *   Default (plain `npm install` / `pnpm install`, no env var set): this
 *   script ALWAYS exits 0, even when it finds a problem. Hard-failing the
 *   whole deploy here would turn a "partially working bot" into "no bot at
 *   all" on platforms that abort the entire deploy on a non-zero
 *   postinstall — the loud formatted output is what carries the signal in
 *   that mode, not the exit code.
 *
 *   Set STRICT_DEPLOY_CHECK=1 in the environment (CI, a pre-deploy check
 *   step, or `STRICT_DEPLOY_CHECK=1 node scripts/verify-deploy.js` run by
 *   hand) to make this script exit 1 on a real problem, so it can be used
 *   as an actual deploy gate on hosts/CI where that's wanted.
 */
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const ROOT = path.join(__dirname, '..');
const STRICT = process.env.STRICT_DEPLOY_CHECK === '1';

function listJsFiles(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js')) out.push(full);
        }
    };
    walk(dir);
    return out;
}

const commandFiles = listJsFiles(path.join(ROOT, 'commands'));
const commandsCount = commandFiles.length;

// Expected minimum — this bot ships well above this number; a healthy
// deploy should always clear it. Keep this below the real shipped count so
// additions do not create false positives.
const MIN_COMMANDS = 250;

console.log('');
console.log(chalk.blue('CODEX AI — deployment file check'));
console.log(chalk.blue(`commands/ : ${fs.existsSync(path.join(ROOT, 'commands')) ? commandsCount + ' .js files' : 'FOLDER MISSING'}`));

let problem = false;

if (!fs.existsSync(path.join(ROOT, 'commands')) || commandsCount < MIN_COMMANDS) {
    problem = true;
    console.log(chalk.yellow('commands/ looks incomplete or missing.'));
}

// ── Import check: does every command file actually require() cleanly? ────
// This is intentionally lightweight (a plain require(), not executing any
// command). It still catches the two most common "silently missing
// command" causes: a syntax error introduced by a bad merge/partial file
// transfer, and a require() of a dependency that isn't installed on this
// host (e.g. a deploy that skipped `npm install` for a subset of files).
const importFailures = [];
for (const file of commandFiles) {
    try {
        delete require.cache[require.resolve(file)];
        require(file);
    } catch (err) {
        importFailures.push({ file: path.relative(ROOT, file), error: err?.message || String(err) });
    }
}

if (importFailures.length > 0) {
    problem = true;
    console.log(chalk.yellow(`${importFailures.length} command file(s) failed to import:`));
    for (const f of importFailures.slice(0, 20)) {
        console.log(chalk.yellow(`  - ${f.file}: ${f.error}`));
    }
    if (importFailures.length > 20) {
        console.log(chalk.yellow(`  ...and ${importFailures.length - 20} more`));
    }
} else {
    console.log(chalk.green(`All ${commandsCount} command files imported cleanly.`));
}

if (!problem) {
    console.log(chalk.green('Command folder looks complete.'));
}
console.log(STRICT
    ? chalk.blue('STRICT_DEPLOY_CHECK=1 — this run WILL exit non-zero on a problem.')
    : chalk.blue('Set STRICT_DEPLOY_CHECK=1 to make this check gate the deploy (exit 1 on a problem).'));
console.log('');

if (problem && STRICT) {
    process.exitCode = 1;
}

import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js';
// 
// ANTI-BAN / ANTI-SPAM LAYER  COMMENTED OUT ON REQUEST (temporary).
// The bundled antiban layer (lib/antiban.cjs) wraps every socket and
// rate-limits/warm-ups sends, printing "[baileys-antiban]" spam to the
// console and throwing "[baileys-antiban] Message blocked: ..." once the
// daily warm-up limit is hit. To re-enable, uncomment the three lines
// below (and the wrap block in makeWASocket).
//
// import { createRequire } from 'node:module';
// // Load the bundled antiban layer via createRequire so no CJS file is part
// // of the ESM module graph (keeps require(esm) namespace population working
// // on Node versions where it is still experimental)
// const nodeRequire = createRequire(import.meta.url);
// const { wrapSocket } = nodeRequire('../antiban.cjs');
// 
import { makeCommunitiesSocket } from './communities.js';
import { makeInteropSocket } from './interop.js';
import { makePrivacySocket } from './privacy.js';
import { makeRegistrationSocket } from './registration.js';
import { makeManagedAccountSocket } from './managed-account.js';
import { makeGraphQLSocket } from './graphql.js';

// export the last socket layer
const makeWASocket = (config) => {
    // CODEX branding banner. Printed once per process.
    if (!globalThis.__codexBannerShown) {
        globalThis.__codexBannerShown = true;
        const yellow = '\x1b[93m';
        const blue = '\x1b[94m';
        const reset = '\x1b[0m';
        const width = 41;
        const center = (text) => {
            const pad = Math.max(0, Math.floor((width - text.length) / 2));
            return ' '.repeat(pad) + text;
        };
        console.log(
            `\n${yellow}${center('CODEX TECHNOLOGY')}${reset}\n` +
            `${blue}${center('@codexverified/baileys')}${reset}\n` +
            `${yellow}${center('premium baileys built by codex')}${reset}\n`
        );
    }
    const userExplicitSyncFlag = typeof config?.syncFullHistory === 'boolean';
    const initialFullSyncDone = !!config?.auth?.creds?.initialFullSyncDone;
    const effectiveSyncFullHistory = userExplicitSyncFlag ? config.syncFullHistory : !initialFullSyncDone;
    const newConfig = {
        ...DEFAULT_CONNECTION_CONFIG,
        ...config,
        syncFullHistory: effectiveSyncFullHistory
    };
    newConfig.logger?.debug?.(
        { initialFullSyncDone, effectiveSyncFullHistory, userExplicitSyncFlag },
        'computed syncFullHistory policy'
    );

    const baseSock = makeCommunitiesSocket(newConfig);
    const interopSock = makeInteropSocket(baseSock);
    const privacySock = makePrivacySocket(interopSock);
    const registrationSock = makeRegistrationSocket(privacySock);
    const managedSock = makeManagedAccountSocket(registrationSock);
    const sock = makeGraphQLSocket(managedSock);

    // 
    // ANTI-BAN / ANTI-SPAM LAYER  COMMENTED OUT ON REQUEST (temporary).
    // Previously:
    //   // Auto-wrap with antiban if available (config.antiban = false to opt-out)
    //   if (wrapSocket && config?.antiban !== false) {
    //       const antibanConfig = config?.antiban || 'aggressive';
    //       return wrapSocket(sock, antibanConfig);
    //   }
    // The socket is returned unwrapped  no rate limiting, no warm-up
    // blocking, and no "[baileys-antiban]" console output.
    // 
    return sock;
};
export default makeWASocket;

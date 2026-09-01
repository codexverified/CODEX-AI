import makeWASocket from './Socket/index.js';
export { normalizeStatusJidList } from './Socket/messages-send.js';
export * from '../WAProto/index.js';
export * from './Utils/index.js';
export * from './Types/index.js';
export * from './Defaults/index.js';
export * from './Store/index.js';
export * from './WABinary/index.js';
export * from './WAM/index.js';
export * from './WAUSync/index.js';
// Re-export the bundled antiban layer without putting any CJS file in the
// ESM module graph (mixing `export *` from a .cjs broke require(esm)
// namespace population on Node versions where it is still experimental)
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
const antiban = nodeRequire('./antiban.cjs');
export const { AntiBan, ContactGraphWarmer, ContentVariator, FileStateAdapter, HealthMonitor, JidCanonicalizer, LidFirstResolver, LidResolver, MAC_ERROR_CODES, MessageQueue, MessageRetryReason, PRESETS, PostReconnectThrottle, PresenceChoreographer, RateLimiter, ReplyRatioGuard, RetryReasonTracker, Scheduler, SessionHealthMonitor, StateManager, TimelockGuard, WarmUp, WebhookAlerts, applyFingerprint, applyGroupMultiplier, buildContentSignature, classifyDisconnect, createLidFirstResolver, credsSnapshot, generateFingerprint, getCircadianMultiplier, getRetryReasonDescription, isBroadcast, isGroup, isMacError, isNewsletter, messageRecovery, parseRetryReason, proxyRotator, readReceiptVariance, resolveConfig, shouldUseGroupProfile, wrapSocket, wrapWithSessionStability } = antiban;
export { makeWASocket };
export default makeWASocket;

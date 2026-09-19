'use strict';

// Shared "3m" / "2h" / "1d" style duration parsing for commands like
// .listonline / .listoffline. MAX_DURATION_MS caps how far back either
// command is allowed to look — presence data is in-memory only (see
// lib/presenceStore.js) and only ever covers this process's own uptime,
// so a window longer than a day is never meaningfully more accurate, just
// slower and more confusing to read.
const MAX_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Returns milliseconds, or null if the input doesn't look like a duration
// at all (caller decides how to report that vs. exceeding MAX_DURATION_MS).
function parseDuration(raw) {
    const text = String(raw || '').trim().toLowerCase();
    const match = text.match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)?$/);
    if (!match) return null;
    const amount = parseInt(match[1], 10);
    if (!amount || amount <= 0) return null;
    const unit = (match[2] || 'm')[0]; // first letter is enough to tell s/m/h/d apart
    const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
    return amount * (multipliers[unit] || multipliers.m);
}

// Compact single-unit display — "45s", "3m", "2h", "1d" — for echoing the
// requested/elapsed time back in a reply.
function formatDuration(ms) {
    if (ms < 60 * 1000) return `${Math.round(ms / 1000)}s`;
    if (ms < 60 * 60 * 1000) return `${Math.round(ms / (60 * 1000))}m`;
    if (ms < 24 * 60 * 60 * 1000) return `${Math.round(ms / (60 * 60 * 1000))}h`;
    return `${Math.round(ms / (24 * 60 * 60 * 1000))}d`;
}

module.exports = { parseDuration, formatDuration, MAX_DURATION_MS };

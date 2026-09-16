'use strict';

// Shared helpers for group join-request handling, used by
// commands/group/approve.js, commands/group/reject.js and
// commands/group/viewrequest.js so all three resolve LIDs to phone
// numbers the same way.
//
// Why this exists: groupRequestParticipantsList() can return a request's
// jid as either a real phone-number jid (xxxx@s.whatsapp.net) or a
// privacy "LID" (xxxx@lid) that has nothing to do with the requester's
// phone number. Admins naturally think and type in phone numbers, and a
// raw @lid dumped into chat is an unreadable, untappable string — so
// every place that shows or matches a pending request needs to resolve
// it back to the real phone number first, using Baileys' own lid<->PN
// mapping store (the same one lib/getTarget.js uses for tagging).

function cleanJid(jid) {
  return String(jid || '').replace(/:[0-9]+@/, '@');
}

function digitsOf(jid) {
  return String(jid || '').split('@')[0].replace(/\D/g, '');
}

// Resolve a single request jid down to its real phone-number jid where
// possible. Falls back to the original jid (cleaned) if it's already a
// phone jid, or if no mapping is known yet (e.g. the requester has never
// messaged the bot so Baileys hasn't learned their LID<->PN pairing).
async function resolvePhoneJid(bot, jid) {
  const clean = cleanJid(jid);
  if (clean.endsWith('@lid')) {
    try {
      const lidMap = bot?.sock?.signalRepository?.lidMapping;
      if (lidMap?.getPNForLID) {
        const pn = await lidMap.getPNForLID(clean);
        if (pn) return cleanJid(pn);
      }
    } catch (_) {}
  }
  return clean;
}

// Given the raw array from groupRequestParticipantsList(), return each
// request enriched with:
//   rawJid   - the exact jid to pass back into groupRequestParticipantsUpdate
//   phoneJid - the best-known phone-number jid (for @mention + display)
//   digits   - phone digits of phoneJid, used to match a typed number
async function enrichRequests(bot, requests) {
  const out = [];
  for (const req of requests) {
    const rawJid = cleanJid(req.jid);
    const phoneJid = await resolvePhoneJid(bot, rawJid);
    out.push({ ...req, rawJid, phoneJid, digits: digitsOf(phoneJid) });
  }
  return out;
}

// Find the pending request matching a phone number an admin typed (any
// formatting - spaces, +, leading 00, etc. are stripped). Matches the
// resolved phone digits first; falls back to the raw jid's digits so a
// request that couldn't be resolved to a phone number can still be
// targeted by pasting the number shown in .viewrequest as a last resort.
function findRequestByNumber(enriched, numberInput) {
  const target = String(numberInput || '').replace(/\D/g, '');
  if (!target) return null;
  return (
    enriched.find((r) => r.digits === target) ||
    enriched.find((r) => digitsOf(r.rawJid) === target) ||
    null
  );
}

module.exports = { cleanJid, digitsOf, resolvePhoneJid, enrichRequests, findRequestByNumber };
    

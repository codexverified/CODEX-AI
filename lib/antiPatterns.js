/**
 * Shared detection pattern libraries for the anti-systems that work off
 * regex matching against message text: Anti-Scam, Anti-Beg, and the
 * text-based half of Anti-Game (the emoji-based half still lives in
 * lib/antiSystems.js since it isn't a text regex).
 *
 * Kept in one place so lib/antiSystems.js (real-time enforcement) and any
 * standalone "test this text" command (e.g. .scamcheck) always agree on
 * exactly the same pattern set — no risk of the two drifting apart.
 */

// ── Anti-Scam ────────────────────────────────────────────────────────────
// Each entry: { label, patterns: [RegExp] }
const SCAM_CATEGORIES = [
    {
        label: 'Investment Fraud',
        patterns: [
            /double\s+your\s+(money|investment|cash|crypto)/i,
            /\d+[x×%]\s*(profit|return|roi|gains?)\s*(guaranteed|daily|weekly|monthly)?/i,
            /guaranteed\s+(returns?|profits?|income|investment)/i,
            /invest\s+(and|to)\s+(earn|make|get)\s+\d/i,
            /minimum\s+invest(ment)?\s+of?\s+[a-z]*\s*\d/i,
            /withdrawal\s+of\s+[a-z]*\s*\d+\s*(daily|weekly|per day)/i,
            /ponzi|pyramid\s+scheme/i,
            /send\s+(btc|eth|usdt|crypto|coins?|money)\s+(to|and\s+get)/i,
        ]
    },
    {
        label: 'Fake Giveaway / Prize',
        patterns: [
            /you\s+(have|'ve|ve|hav)\s+(won|win|been\s+selected)/i,
            /congratulations.{0,40}(won|prize|winner|selected)/i,
            /claim\s+your\s+(prize|reward|gift|winnings?|free\s+iphone|cash)/i,
            /free\s+(iphone|airpods|laptop|car|cash|money|gift\s+card)/i,
            /click\s+(here|the\s+link)\s+to\s+(claim|collect|receive|win)/i,
            /\b(giveaway|give\s*away)\b.{0,30}(click|link|dm|text|whatsapp)/i,
            /send\s+(your\s+)?(details|info|number|address)\s+to\s+claim/i,
        ]
    },
    {
        label: 'Phishing / Credential Theft',
        patterns: [
            /verify\s+your\s+(account|whatsapp|bank|mpesa|paypal|number)/i,
            /your\s+account\s+(will\s+be\s+)?(suspended|closed|disabled|banned)/i,
            /enter\s+your\s+(pin|password|otp|code|details)/i,
            /otp\s+(code\s+)?(for\s+verification|expired|invalid)/i,
            /bank\s+(details?|account\s+number)\s+(required|needed|send)/i,
            /log\s*in\s+to\s+(verify|confirm|update)\s+your/i,
        ]
    },
    {
        label: 'Loan / Money Mule Scam',
        patterns: [
            /instant\s+loan.{0,30}(no\s+(credit|collateral|security)|apply\s+now)/i,
            /quick\s+(loan|cash)\s+(no\s+documents?|apply\s+now|within\s+\d+\s*(mins?|hours?))/i,
            /transfer\s+(money|funds?)\s+(for\s+me|on\s+my\s+behalf|to\s+this\s+account)/i,
            /i\s+will\s+pay\s+you\s+\d+(%|percent)\s+(commission|for\s+transferring)/i,
            /help\s+me\s+(transfer|move|send)\s+(money|funds?|cash)/i,
        ]
    },
    {
        label: 'Crypto / Forex Scam',
        patterns: [
            /forex\s+(trading\s+)?(signal|mentor|expert|guaranteed|profit)/i,
            /crypto\s+(trading\s+)?(signal|mentor|expert|guaranteed|roi)/i,
            /bitcoin\s+(flip|doubler|multiplier|generator)/i,
            /(recover\s+lost\s+crypto|crypto\s+recovery\s+expert)/i,
            /trade\s+(with\s+)?(me|us|our\s+(team|expert))\s+(and\s+earn|for\s+guaranteed)/i,
            /\$\d+\s+(per\s+day|daily)\s+(trading|forex|crypto|signal)/i,
        ]
    },
    {
        label: 'Fake Job Offer',
        patterns: [
            /earn\s+\$?\d+(,\d+)?\s+(per\s+(day|week|month)|daily|weekly)\s+(from\s+home|online|working)/i,
            /work\s+from\s+home.{0,40}earn\s+\$?\d+/i,
            /part[\s-]time\s+(job|work|earn).{0,30}(no\s+experience|anyone\s+can)/i,
            /whatsapp\s+(job|task|earn)\s+(daily|weekly|\$\d+)/i,
            /typing\s+job.{0,30}earn\s+\$?\d+/i,
            /data\s+entry.{0,40}no\s+(experience|skill|qualification)/i,
        ]
    },
];

function detectScam(text) {
    const t = String(text || '');
    for (const cat of SCAM_CATEGORIES) {
        for (const pattern of cat.patterns) {
            if (pattern.test(t)) return cat.label;
        }
    }
    return null;
}

// ── Anti-Beg ─────────────────────────────────────────────────────────────
// Broad, plain-language begging/solicitation patterns — direct pleas,
// money/cash asks, data/airtime asks, hardship framing, and the generic
// closing lines that show up across begging chain-messages.
const BEG_PATTERNS = [
    // Direct pleas for help/assistance
    /\bplease\s+(help|assist|send|give|support)\s+me\b/i,
    /\bi\s+beg\s+(you|of\s+you|una)?\b/i,
    /\bplease\s+i\s+(need|want|beg)\b/i,
    /\bkindly\s+(help|assist|send|give)\s+me\b/i,
    /\b(help|assist)\s+me\s+(please|financially|out)\b/i,
    /\bcan\s+(you|anyone|somebody)\s+(help|assist|send|give)\s+me\b/i,
    /\bwho\s+(can|will)\s+help\s+me\b/i,
    /\bplease\s+lend\s+me\b/i,
    /\bplease\s+i\s+need\s+(your\s+)?help\b/i,

    // Money / cash asks
    /\bi\s+need\s+(money|cash|funds?)\b/i,
    /\bsend\s+me\s+(some\s+)?(money|cash|funds?)\b/i,
    /\bgive\s+me\s+(some\s+)?(money|cash)\b/i,
    /\bsupport\s+me\s+financially\b/i,
    /\bdonate\s+(to\s+me|money|whatever)?\b/i,
    /\b(need|want)\s+financial\s+(help|support|assistance)\b/i,
    /\bsend\s+whatever\s+you\s+(can|have)\b/i,

    // Data / airtime asks
    /\bsend\s+me\s+(data|airtime|credit|recharge)\b/i,
    /\bgift\s+me\s+(data|airtime)\b/i,
    /\bi\s+need\s+(data|airtime)\s*(please|urgently)?\b/i,
    /\b(please\s+)?buy\s+me\s+(data|airtime)\b/i,
    /\btop\s+up\s+my\s+(line|number|data)\b/i,

    // Hardship framing used to solicit sympathy/money
    /\bi\s*('?m|am)\s+(broke|stranded|hungry|starving)\b/i,
    /\bno\s+money\s+for\s+(food|transport|feeding|fees)\b/i,
    /\bi\s+(don'?t\s+have|have\s+no)\s+(money|food|data)\b/i,

    // Generic closing lines typical of begging/chain messages
    /\bgod\s+bless\s+you\b.{0,20}\b(help|send|give)\b/i,
    /\bwhoever\s+(helps|assists)\s+me\b/i,
    /\bi\s+will\s+appreciate\s+(any|whatever)\s+(help|amount)\b/i,
];

function detectBeg(text) {
    const t = String(text || '');
    for (const pattern of BEG_PATTERNS) {
        if (pattern.test(t)) return true;
    }
    return false;
}

// ── Anti-Game (text half) ───────────────────────────────────────────────
// The emoji-only half (🎲🎯🎳⚽🎱🎰🧩) lives in antiSystems.js already;
// this covers game NAMES/INVITES typed as plain text.
const GAME_TEXT_PATTERNS = [
    /\bttt\b/i,
    /\btic[\s-]?tac[\s-]?toe\b/i,
    /\btruth\s+or\s+dare\b/i,
    /\brps\b/i,
    /\brock[\s,-]*paper[\s,-]*scissors\b/i,
    /\b(who'?s\s+)?(up\s+for\s+)?a\s+game\b/i,
    /\blet'?s\s+play\b/i,
    /\btrivia\s*(night|time|question)?\b/i,
    /\bquiz\s*(night|time)?\b/i,
    /\bhangman\b/i,
    /\bwordle\b/i,
    /\buno\b/i,
    /\bludo\b/i,
    /\bbingo\b/i,
    /\bcharades\b/i,
    /\b20\s+questions\b/i,
    /\bwould\s+you\s+rather\b/i,
    /\bnever\s+have\s+i\s+ever\b/i,
    /\bconnect\s+(four|4)\b/i,
    /\bguess\s+the\s+(word|number|song|movie)\b/i,
    /\bpoll\s*[:\-]/i,
    /\bvote\s+(now|below|for)\b/i,
    /\bscrabble\b/i,
    /\bmonopoly\b/i,
    /\bcheckers\b/i,
    /\bchess\s+(anyone|match|game)\b/i,
];

function detectGameText(text) {
    const t = String(text || '');
    for (const pattern of GAME_TEXT_PATTERNS) {
        if (pattern.test(t)) return true;
    }
    return false;
}

module.exports = {
    SCAM_CATEGORIES, detectScam,
    BEG_PATTERNS, detectBeg,
    GAME_TEXT_PATTERNS, detectGameText,
};
  

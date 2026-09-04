'use strict';
 
const axios   = require('axios');
const { fmt, getStr } = require('../../lib/theme');
 
function fmtNum(n) {
    if (n === undefined || n === null) return 'N/A';
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
    if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
    return String(n);
}
 
function barOf(value, max, len = 12) {
    if (!max) return 'â–±'.repeat(len);
    const filled = Math.round((value / max) * len);
    return 'â–°'.repeat(Math.min(filled, len)) + 'â–±'.repeat(Math.max(len - filled, 0));
}
 
module.exports = {
    commands:    ['tiktokstalk', 'ttstalk', 'tksearch', 'ttuser', 'tikstalk'],
    category: 'group',
    description: 'Stalk a TikTok profile â€” followers, videos, likes, bio and more',
    usage:       '.tiktokstalk <username>',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, { jid, contextInfo, reply }) => {
        let username = args[0]?.replace(/^@/, '').trim();
        if (!username) {
            return reply(fmt('ðŸŽµ Please provide a TikTok username.\nExample: `.ttstalk charlidamelio`'));
        }
 
        await sock.sendPresenceUpdate('composing', jid);
        await sock.sendMessage(jid, { text: fmt(`â³ Fetching TikTok profile for @${username}â€¦`), contextInfo }, { quoted: message });
 
        let userData = null;
        const ENDPOINTS = [
            {
                name: 'TikWM',
                fetch: async () => {
                    const { data } = await axios.get(
                        `https://tikwm.com/api/user/info?unique_id=${encodeURIComponent(username)}`,
                        { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
                    );
                    if (data?.code !== 0) throw new Error(data?.msg || 'TikWM error');
                    return data.data?.user;
                }
            },
        ];
 
        for (const ep of ENDPOINTS) {
            try {
                userData = await ep.fetch();
                if (userData) { console.log(`[TikTokStalk] Success via ${ep.name}`); break; }
            } catch (e) {
                console.warn(`[TikTokStalk] ${ep.name}: ${e.message}`);
            }
        }
 
        if (!userData) {
            return reply(fmt(`âŒ TikTok user *@${username}* not found or profile is private.`));
        }
 
        const u = userData;
 
        // â”€â”€ Derived stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const followers = u.fans  ?? u.followerCount  ?? 0;
        const following = u.following ?? u.followingCount ?? 0;
        const likes     = u.heart ?? u.heartCount ?? u.digg_count ?? 0;
        const videos    = u.video ?? u.videoCount ?? 0;
        const friends   = u.friend ?? u.friendCount ?? 0;
        const maxVal    = Math.max(followers, likes, 1);
 
        // â”€â”€ Badge detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const badges = [];
        if (u.verified)              badges.push('âœ… Verified');
        if (u.privateAccount)        badges.push('ðŸ”’ Private account');
        if (u.isUnderAge18)          badges.push('ðŸ”ž Under 18');
        if (u.openFavorite)          badges.push('â­ Favorites public');
        if (u.commentSetting === 1)  badges.push('ðŸ’¬ Comments: Friends only');
        if (u.commentSetting === 2)  badges.push('ðŸ’¬ Comments: Off');
        if (!u.verified && followers > 1_000_000) badges.push('ðŸš€ 1M+ unverified mega creator');
 
        // â”€â”€ Region â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const region = u.region || u.country || null;
 
        const lines = [];
        lines.push(`â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”`);
        lines.push(`   ðŸŽµ *TikTok Profile Report*`);
        lines.push(`â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜`);
        lines.push('');
 
        lines.push(`*ðŸ†” Identity*`);
        lines.push(`â€¢ *Username:* @${u.uniqueId || username}`);
        if (u.nickname)  lines.push(`â€¢ *Display Name:* ${u.nickname}`);
        if (u.id)        lines.push(`â€¢ *User ID:* \`${u.id}\``);
        if (region)      lines.push(`â€¢ *Region:* ${region}`);
        if (u.language)  lines.push(`â€¢ *Language:* ${u.language}`);
        lines.push('');
 
        if (u.signature) {
            lines.push(`*ðŸ“ Bio*`);
            lines.push(u.signature.slice(0, 300));
            lines.push('');
        }
 
        lines.push(`*ðŸ“Š Stats*`);
        lines.push(`â€¢ *Followers:* ${fmtNum(followers)}  ${barOf(followers, maxVal)}`);
        lines.push(`â€¢ *Following:* ${fmtNum(following)}`);
        if (friends)    lines.push(`â€¢ *Friends:*   ${fmtNum(friends)}`);
        lines.push(`â€¢ *Likes (total received):* â¤ï¸ ${fmtNum(likes)}  ${barOf(likes, maxVal)}`);
        lines.push(`â€¢ *Videos posted:* ðŸŽ¬ ${fmtNum(videos)}`);
        if (followers && videos) {
            const ratio = Math.round(likes / videos);
            lines.push(`â€¢ *Avg likes/video:* ~${fmtNum(ratio)}`);
        }
        lines.push('');
 
        // â”€â”€ Privacy & Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        lines.push(`*âš™ï¸ Account Settings*`);
        lines.push(`â€¢ *Private:* ${u.privateAccount ? 'ðŸ”’ Yes' : 'ðŸ”“ No'}`);
        lines.push(`â€¢ *Duet:* ${u.duetSetting === 0 ? 'âœ… Open' : u.duetSetting === 1 ? 'ðŸ‘¥ Friends' : 'âŒ Off'}`);
        lines.push(`â€¢ *Stitch:* ${u.stitchSetting === 0 ? 'âœ… Open' : u.stitchSetting === 1 ? 'ðŸ‘¥ Friends' : 'âŒ Off'}`);
        lines.push(`â€¢ *Comment:* ${u.commentSetting === 0 ? 'âœ… Everyone' : u.commentSetting === 1 ? 'ðŸ‘¥ Friends' : 'âŒ Off'}`);
        lines.push('');
 
        if (badges.length) {
            lines.push(`*ðŸ·ï¸ Badges*`);
            badges.forEach(b => lines.push(`â€¢ ${b}`));
            lines.push('');
        }
 
        lines.push(`â€¢ *Profile:* https://www.tiktok.com/@${u.uniqueId || username}`);
        lines.push(`_Powered by ${getStr('botName') || 'CODEX AI'} Â· TikWM API_`);
 
        const avatarUrl = u.avatarLarger || u.avatarThumb || u.avatar || null;
 
        try {
            if (avatarUrl) {
                await sock.sendMessage(jid, {
                    image:      { url: avatarUrl },
                    caption:    fmt(lines.join('\n')),
                    contextInfo,
                }, { quoted: message });
            } else {
                await reply(fmt(lines.join('\n')));
            }
        } catch {
            await reply(fmt(lines.join('\n')));
        }
 
        await sock.sendPresenceUpdate('paused', jid);
    }
};

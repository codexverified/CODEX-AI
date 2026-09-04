const config = require('../../config');
const followedThisSession = new Set();
 
module.exports = {
    commands: ['newsletter', 'followchannel', 'unfollowchannel', 'channelinfo', 'mutechannel', 'unmutechannel', 'channelsubs'],
    description: 'Newsletter/channel follow management',
    permission: 'owner',
    group: false,
    private: true,
 
    async run(sock, message, args, ctx) {
        const { reply, prefix } = ctx;
        const cmd = (message.key?.id && ctx.text === undefined)
            ? '' : (args[0] || '').toLowerCase();
        const command = ctx.text?.trim().split(/\s+/)[0]?.toLowerCase().replace(prefix, '') || '';
 
        const jid = args[0]?.trim();
 
        if (command === 'newsletter') {
            const status = config.AUTO_FOLLOW_NEWSLETTER ? 'âœ… ON' : 'âŒ OFF';
            const configured = Array.isArray(config.NEWSLETTER_JID)
                ? config.NEWSLETTER_JID.map(j => `â€¢ ${j}`).join('\n')
                : `â€¢ ${config.NEWSLETTER_JID}`;
            const globalFollowed = global._followedNewsletters
                ? [...global._followedNewsletters].map(j => `â€¢ ${j}`).join('\n')
                : 'None yet.';
            return reply(
                `ðŸ“° *Newsletter Autofollow*\n\n` +
                `Status: ${status}\n\n` +
                `*Configured JIDs (followed on startup):*\n${configured}\n\n` +
                `*Followed this session:*\n${globalFollowed}\n\n` +
                `*Commands:*\n` +
                `â€¢ \`${prefix}followchannel <jid>\` â€” follow a newsletter\n` +
                `â€¢ \`${prefix}unfollowchannel <jid>\` â€” unfollow\n` +
                `â€¢ \`${prefix}channelinfo <jid_or_link>\` â€” get info`
            );
        }
 
        if (command === 'channelinfo') {
            if (!jid) return reply(`Usage: ${prefix}channelinfo <newsletter_jid_or_invite_link>`);
            try {
                let key = jid;
                let type = 'jid';
                if (jid.includes('whatsapp.com/channel/')) {
                    const match = jid.match(/channel\/([A-Za-z0-9_-]+)/);
                    if (!match) return reply('Invalid invite link.');
                    key  = match[1];
                    type = 'invite';
                }
                const meta = await sock.newsletterMetadata(type, key);
                if (!meta) return reply('Could not fetch newsletter info.');
                return reply(
                    `ðŸ“° *Newsletter Info*\n\n` +
                    `*Name:* ${meta.name || 'N/A'}\n` +
                    `*JID:* ${meta.id}\n` +
                    `*Subscribers:* ${meta.subscribers ?? 'N/A'}\n` +
                    `*Description:* ${meta.description || 'N/A'}\n` +
                    `*Verification:* ${meta.verification || 'none'}`
                );
            } catch (err) {
                return reply(`Failed to fetch info: ${err.message}`);
            }
        }
 
        if (command === 'channelsubs') {
            if (!jid || !jid.endsWith('@newsletter')) return reply(`Usage: ${prefix}channelsubs <newsletter_jid>`);
            if (typeof sock.newsletterSubscribers !== 'function') {
                return reply('newsletterSubscribers is not available in this Baileys build.');
            }
            try {
                const subscribers = await sock.newsletterSubscribers(jid);
                return reply(`Subscribers: ${Array.isArray(subscribers) ? subscribers.length : JSON.stringify(subscribers).slice(0, 1000)}`);
            } catch (err) {
                return reply(`Failed to fetch subscribers: ${err.message}`);
            }
        }

        if (command === 'followchannel') {
            if (!jid) return reply(`Usage: ${prefix}followchannel <newsletter_jid>\n\nJID format: 1234567890@newsletter`);
            if (!jid.endsWith('@newsletter')) return reply('JID must end with @newsletter');
            try {
                await sock.newsletterFollow(jid);
                followedThisSession.add(jid);
                return reply(`âœ… Successfully followed newsletter:\n${jid}`);
            } catch (err) {
                return reply(`Failed to follow: ${err.message}`);
            }
        }
 
        if (command === 'unfollowchannel') {
            if (!jid) return reply(`Usage: ${prefix}unfollowchannel <newsletter_jid>`);
            if (!jid.endsWith('@newsletter')) return reply('JID must end with @newsletter');
            try {
                await sock.newsletterUnfollow(jid);
                followedThisSession.delete(jid);
                return reply(`âœ… Successfully unfollowed newsletter:\n${jid}`);
            } catch (err) {
                return reply(`Failed to unfollow: ${err.message}`);
            }
        }
 
        if (command === 'mutechannel') {
            if (!jid) return reply(`Usage: ${prefix}mutechannel <newsletter_jid>`);
            if (!jid.endsWith('@newsletter')) return reply('JID must end with @newsletter');
            try {
                await sock.newsletterMute(jid);
                return reply(`ðŸ”‡ Muted newsletter:\n${jid}`);
            } catch (err) {
                return reply(`Failed to mute: ${err.message}`);
            }
        }
 
        if (command === 'unmutechannel') {
            if (!jid) return reply(`Usage: ${prefix}unmutechannel <newsletter_jid>`);
            if (!jid.endsWith('@newsletter')) return reply('JID must end with @newsletter');
            try {
                await sock.newsletterUnmute(jid);
                return reply(`ðŸ”” Unmuted newsletter:\n${jid}`);
            } catch (err) {
                return reply(`Failed to unmute: ${err.message}`);
            }
        }
    }
};
 
module.exports.followedThisSession = followedThisSession;

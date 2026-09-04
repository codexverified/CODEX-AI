'use strict';
const axios = require('axios');
 
module.exports = {
    commands:    ['whois', 'domain', 'domaininfo'],
    category: 'search',
    description: 'WHOIS lookup for a domain',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        const domain = (args[0] || '').replace(/https?:\/\//g, '').replace(/\//g, '').trim();
        if (!domain || !domain.includes('.')) {
            return sock.sendMessage(sender, {
                text: 'ðŸŒ Please provide a domain name.\nExample: .whois google.com',
                contextInfo
            }, { quoted: message });
        }
        await sock.sendMessage(sender, { text: 'â³ Looking up domain...', contextInfo }, { quoted: message });
        try {
            const { data } = await axios.get(`https://rdap.org/domain/${domain}`, { timeout: 15000 });
            const name     = data.ldhName || domain;
            const status   = (data.status || []).join(', ') || 'N/A';
            const events   = {};
            (data.events || []).forEach(e => { events[e.eventAction] = e.eventDate?.slice(0, 10); });
            const ns       = (data.nameservers || []).map(n => n.ldhName).join(', ') || 'N/A';
            await sock.sendMessage(sender, {
                text:
`ðŸŒ *WHOIS: ${name}*
 
ðŸ“‹ *Status:*      ${status}
ðŸ“… *Registered:*  ${events.registration || 'N/A'}
ðŸ”„ *Updated:*     ${events['last changed'] || events.last_update || 'N/A'}
â° *Expires:*     ${events.expiration || 'N/A'}
ðŸ–¥ï¸ *Nameservers:* ${ns}
 
_Powered by CODEX AI_`,
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(sender, { text: `âŒ WHOIS lookup failed: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};

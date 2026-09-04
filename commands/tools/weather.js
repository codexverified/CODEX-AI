'use strict';
 
const axios    = require('axios');
const { getStr } = require('../../lib/theme');
const OWM_KEY = '060a6bcfa19809c2cd4d97a212b19273';
 
module.exports = {
    commands:    ['weather', 'climate', 'mosam'],
    category: 'tools',
    description: 'Get current weather for a location',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        if (!args.length) {
            return sock.sendMessage(sender, {
                text: 'âŒ Please provide a location.\nExample: .weather Nairobi',
                contextInfo
            }, { quoted: message });
        }
 
        const location = args.join(' ');
        const loading  = await sock.sendMessage(sender, {
            text: 'â³ Fetching weather data...',
            contextInfo
        }, { quoted: message });
 
        try {
            const { data } = await axios.get(
                `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&units=metric&appid=${OWM_KEY}`,
                { timeout: 10000 }
            );
 
            const iconUrl = `https://openweathermap.org/img/wn/${data.weather[0].icon}@4x.png`;
 
            if (loading) await sock.sendMessage(sender, { delete: loading.key });
 
            await sock.sendMessage(sender, {
                image:   { url: iconUrl },
                caption:
`ðŸŒ *${data.name}, ${data.sys.country} â€” Weather Report*
ðŸ“… ${new Date().toUTCString()}
 
ðŸŒ¡ï¸ Temp: ${data.main.temp}Â°C  (min ${data.main.temp_min}Â°C / max ${data.main.temp_max}Â°C)
ðŸ’§ Humidity: ${data.main.humidity}%
ðŸ’¨ Wind: ${data.wind.speed} km/h
ðŸŒ¤ï¸ ${data.weather[0].description.charAt(0).toUpperCase() + data.weather[0].description.slice(1)}
 
_Powered by ${getStr('botName') || 'CODEX AI'}_`,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            console.error('[Weather]', err.message);
            const msg = err.response?.status === 404
                ? 'âŒ Location not found. Please check the name.'
                : 'âŒ Failed to fetch weather. Try again later.';
            await sock.sendMessage(sender, { text: msg, contextInfo }, { quoted: message });
        }
    }
};

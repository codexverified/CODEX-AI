'use strict';
 
/**
 * BGM â€” Add background music to a video
 *
 * Usage:
 *   1. Send a video  + quote an audio/voice    â†’ adds quoted audio as BGM
 *   2. Send an audio + quote a video           â†’ adds current audio as BGM to quoted video
 *   3. Reply to a video with audio attached    â†’ same as above
 *   4. .bgm --vol 40   to set BGM volume (default 30%)
 *   5. .bgm --replace  to fully replace original audio instead of mixing
 */
 
const ffmpeg      = require('fluent-ffmpeg');
const fs          = require('fs');
const path        = require('path');
const os          = require('os');
const { fmt }     = require('../../lib/theme');
const { dlBuffer } = require('../../lib/dlmedia');
 
// â”€â”€â”€ Parse flags from args â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseFlags(args) {
    let vol     = 30;       // BGM volume % (0â€“100)
    let replace = false;    // replace original audio entirely
 
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--vol' && args[i + 1]) {
            const v = parseInt(args[i + 1], 10);
            if (!isNaN(v) && v >= 0 && v <= 100) vol = v;
        }
        if (args[i] === '--replace') replace = true;
    }
 
    return { vol: vol / 100, replace };
}
 
// â”€â”€â”€ Run ffmpeg and return the output path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function mergeMedia(videoPath, audioPath, outputPath, { vol, replace }) {
    return new Promise((resolve, reject) => {
        const cmd = ffmpeg()
            .input(videoPath)
            .input(audioPath);
 
        if (replace) {
            // Replace original audio entirely with BGM, loop BGM if shorter
            cmd
                .complexFilter([
                    `[1:a]volume=${vol}[bgm]`,
                ])
                .outputOptions([
                    '-map 0:v',
                    '-map [bgm]',
                    '-shortest',
                    '-c:v copy',
                    '-c:a aac',
                    '-b:a 128k',
                    '-movflags +faststart',
                ]);
        } else {
            // Mix original audio with BGM
            cmd
                .complexFilter([
                    `[0:a]volume=1.0[orig]`,
                    `[1:a]volume=${vol}[bgm]`,
                    `[orig][bgm]amix=inputs=2:duration=first:dropout_transition=3[out]`,
                ])
                .outputOptions([
                    '-map 0:v',
                    '-map [out]',
                    '-shortest',
                    '-c:v copy',
                    '-c:a aac',
                    '-b:a 128k',
                    '-movflags +faststart',
                ]);
        }
 
        cmd
            .output(outputPath)
            .on('start', cmd => console.log('[BGM] ffmpeg:', cmd.slice(0, 120)))
            .on('end',   ()  => resolve(outputPath))
            .on('error', err => reject(err))
            .run();
    });
}
 
// â”€â”€â”€ For silent videos (no audio track): just add BGM as the only track â”€â”€â”€â”€â”€â”€
function addAudioToSilentVideo(videoPath, audioPath, outputPath, { vol }) {
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(videoPath)
            .input(audioPath)
            .complexFilter([`[1:a]volume=${vol}[bgm]`])
            .outputOptions([
                '-map 0:v',
                '-map [bgm]',
                '-shortest',
                '-c:v copy',
                '-c:a aac',
                '-b:a 128k',
                '-movflags +faststart',
            ])
            .output(outputPath)
            .on('end',   ()  => resolve(outputPath))
            .on('error', err => reject(err))
            .run();
    });
}
 
// â”€â”€â”€ Check if a video file has an audio stream â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function hasAudioStream(videoPath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(videoPath, (err, meta) => {
            if (err) return resolve(false);
            const hasAudio = meta?.streams?.some(s => s.codec_type === 'audio');
            resolve(!!hasAudio);
        });
    });
}
 
// â”€â”€â”€ Main plugin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
module.exports = {
    commands:    ['bgm', 'addmusic', 'videomusic', 'musicvideo', 'addbgm'],
    category: 'group',
    description: 'Add background music to a video. Reply to a video with audio (or vice versa).',
    usage: [
        '.bgm              â†’ reply to video + send audio (or vice versa)',
        '.bgm --vol 50     â†’ set BGM volume (0â€“100, default 30)',
        '.bgm --replace    â†’ replace original audio instead of mixing',
    ].join('\n'),
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, { jid, contextInfo, reply }) => {
        const flags   = parseFlags(args);
        const msg     = message.message;
        const quoted  = msg?.extendedTextMessage?.contextInfo?.quotedMessage;
 
        // â”€â”€ Detect video and audio sources â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        //
        // We accept:
        //   current = video  â†’  quoted = audio
        //   current = audio  â†’  quoted = video
        //   current = video  â†’  args has nothing (show help)
 
        const curVid  = msg?.videoMessage;
        const curAud  = msg?.audioMessage;
        const qVid    = quoted?.videoMessage;
        const qAud    = quoted?.audioMessage;
 
        let videoMsg  = null;
        let audioMsg  = null;
        let videoSrc  = 'video';   // for dlBuffer
        let audioSrc  = 'audio';
 
        if (curVid && qAud) {
            videoMsg = curVid;
            audioMsg = qAud;
        } else if (curAud && qVid) {
            videoMsg = qVid;
            audioMsg = curAud;
        } else if (curVid && curAud) {
            // both in the same message â€” less common but handle it
            videoMsg = curVid;
            audioMsg = curAud;
        } else {
            return reply(fmt(
                `ðŸŽµ *BGM â€” Add Background Music to a Video*\n\n` +
                `*How to use:*\n` +
                `â€¢ Send a video and quote an audio/voice message with \`.bgm\`\n` +
                `â€¢ OR send an audio and quote a video with \`.bgm\`\n\n` +
                `*Options:*\n` +
                `â€¢ \`.bgm --vol 50\`   â†’ BGM volume 50% (default: 30%)\n` +
                `â€¢ \`.bgm --replace\`  â†’ replace original audio entirely\n\n` +
                `_Both video and audio must be present as quoted or attached._`
            ));
        }
 
        await sock.sendPresenceUpdate('composing', jid);
 
        const volPct    = Math.round(flags.vol * 100);
        const modeLabel = flags.replace ? 'ðŸ”„ Replace mode' : `ðŸŽšï¸ Mix mode (BGM vol: ${volPct}%)`;
        const wait = await sock.sendMessage(jid, {
            text: fmt(`â³ Processing BGMâ€¦\n${modeLabel}`),
            contextInfo
        }, { quoted: message });
 
        const tmpId      = Date.now();
        const videoPath  = path.join(os.tmpdir(), `bgm_vid_${tmpId}.mp4`);
        const audioPath  = path.join(os.tmpdir(), `bgm_aud_${tmpId}.mp3`);
        const outputPath = path.join(os.tmpdir(), `bgm_out_${tmpId}.mp4`);
 
        const cleanup = () => {
            for (const f of [videoPath, audioPath, outputPath]) {
                if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch { /* ignore */ }
            }
        };
 
        try {
            // â”€â”€ Download video and audio in parallel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            await sock.sendMessage(jid, { text: fmt('ðŸ“¥ Downloading mediaâ€¦'), contextInfo }, { quoted: message });
 
            const [vidBuf, audBuf] = await Promise.all([
                dlBuffer(videoMsg, 'video'),
                dlBuffer(audioMsg, 'audio'),
            ]);
 
            fs.writeFileSync(videoPath, vidBuf);
            fs.writeFileSync(audioPath, audBuf);
 
            // â”€â”€ Probe for audio stream â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            await sock.sendMessage(jid, { text: fmt('ðŸ”§ Merging audioâ€¦'), contextInfo }, { quoted: message });
 
            const videoHasAudio = await hasAudioStream(videoPath);
 
            if (!videoHasAudio || flags.replace) {
                await addAudioToSilentVideo(videoPath, audioPath, outputPath, flags);
            } else {
                await mergeMedia(videoPath, audioPath, outputPath, flags);
            }
 
            const outBuf  = fs.readFileSync(outputPath);
            const sizeMB  = (outBuf.length / 1_048_576).toFixed(2);
 
            // â”€â”€ Delete waiting messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if (wait) await sock.sendMessage(jid, { delete: wait.key }).catch(() => {});
 
            // â”€â”€ Send result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            await sock.sendMessage(jid, {
                video:   outBuf,
                caption: fmt(
                    `ðŸŽµ *BGM Applied!*\n\n` +
                    `ðŸŽšï¸ *Mode:* ${flags.replace ? 'Replace' : 'Mix'}\n` +
                    `ðŸ”Š *BGM Volume:* ${volPct}%\n` +
                    `ðŸ“¦ *File size:* ${sizeMB} MB`
                ),
                contextInfo,
            }, { quoted: message });
 
            await sock.sendPresenceUpdate('paused', jid);
 
        } catch (err) {
            console.error('[BGM]', err.message);
            if (wait) await sock.sendMessage(jid, { delete: wait.key }).catch(() => {});
            await reply(fmt(`âŒ BGM failed: ${err.message}`));
        } finally {
            cleanup();
        }
    }
};

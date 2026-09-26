'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { downloadContentFromMessage } = require('@codexverified/baileys');

const TIMEOUT_MS = 45_000;

function tmp(ext) {
  return path.join(os.tmpdir(), `tomp3-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
}

function run(args, ms = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { timeout: ms, maxBuffer: 20 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve();
    });
  });
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function resolveMedia(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo
           || msg.message?.imageMessage?.contextInfo
           || msg.message?.videoMessage?.contextInfo
           || msg.message?.audioMessage?.contextInfo
           || msg.message?.documentMessage?.contextInfo
           || null;
  const quoted = ctx?.quotedMessage || null;

  const sources = [
    quoted,
    msg.message,
    quoted?.videoMessage,
    quoted?.audioMessage,
    quoted?.documentMessage,
    msg.message?.videoMessage,
    msg.message?.audioMessage,
    msg.message?.documentMessage,
  ].filter(Boolean);

  for (const src of sources) {
    if (src.videoMessage) return { type: 'video', node: src.videoMessage };
    if (src.audioMessage) return { type: 'audio', node: src.audioMessage };
    if (src.documentMessage) return { type: 'document', node: src.documentMessage };
  }

  return null;
}

async function downloadWithTimeout(node, type) {
  return new Promise(async (resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Media download timed out')), TIMEOUT_MS);
    try {
      const stream = await downloadContentFromMessage(node, type);
      const buf = await streamToBuffer(stream);
      clearTimeout(t);
      resolve(buf);
    } catch (e) {
      clearTimeout(t);
      reject(e);
    }
  });
}

module.exports = {
  name: 'tomp3',
  aliases: ['video2mp3', 'mp3', 'toaudio'],
  category: 'media',
  description: 'Convert a video or audio file to MP3',
  reactions: { start: '🎵' },

  async execute(bot, m, args) {
    const found = resolveMedia(m);
    if (!found) {
      await bot.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {});
      return m.reply(
        '*Video / Audio → MP3*\n\n' +
        `Reply to a video or audio file with ${bot.prefix}tomp3\n` +
        `Also works with .mp3 if the bot receives a downloadable media message.`
      );
    }

    let mediaType = found.type;
    let node = found.node;
    let buffer;

    try {
      buffer = await downloadWithTimeout(node, mediaType);
      if (!buffer || buffer.length < 100) throw new Error('empty media buffer');
    } catch (e) {
      console.error('[tomp3:download]', e.message);
      await bot.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {});
      return m.reply('Could not download that media. Try forwarding it once and retry.');
    }

    const inFile = tmp(mediaType === 'video' ? '.mp4' : mediaType === 'audio' ? '.m4a' : '.bin');
    const outFile = tmp('.mp3');

    try {
      if (!ffmpegPath) {
        return m.reply('FFmpeg is not available in this environment. Install FFmpeg or use the bundled binary.');
      }

      fs.writeFileSync(inFile, buffer);
      await run(['-y', '-i', inFile, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', outFile]);
      const mp3 = fs.readFileSync(outFile);

      await bot.sendMessage(m.chat, {
        audio: mp3,
        mimetype: 'audio/mpeg',
        fileName: `converted-${Date.now()}.mp3`,
      }, { quoted: m });

      await bot.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {});
      return;
    } catch (e) {
      console.error('[tomp3:convert]', e.message);
      await bot.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {});
      return m.reply('Could not convert that media to MP3. Make sure ffmpeg is installed and the file is valid.');
    } finally {
      try { fs.unlinkSync(inFile); } catch {}
      try { fs.unlinkSync(outFile); } catch {}
    }
  },
};

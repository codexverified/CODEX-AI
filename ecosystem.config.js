/**
 * PM2 process definition — FOR A SELF-MANAGED LINUX VPS / VM ONLY.
 *
 * Do NOT use this on Render, Heroku, Docker or a hosting panel (Pterodactyl):
 * those already supervise the process, and a second supervisor fighting over
 * the same WhatsApp session will corrupt it. Run exactly ONE instance.
 *
 * Why these settings:
 *   - fork mode, instances: 1 -> one process owns the WhatsApp session. Never
 *     use cluster mode or scale up: two writers to ./session corrupt the auth.
 *   - autorestart + restart_delay -> crash recovery without a tight loop.
 *   - min_uptime / max_restarts   -> a process that dies within 20s, 20 times
 *     in a row (bad config, missing dependency) is marked "errored" instead of
 *     restarting forever. Read `pm2 logs codex-ai-v3`, fix it, then restart.
 *   - kill_timeout -> time for the app's SIGTERM handler (app.js) to flush
 *     pending credentials and release the session lock before PM2 SIGKILLs.
 *   - watch: false -> never restart because a runtime file (database/*.json,
 *     session/) changed.
 *   - no max_memory_restart: set one only after measuring your server's RAM,
 *     e.g. max_memory_restart: '700M' on a 1 GB box (see `pm2 monit`).
 */
module.exports = {
  apps: [
    {
      name: 'codex-ai-v3',            // the ONLY name used by the npm pm2:* scripts
      script: 'index.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      restart_delay: 5000,
      min_uptime: '20s',
      max_restarts: 20,
      kill_timeout: 10000,
      time: true,                 // timestamp each log line
      merge_logs: true,
      out_file: './logs/codex-ai-v3.out.log',
      error_file: './logs/codex-ai-v3.err.log',
      env: {
        NODE_ENV: 'production',
        // Secrets (e.g. SESSION_ID) belong in the server's environment or a
        // private .env — never in this file or in git.
      },
    },
  ],
};

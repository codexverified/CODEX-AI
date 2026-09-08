'use strict';

/**
 * .airstrike — Airstrike bombing run for WhatsApp GenAI rich messages.
 *
 * The original file had a broken/stripped body: markup and the whole game
 * script were missing, so the plugin shipped a static card with dead buttons.
 * This is a complete rebuild:
 *  - Real game loop: requestAnimationFrame + delta time (frame-rate safe).
 *  - HiDPI canvas, one fixed logical coordinate space for draw + collisions.
 *  - Scrolling battlefield with tanks, bunkers and AA guns; bombs inherit the
 *    jet's velocity and fall under gravity.
 *  - Enemy AA fire, 3 lives, hit flash + brief invulnerability, difficulty ramp
 *    from slow to fast, BOOST with a cooldown, PAUSE, RELOAD (restart).
 *  - GAME OVER / SCORE / "TAP ↻ TO RESTART" drawn inside the canvas.
 *  - WebAudio sound effects with a speaker mute button (state persisted).
 *  - Touch (Pointer Events) + keyboard controls, full teardown on pagehide.
 */

const { sendRichHtml } = require('../../lib/genaiRich');

function airstrikeHtml() {
    return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
* { box-sizing: border-box; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
html, body { margin: 0; background: transparent; font-family: Arial, sans-serif; }
body { padding: 6px; background: radial-gradient(circle at 50% 4%, #163b70, #050b18 76%); }
.card {
    max-width: 340px; margin: 0 auto; padding: 12px;
    border: 2px solid #4aa8ff; border-radius: 20px;
    background: linear-gradient(145deg, #07152c, #102e55 55%, #050d1d);
    color: #e5f4ff; box-shadow: inset 0 0 0 3px #123b69, 0 8px 20px #000b;
}
.titlebar { display: grid; grid-template-columns: 34px 1fr 34px; align-items: center; min-height: 34px; }
.title { grid-column: 2; text-align: center; color: #d7efff; font: bold 22px "Arial Black", Arial, sans-serif; letter-spacing: 1px; text-shadow: 0 0 12px #289dff; }
.sound { grid-column: 3; width: 32px; height: 32px; padding: 3px; border: 0; outline: 0; background: transparent; color: #d8ffe0; cursor: pointer; display: grid; place-items: center; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.sound svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.sound:active { transform: scale(.88); }
.sub { text-align: center; margin: 2px 0 8px; color: #80b7df; font: 10px monospace; letter-spacing: .5px; }
.boardWrap { position: relative; border-radius: 13px; overflow: hidden; }
#game { display: block; width: 100%; height: auto; aspect-ratio: 1.35; border: 2px solid #2d75b7; border-radius: 13px; background: #020814; box-shadow: inset 0 0 28px #000; touch-action: none; }
.message { height: 32px; margin: 8px 0; display: grid; place-items: center; border: 1px solid #2d6d9e; border-radius: 8px; background: #03101f; color: #bfe4ff; font: bold 11px monospace; text-align: center; padding: 0 6px; }
.controls { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 42px); gap: 6px; max-width: 310px; margin: 0 auto; }
.controls button { width: 100%; height: 42px; border: 2px solid #2e7fbd; border-radius: 11px; color: #e5f5ff; background: linear-gradient(#155b91, #082d4e); font-size: 18px; font-weight: 900; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.controls button:active { transform: scale(.92); background: #1a70ad; }
.controls button[disabled] { opacity: .45; }
.drop { font-size: 12px !important; letter-spacing: .5px; }
.pause { font-size: 12px !important; }
.reload { font-size: 22px !important; }
.boost { font-size: 12px !important; }
.hint { text-align: center; margin: 7px 0 0; color: #83b3d2; font: 10px monospace; }
@media (max-width: 360px) { .card { padding: 9px; } .title { font-size: 20px; } .controls { max-width: 280px; } }
</style>
</head>
<body>
<div class="card">
    <div class="titlebar">
        <div class="title">&#10022; AIRSTRIKE</div>
        <button class="sound" id="soundBtn" type="button" aria-label="Toggle sound">
            <svg id="soundIcon" viewBox="0 0 24 24"></svg>
        </button>
    </div>
    <div class="sub">FLY &middot; DROP &middot; DESTROY &middot; SURVIVE</div>

    <div class="boardWrap">
        <canvas id="game" width="540" height="400"></canvas>
    </div>

    <div class="message" id="message">Tap a control to start</div>

    <div class="controls">
        <button type="button" class="left" id="btnLeft" aria-label="Move left">&#9664;</button>
        <button type="button" class="drop" id="btnDrop">DROP BOMB</button>
        <button type="button" class="right" id="btnRight" aria-label="Move right">&#9654;</button>
        <button type="button" class="pause" id="btnPause">&#8214; PAUSE</button>
        <button type="button" class="reload" id="btnReload" aria-label="Restart">&#8635;</button>
        <button type="button" class="boost" id="btnBoost">BOOST</button>
    </div>

    <p class="hint">Destroy the targets &middot; avoid enemy fire &middot; survive the air raid</p>
</div>

<script>
(function () {
    'use strict';

    var canvas = document.getElementById('game');
    var ctx = canvas.getContext('2d');
    var messageEl = document.getElementById('message');
    var soundBtn = document.getElementById('soundBtn');
    var soundIcon = document.getElementById('soundIcon');
    var btnLeft = document.getElementById('btnLeft');
    var btnRight = document.getElementById('btnRight');
    var btnDrop = document.getElementById('btnDrop');
    var btnPause = document.getElementById('btnPause');
    var btnReload = document.getElementById('btnReload');
    var btnBoost = document.getElementById('btnBoost');

    // ---- logical coordinate space (never changes, whatever the device) ----
    var W = 540, H = 400;
    var GROUND_Y = 330;

    // ---- tuning ----
    var BASE_SCROLL = 70;          // px/s at the very start (slow)
    var MAX_SCROLL = 260;          // px/s ceiling
    var RAMP_SECONDS = 90;         // time to approach the ceiling
    var BOOST_MULT = 1.9;
    var BOOST_TIME = 2.2;
    var BOOST_COOLDOWN = 6;
    var PLANE_ACCEL = 620;         // horizontal thrust from arrows
    var PLANE_DRAG = 3.2;
    var PLANE_MAX_VX = 210;
    var GRAVITY = 460;
    var BOMB_LIMIT = 4;            // bombs in the air at once
    var RELOAD_TIME = 0.55;
    var INVULN_TIME = 1.6;
    var LIVES = 3;

    var HISCORE_KEY = 'airstrike.best.v1';
    var MUTE_KEY = 'airstrike.muted.v1';

    var state = null;
    var running = false;
    var rafId = 0;
    var lastTime = 0;
    var keys = Object.create(null);
    var held = { left: false, right: false };
    var muted = false;
    var audioCtx = null;
    var masterGain = null;
    var best = 0;
    var countingDown = false;
    var countdownTimer = null;
    var backgroundGain = null;
    var backgroundOscillator = null;
    var backgroundRunning = false;

    // ---------------------------------------------------------------- storage
    function safeGet(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    function safeSet(key, value) {
        try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    }

    best = parseInt(safeGet(HISCORE_KEY) || '0', 10) || 0;
    muted = safeGet(MUTE_KEY) === '1';

    // ------------------------------------------------------------------ audio
    function ensureAudio() {
        if (audioCtx) { return audioCtx; }
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) { return null; }
        try {
            audioCtx = new Ctor();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = muted ? 0 : 0.22;
            masterGain.connect(audioCtx.destination);
        } catch (e) {
            audioCtx = null;
        }
        return audioCtx;
    }

    function blip(type, freqStart, freqEnd, duration, gain) {
        if (muted) { return; }
        var ac = ensureAudio();
        if (!ac || !masterGain) { return; }
        if (ac.state === 'suspended' && ac.resume) { ac.resume(); }
        var now = ac.currentTime;
        var osc = ac.createOscillator();
        var env = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, now);
        osc.frequency.linearRampToValueAtTime(freqEnd, now + duration);
        env.gain.setValueAtTime(0.0001, now);
        env.gain.exponentialRampToValueAtTime(gain, now + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(env);
        env.connect(masterGain);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    }

    function noise(duration, gain) {
        if (muted) { return; }
        var ac = ensureAudio();
        if (!ac || !masterGain) { return; }
        if (ac.state === 'suspended' && ac.resume) { ac.resume(); }
        var frames = Math.max(1, Math.floor(ac.sampleRate * duration));
        var buffer = ac.createBuffer(1, frames, ac.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < frames; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
        }
        var src = ac.createBufferSource();
        var env = ac.createGain();
        src.buffer = buffer;
        env.gain.value = gain;
        src.connect(env);
        env.connect(masterGain);
        src.start();
    }

    var sfx = {
        drop: function () { blip('triangle', 660, 180, 0.18, 0.25); },
        boom: function () { noise(0.32, 0.5); blip('sine', 160, 40, 0.3, 0.4); },
        hit: function () { blip('square', 300, 90, 0.3, 0.4); noise(0.2, 0.35); },
        over: function () { blip('sawtooth', 420, 70, 0.8, 0.4); },
        boost: function () { blip('sine', 300, 780, 0.25, 0.28); },
        score: function () { blip('square', 880, 1180, 0.09, 0.18); }
    };

    function countdownSound(value) {
        if (value === 'GO') { blip('square', 520, 900, 0.16, 0.22); }
        else { blip('square', 330, 420, 0.1, 0.14); }
    }

    function startBackground() {
        if (muted || backgroundRunning) { return; }
        var ac = ensureAudio();
        if (!ac || !masterGain) { return; }

        backgroundGain = ac.createGain();
        backgroundOscillator = ac.createOscillator();
        backgroundOscillator.type = 'sawtooth';
        backgroundOscillator.frequency.value = 54;
        backgroundGain.gain.setValueAtTime(0.0001, ac.currentTime);
        backgroundGain.gain.exponentialRampToValueAtTime(0.045, ac.currentTime + 0.45);
        backgroundOscillator.connect(backgroundGain);
        backgroundGain.connect(masterGain);
        backgroundOscillator.start();
        backgroundRunning = true;
    }

    function stopBackground() {
        if (!backgroundRunning) { return; }
        var oscillator = backgroundOscillator;
        var ac = audioCtx;
        if (ac && backgroundGain) {
            backgroundGain.gain.cancelScheduledValues(ac.currentTime);
            backgroundGain.gain.setValueAtTime(Math.max(backgroundGain.gain.value, 0.0001), ac.currentTime);
            backgroundGain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.16);
        }
        backgroundOscillator = null;
        backgroundRunning = false;
        setTimeout(function () { try { if (oscillator) { oscillator.stop(); } } catch (e) {} }, 190);
    }

    function renderSoundIcon() {
        var speaker = '<path d="M4 9h3l4-3v12l-4-3H4z"/>';
        soundIcon.innerHTML = muted
            ? speaker + '<path d="M15 9l5 6"/><path d="M20 9l-5 6"/>'
            : speaker + '<path d="M15 8.5a5 5 0 0 1 0 7"/><path d="M17.8 6a8.5 8.5 0 0 1 0 12"/>';
        soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    }

    function toggleMute() {
        muted = !muted;
        safeSet(MUTE_KEY, muted ? '1' : '0');
        if (masterGain) { masterGain.gain.value = muted ? 0 : 0.22; }
        renderSoundIcon();
        if (!muted) { sfx.score(); }
        if (muted) { stopBackground(); }
        else if (running && state && !state.paused) { startBackground(); }
    }

    // ------------------------------------------------------------------- HiDPI
    function resizeCanvas() {
        var dpr = Math.min(window.devicePixelRatio || 1, 3);
        var cssWidth = canvas.clientWidth || W;
        var cssHeight = cssWidth / (W / H);
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
        var scale = canvas.width / W;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.imageSmoothingEnabled = false;
        if (state) { draw(); }
    }

    // -------------------------------------------------------------- game state
    function newState() {
        return {
            time: 0,
            scroll: 0,
            scrollSpeed: BASE_SCROLL,
            score: 0,
            lives: LIVES,
            plane: { x: W * 0.35, y: 96, vx: 0, w: 44, h: 16 },
            bombs: [],
            targets: [],
            enemyShots: [],
            particles: [],
            clouds: [],
            stars: [],
            bombsReady: BOMB_LIMIT,
            reloadTimer: 0,
            boostTimer: 0,
            boostCooldown: 0,
            invuln: 0,
            shake: 0,
            nextTargetX: W + 60,
            over: false,
            paused: false,
            started: false,
            destroyed: 0
        };
    }

    function seedScenery(s) {
        var i;
        for (i = 0; i < 7; i++) {
            s.clouds.push({ x: Math.random() * W, y: 20 + Math.random() * 120, r: 14 + Math.random() * 22, p: 0.25 + Math.random() * 0.5 });
        }
        for (i = 0; i < 40; i++) {
            s.stars.push({ x: Math.random() * W, y: Math.random() * (GROUND_Y - 90), r: Math.random() * 1.2 + 0.3, t: Math.random() * 6 });
        }
        for (i = 0; i < 4; i++) { spawnTarget(s); }
    }

    var TARGET_KINDS = [
        { kind: 'tank', w: 42, h: 20, hp: 1, points: 100, shoots: false },
        { kind: 'bunker', w: 50, h: 28, hp: 2, points: 180, shoots: false },
        { kind: 'aa', w: 38, h: 26, hp: 1, points: 250, shoots: true }
    ];

    function spawnTarget(s) {
        var difficulty = Math.min(1, s.time / RAMP_SECONDS);
        var roll = Math.random();
        var spec;
        if (roll < 0.45) { spec = TARGET_KINDS[0]; }
        else if (roll < 0.72) { spec = TARGET_KINDS[1]; }
        else { spec = TARGET_KINDS[2]; }

        s.targets.push({
            kind: spec.kind,
            x: s.nextTargetX,
            w: spec.w,
            h: spec.h,
            hp: spec.hp,
            points: spec.points,
            shoots: spec.shoots,
            cooldown: 1.2 + Math.random() * 2.2,
            dead: false,
            flash: 0
        });
        s.nextTargetX += 150 + Math.random() * 190 - difficulty * 60;
    }

    function reset(startImmediately) {
        state = newState();
        seedScenery(state);
        state.started = !!startImmediately;
        setMessage(startImmediately ? 'Air raid started &mdash; drop your payload!' : 'Tap a control to start');
        btnPause.innerHTML = '&#8214; PAUSE';
        draw();
    }

    function setMessage(html) {
        messageEl.innerHTML = html;
    }

    // ----------------------------------------------------------------- actions
    function startGame() {
        state.started = true;
        setMessage('Air raid started &mdash; drop your payload!');
        running = true;
        lastTime = 0;
        startBackground();
        rafId = window.requestAnimationFrame(frame);
    }

    function startIfNeeded() {
        ensureAudio();
        if (!state) { reset(false); }
        if (state.over) { return; }
        if (!state.started) {
            if (countingDown) { return; }
            countingDown = true;
            var values = ['3', '2', '1', 'GO'];
            var index = 0;

            function next() {
                if (!countingDown) { return; }
                var value = values[index++];
                setMessage(value === 'GO' ? 'GO!' : 'GET READY ' + value);
                countdownSound(value);
                if (index < values.length) {
                    countdownTimer = setTimeout(next, 1000);
                    return;
                }
                countdownTimer = setTimeout(function () {
                    countdownTimer = null;
                    countingDown = false;
                    startGame();
                }, 450);
            }

            next();
            return;
        }
        if (state.paused) { return; }
        if (!running) {
            running = true;
            lastTime = 0;
            startBackground();
            rafId = window.requestAnimationFrame(frame);
        }
    }

    function dropBomb() {
        startIfNeeded();
        if (!state || state.over || state.paused || countingDown) { return; }
        if (state.bombsReady <= 0) {
            setMessage('Reloading&hellip;');
            return;
        }
        state.bombsReady--;
        if (state.reloadTimer <= 0) { state.reloadTimer = RELOAD_TIME; }
        state.bombs.push({
            x: state.plane.x,
            y: state.plane.y + state.plane.h * 0.5,
            vx: state.plane.vx * 0.6,
            vy: 40,
            r: 4
        });
        sfx.drop();
    }

    function useBoost() {
        startIfNeeded();
        if (!state || state.over || state.paused || countingDown) { return; }
        if (state.boostCooldown > 0) {
            setMessage('Boost cooling down&hellip;');
            return;
        }
        state.boostTimer = BOOST_TIME;
        state.boostCooldown = BOOST_COOLDOWN;
        setMessage('AFTERBURNER!');
        sfx.boost();
    }

    function togglePause() {
        if (countingDown) { return; }
        if (!state || state.over || !state.started) { startIfNeeded(); return; }
        state.paused = !state.paused;
        btnPause.innerHTML = state.paused ? '&#9654; RESUME' : '&#8214; PAUSE';
        setMessage(state.paused ? 'Paused' : 'Back in the air!');
        if (state.paused) {
            stopLoop();
            stopBackground();
            draw();
        } else {
            running = true;
            lastTime = 0;
            startBackground();
            rafId = window.requestAnimationFrame(frame);
        }
    }

    function restart() {
        if (countdownTimer) { clearTimeout(countdownTimer); countdownTimer = null; }
        countingDown = false;
        stopBackground();
        stopLoop();
        reset(false);
        startIfNeeded();
    }

    function stopLoop() {
        running = false;
        if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    }

    function gameOver() {
        state.over = true;
        state.paused = false;
        stopLoop();
        stopBackground();
        if (state.score > best) {
            best = state.score;
            safeSet(HISCORE_KEY, String(best));
        }
        setMessage('Shot down &mdash; score ' + state.score + ' &middot; best ' + best);
        sfx.over();
        draw();
    }

    // -------------------------------------------------------------------- loop
    function frame(now) {
        if (!running) { return; }
        if (!lastTime) { lastTime = now; }
        var dt = (now - lastTime) / 1000;
        lastTime = now;
        if (dt > 0.05) { dt = 0.05; }   // clamp after tab switches / GC pauses
        update(dt);
        draw();
        if (running) { rafId = window.requestAnimationFrame(frame); }
    }

    function update(dt) {
        var s = state;
        s.time += dt;

        var ramp = 1 - Math.exp(-s.time / (RAMP_SECONDS / 3));
        var speed = BASE_SCROLL + (MAX_SCROLL - BASE_SCROLL) * ramp;
        if (s.boostTimer > 0) { speed *= BOOST_MULT; }
        s.scrollSpeed = speed;
        s.scroll += speed * dt;

        if (s.boostTimer > 0) { s.boostTimer -= dt; }
        if (s.boostCooldown > 0) { s.boostCooldown -= dt; }
        if (s.invuln > 0) { s.invuln -= dt; }
        if (s.shake > 0) { s.shake = Math.max(0, s.shake - dt * 3); }

        if (s.reloadTimer > 0) {
            s.reloadTimer -= dt;
            if (s.reloadTimer <= 0 && s.bombsReady < BOMB_LIMIT) {
                s.bombsReady++;
                if (s.bombsReady < BOMB_LIMIT) { s.reloadTimer = RELOAD_TIME; }
            }
        }

        // plane horizontal control
        var dir = 0;
        if (held.left || keys.ArrowLeft || keys.a) { dir -= 1; }
        if (held.right || keys.ArrowRight || keys.d) { dir += 1; }
        s.plane.vx += dir * PLANE_ACCEL * dt;
        s.plane.vx -= s.plane.vx * PLANE_DRAG * dt;
        if (s.plane.vx > PLANE_MAX_VX) { s.plane.vx = PLANE_MAX_VX; }
        if (s.plane.vx < -PLANE_MAX_VX) { s.plane.vx = -PLANE_MAX_VX; }
        s.plane.x += s.plane.vx * dt;
        var minX = s.plane.w * 0.6;
        var maxX = W - s.plane.w * 0.6;
        if (s.plane.x < minX) { s.plane.x = minX; s.plane.vx = 0; }
        if (s.plane.x > maxX) { s.plane.x = maxX; s.plane.vx = 0; }
        s.plane.y = 96 + Math.sin(s.time * 1.6) * 6;

        // scenery
        var i;
        for (i = 0; i < s.clouds.length; i++) {
            var c = s.clouds[i];
            c.x -= speed * c.p * 0.35 * dt;
            if (c.x < -c.r * 3) { c.x = W + c.r * 3; c.y = 20 + Math.random() * 120; }
        }

        // targets scroll leftwards
        s.nextTargetX -= speed * dt;
        for (i = s.targets.length - 1; i >= 0; i--) {
            var t = s.targets[i];
            t.x -= speed * dt;
            if (t.flash > 0) { t.flash -= dt; }
            if (t.x + t.w < -40) { s.targets.splice(i, 1); continue; }
            if (t.shoots && !t.dead && t.x > 0 && t.x < W) {
                t.cooldown -= dt;
                if (t.cooldown <= 0) {
                    var difficulty = Math.min(1, s.time / RAMP_SECONDS);
                    t.cooldown = 2.6 - difficulty * 1.3 + Math.random() * 1.2;
                    fireAtPlane(s, t);
                }
            }
        }
        while (s.nextTargetX < W + 320) { spawnTarget(s); }

        // bombs
        for (i = s.bombs.length - 1; i >= 0; i--) {
            var b = s.bombs[i];
            b.vy += GRAVITY * dt;
            b.x += (b.vx - speed) * dt;
            b.y += b.vy * dt;
            var consumed = false;
            for (var j = 0; j < s.targets.length; j++) {
                var tg = s.targets[j];
                if (tg.dead) { continue; }
                var ty = GROUND_Y - tg.h;
                if (b.x + b.r > tg.x && b.x - b.r < tg.x + tg.w && b.y + b.r > ty) {
                    tg.hp--;
                    tg.flash = 0.15;
                    explode(s, b.x, ty + tg.h * 0.4, tg.hp <= 0 ? 18 : 9);
                    if (tg.hp <= 0) {
                        tg.dead = true;
                        s.destroyed++;
                        s.score += tg.points;
                        sfx.boom();
                        if (s.destroyed % 5 === 0) {
                            sfx.score();
                            setMessage(s.destroyed + ' targets destroyed!');
                        }
                    } else {
                        sfx.hit();
                    }
                    s.shake = 0.6;
                    consumed = true;
                    break;
                }
            }
            if (consumed) { s.bombs.splice(i, 1); continue; }
            if (b.y - b.r > GROUND_Y) {
                explode(s, b.x, GROUND_Y, 8);
                s.bombs.splice(i, 1);
                continue;
            }
            if (b.x < -30 || b.x > W + 30) { s.bombs.splice(i, 1); }
        }

        // enemy fire
        for (i = s.enemyShots.length - 1; i >= 0; i--) {
            var shot = s.enemyShots[i];
            shot.x += (shot.vx - speed) * dt;
            shot.y += shot.vy * dt;
            if (shot.y < -20 || shot.x < -30 || shot.x > W + 30) {
                s.enemyShots.splice(i, 1);
                continue;
            }
            if (s.invuln <= 0 && hitsPlane(s.plane, shot)) {
                s.enemyShots.splice(i, 1);
                takeHit(s);
            }
        }

        // particles
        for (i = s.particles.length - 1; i >= 0; i--) {
            var p = s.particles[i];
            p.life -= dt;
            if (p.life <= 0) { s.particles.splice(i, 1); continue; }
            p.x += (p.vx - speed * 0.6) * dt;
            p.y += p.vy * dt;
            p.vy += 120 * dt;
        }

        // survival trickle so long flights still score
        s.score += Math.floor(dt * 6);
    }

    function fireAtPlane(s, t) {
        var originX = t.x + t.w * 0.5;
        var originY = GROUND_Y - t.h;
        var dx = s.plane.x - originX;
        var dy = s.plane.y - originY;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var speed = 170 + Math.min(90, s.time);
        s.enemyShots.push({
            x: originX,
            y: originY,
            vx: (dx / len) * speed,
            vy: (dy / len) * speed,
            r: 3.5
        });
    }

    function hitsPlane(plane, shot) {
        var halfW = plane.w * 0.42;
        var halfH = plane.h * 0.55;
        return shot.x + shot.r > plane.x - halfW &&
               shot.x - shot.r < plane.x + halfW &&
               shot.y + shot.r > plane.y - halfH &&
               shot.y - shot.r < plane.y + halfH;
    }

    function takeHit(s) {
        s.lives--;
        s.invuln = INVULN_TIME;
        s.shake = 1;
        explode(s, s.plane.x, s.plane.y, 14);
        sfx.hit();
        if (s.lives <= 0) {
            gameOver();
        } else {
            setMessage('Hit! ' + s.lives + (s.lives === 1 ? ' life' : ' lives') + ' left');
        }
    }

    function explode(s, x, y, count) {
        for (var i = 0; i < count; i++) {
            var angle = Math.random() * Math.PI * 2;
            var speed = 40 + Math.random() * 150;
            s.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 40,
                life: 0.35 + Math.random() * 0.5,
                max: 0.85,
                size: 1.5 + Math.random() * 3
            });
        }
    }

    // -------------------------------------------------------------------- draw
    function draw() {
        var s = state;
        if (!s) { return; }
        ctx.save();
        if (s.shake > 0) {
            ctx.translate((Math.random() - 0.5) * 6 * s.shake, (Math.random() - 0.5) * 6 * s.shake);
        }
        drawSky(s);
        drawGround(s);
        drawTargets(s);
        drawBombs(s);
        drawShots(s);
        drawPlane(s);
        drawParticles(s);
        ctx.restore();
        drawHud(s);
        if (s.paused) { drawCenterOverlay('PAUSED', 'TAP \\u2016 TO RESUME', '#ffd9d9'); }
        if (s.over) { drawGameOver(s); }
    }

    function drawSky(s) {
        var dusk = (Math.sin(s.scroll / 2200) + 1) / 2;   // 0 = day, 1 = night
        var sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
        sky.addColorStop(0, mix('#1f6fc4', '#050a1c', dusk));
        sky.addColorStop(0.6, mix('#79bdf0', '#0b1636', dusk));
        sky.addColorStop(1, mix('#cfe9ff', '#16224a', dusk));
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, GROUND_Y);

        if (dusk > 0.35) {
            for (var i = 0; i < s.stars.length; i++) {
                var st = s.stars[i];
                var tw = 0.5 + 0.5 * Math.sin(s.time * 2 + st.t);
                ctx.globalAlpha = Math.min(1, (dusk - 0.35) / 0.4) * tw;
                ctx.fillStyle = '#eaf4ff';
                ctx.beginPath();
                ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // sun / moon share one arc
        var arc = ((s.scroll / 2200) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        var bodyX = W * 0.5 + Math.cos(arc + Math.PI) * W * 0.42;
        var bodyY = 130 - Math.sin(arc + Math.PI) * 80;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = dusk > 0.5 ? '#e8eeff' : '#ffe28a';
        ctx.beginPath();
        ctx.arc(bodyX, bodyY, dusk > 0.5 ? 12 : 16, 0, Math.PI * 2);
        ctx.fill();
        if (dusk > 0.5) {
            ctx.fillStyle = mix('#79bdf0', '#0b1636', dusk);
            ctx.beginPath();
            ctx.arc(bodyX + 5, bodyY - 4, 10, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        for (var c = 0; c < s.clouds.length; c++) {
            var cl = s.clouds[c];
            ctx.globalAlpha = (dusk > 0.5 ? 0.22 : 0.6) * cl.p + 0.1;
            ctx.fillStyle = '#ffffff';
            puff(cl.x, cl.y, cl.r);
        }
        ctx.globalAlpha = 1;
    }

    function puff(x, y, r) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.arc(x + r * 0.8, y + r * 0.2, r * 0.7, 0, Math.PI * 2);
        ctx.arc(x - r * 0.85, y + r * 0.25, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawGround(s) {
        var g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
        g.addColorStop(0, '#4c6b3a');
        g.addColorStop(1, '#1d2a16');
        ctx.fillStyle = g;
        ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
        ctx.strokeStyle = '#6f9450';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, GROUND_Y + 1);
        ctx.lineTo(W, GROUND_Y + 1);
        ctx.stroke();

        // scrolling ground dashes for a sense of speed
        ctx.fillStyle = 'rgba(255,255,255,.15)';
        var offset = -(s.scroll % 60);
        for (var x = offset; x < W; x += 60) {
            ctx.fillRect(x, GROUND_Y + 26, 26, 3);
        }
    }

    function drawTargets(s) {
        for (var i = 0; i < s.targets.length; i++) {
            var t = s.targets[i];
            if (t.dead) { continue; }
            var y = GROUND_Y - t.h;
            ctx.save();
            if (t.flash > 0) { ctx.globalAlpha = 0.6; }
            if (t.kind === 'tank') {
                ctx.fillStyle = '#3f5f2f';
                ctx.fillRect(t.x, y + 8, t.w, t.h - 8);
                ctx.fillStyle = '#54793d';
                ctx.fillRect(t.x + 10, y, t.w - 22, 9);
                ctx.fillStyle = '#2b2b2b';
                ctx.fillRect(t.x + 2, y + t.h - 5, t.w - 4, 5);
                ctx.fillStyle = '#54793d';
                ctx.fillRect(t.x + t.w - 14, y + 2, 16, 4);
            } else if (t.kind === 'bunker') {
                ctx.fillStyle = '#5c5c52';
                ctx.fillRect(t.x, y + 6, t.w, t.h - 6);
                ctx.fillStyle = '#7a7a6c';
                ctx.beginPath();
                ctx.moveTo(t.x + 4, y + 6);
                ctx.lineTo(t.x + t.w / 2, y);
                ctx.lineTo(t.x + t.w - 4, y + 6);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#22221c';
                ctx.fillRect(t.x + 10, y + 14, t.w - 20, 6);
            } else {
                ctx.fillStyle = '#63483a';
                ctx.fillRect(t.x, y + 12, t.w, t.h - 12);
                ctx.strokeStyle = '#d1b48a';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(t.x + t.w * 0.5, y + 12);
                ctx.lineTo(t.x + t.w * 0.9, y - 6);
                ctx.stroke();
                ctx.fillStyle = '#8a6a53';
                ctx.fillRect(t.x + 6, y + 6, t.w - 12, 8);
            }
            ctx.restore();
        }
    }

    function drawBombs(s) {
        for (var i = 0; i < s.bombs.length; i++) {
            var b = s.bombs[i];
            ctx.fillStyle = '#f2f5ff';
            ctx.beginPath();
            ctx.ellipse(b.x, b.y, b.r, b.r * 1.6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ff8a3d';
            ctx.fillRect(b.x - 1.5, b.y - b.r * 2.2, 3, 4);
        }
    }

    function drawShots(s) {
        for (var i = 0; i < s.enemyShots.length; i++) {
            var shot = s.enemyShots[i];
            ctx.fillStyle = '#ffdf6a';
            ctx.beginPath();
            ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,140,60,.55)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(shot.x, shot.y);
            ctx.lineTo(shot.x - shot.vx * 0.05, shot.y - shot.vy * 0.05);
            ctx.stroke();
        }
    }

    function drawPlane(s) {
        var p = s.plane;
        if (s.invuln > 0 && Math.floor(s.time * 12) % 2 === 0) { return; }
        ctx.save();
        ctx.translate(p.x, p.y);
        var tilt = Math.max(-0.25, Math.min(0.25, p.vx / 700));
        ctx.rotate(tilt);

        if (s.boostTimer > 0) {
            ctx.fillStyle = 'rgba(255,150,50,.85)';
            ctx.beginPath();
            ctx.moveTo(-p.w * 0.5, -3);
            ctx.lineTo(-p.w * 0.5 - 22 - Math.random() * 10, 0);
            ctx.lineTo(-p.w * 0.5, 3);
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillStyle = '#cfe3f7';
        ctx.beginPath();
        ctx.moveTo(p.w * 0.5, 0);
        ctx.lineTo(p.w * 0.1, -p.h * 0.5);
        ctx.lineTo(-p.w * 0.45, -p.h * 0.35);
        ctx.lineTo(-p.w * 0.5, p.h * 0.25);
        ctx.lineTo(p.w * 0.2, p.h * 0.45);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#7fa6cd';
        ctx.beginPath();
        ctx.moveTo(p.w * 0.05, 0);
        ctx.lineTo(-p.w * 0.2, p.h * 1.1);
        ctx.lineTo(-p.w * 0.32, p.h * 0.1);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#9dc3e6';
        ctx.beginPath();
        ctx.moveTo(-p.w * 0.4, -p.h * 0.35);
        ctx.lineTo(-p.w * 0.55, -p.h * 1.1);
        ctx.lineTo(-p.w * 0.26, -p.h * 0.35);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#1f3d5c';
        ctx.beginPath();
        ctx.arc(p.w * 0.22, -p.h * 0.15, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawParticles(s) {
        for (var i = 0; i < s.particles.length; i++) {
            var p = s.particles[i];
            var life = Math.max(0, p.life / p.max);
            ctx.globalAlpha = life;
            ctx.fillStyle = life > 0.6 ? '#fff2b0' : (life > 0.3 ? '#ff9436' : '#8a3b1f');
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawHud(s) {
        ctx.font = 'bold 15px monospace';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#d9f2ff';
        ctx.shadowColor = '#0f7fe0';
        ctx.shadowBlur = 8;

        ctx.textAlign = 'left';
        ctx.fillText('SCORE ' + s.score, 12, 10);

        ctx.textAlign = 'center';
        var bombsText = '';
        for (var i = 0; i < BOMB_LIMIT; i++) { bombsText += i < s.bombsReady ? '\\u25cf' : '\\u25cb'; }
        ctx.fillText('BOMBS ' + bombsText, W * 0.5, 10);

        ctx.textAlign = 'right';
        var hearts = '';
        for (var h = 0; h < LIVES; h++) { hearts += h < s.lives ? '\\u2665' : '\\u2661'; }
        ctx.fillText('LIVES ' + hearts, W - 12, 10);

        ctx.textAlign = 'left';
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = s.boostCooldown > 0 ? '#7fa5c4' : '#9dffc0';
        ctx.fillText(s.boostTimer > 0 ? 'BOOST ACTIVE' : (s.boostCooldown > 0 ? 'BOOST ' + s.boostCooldown.toFixed(1) + 's' : 'BOOST READY'), 12, 30);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#b9d9f2';
        ctx.fillText('BEST ' + best, W - 12, 30);

        ctx.shadowBlur = 0;

        if (!s.started && !s.over) {
            drawCenterOverlay('AIRSTRIKE', 'TAP DROP BOMB TO BEGIN', '#cfeaff');
        }
    }

    function drawCenterOverlay(title, subtitle, color) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,4,12,.48)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.font = 'bold 30px "Arial Black", Arial, sans-serif';
        ctx.fillText(title, W * 0.5, H * 0.44);
        ctx.shadowBlur = 6;
        ctx.font = 'bold 14px monospace';
        ctx.fillText(subtitle, W * 0.5, H * 0.44 + 34);
        ctx.restore();
    }

    function drawGameOver(s) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,4,12,.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = '#ff3030';
        ctx.shadowColor = '#ff2020';
        ctx.shadowBlur = 22;
        ctx.font = 'bold 40px "Arial Black", Arial, sans-serif';
        ctx.fillText('GAME OVER', W * 0.5, H * 0.38);

        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffd0d0';
        ctx.font = 'bold 18px monospace';
        ctx.fillText('SCORE: ' + s.score, W * 0.5, H * 0.38 + 42);
        ctx.font = 'bold 13px monospace';
        ctx.fillText('BEST: ' + best + '  \\u00b7  TARGETS: ' + s.destroyed, W * 0.5, H * 0.38 + 66);

        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ffe9a8';
        ctx.font = 'bold 15px monospace';
        ctx.fillText('TAP \\u21bb TO RESTART', W * 0.5, H * 0.38 + 98);
        ctx.restore();
    }

    function mix(a, b, t) {
        var c1 = hexToRgb(a), c2 = hexToRgb(b);
        t = Math.max(0, Math.min(1, t));
        return 'rgb(' + Math.round(c1[0] + (c2[0] - c1[0]) * t) + ',' +
                        Math.round(c1[1] + (c2[1] - c1[1]) * t) + ',' +
                        Math.round(c1[2] + (c2[2] - c1[2]) * t) + ')';
    }

    function hexToRgb(hex) {
        var v = parseInt(hex.slice(1), 16);
        return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }

    // ---------------------------------------------------------------- controls
    function bindHold(btn, key) {
        var down = function (event) {
            if (event.preventDefault) { event.preventDefault(); }
            held[key] = true;
            startIfNeeded();
        };
        var up = function () { held[key] = false; };
        btn.addEventListener('pointerdown', down);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointerleave', up);
        btn.addEventListener('pointercancel', up);
        return function () {
            btn.removeEventListener('pointerdown', down);
            btn.removeEventListener('pointerup', up);
            btn.removeEventListener('pointerleave', up);
            btn.removeEventListener('pointercancel', up);
        };
    }

    function bindTap(el, handler) {
        var onDown = function (event) {
            if (event.preventDefault) { event.preventDefault(); }
            handler();
        };
        el.addEventListener('pointerdown', onDown);
        return function () { el.removeEventListener('pointerdown', onDown); };
    }

    var cleanups = [];
    cleanups.push(bindHold(btnLeft, 'left'));
    cleanups.push(bindHold(btnRight, 'right'));
    cleanups.push(bindTap(btnDrop, dropBomb));
    cleanups.push(bindTap(btnPause, togglePause));
    cleanups.push(bindTap(btnReload, restart));
    cleanups.push(bindTap(btnBoost, useBoost));
    cleanups.push(bindTap(soundBtn, toggleMute));
    cleanups.push(bindTap(canvas, function () {
        if (state && state.over) { restart(); } else { dropBomb(); }
    }));

    function onKeyDown(event) {
        var k = event.key;
        if (k === ' ' || k === 'ArrowUp') {
            event.preventDefault();
            dropBomb();
            return;
        }
        if (k === 'p' || k === 'P') { togglePause(); return; }
        if (k === 'r' || k === 'R') { restart(); return; }
        if (k === 'b' || k === 'B') { useBoost(); return; }
        if (k === 'm' || k === 'M') { toggleMute(); return; }
        keys[k] = true;
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
            event.preventDefault();
            startIfNeeded();
        }
    }
    function onKeyUp(event) { keys[event.key] = false; }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    function onVisibility() {
        if (document.hidden && state && state.started && !state.over && !state.paused) {
            togglePause();
        }
    }
    document.addEventListener('visibilitychange', onVisibility);

    var onResize = function () { resizeCanvas(); };
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) {
        var ro = new window.ResizeObserver(onResize);
        ro.observe(canvas);
    }

    function teardown() {
        if (countdownTimer) { clearTimeout(countdownTimer); countdownTimer = null; }
        countingDown = false;
        stopLoop();
        stopBackground();
        held.left = held.right = false;
        for (var i = 0; i < cleanups.length; i++) {
            try { cleanups[i](); } catch (e) { /* ignore */ }
        }
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibility);
        if (ro) { try { ro.disconnect(); } catch (e) { /* ignore */ } }
        if (audioCtx && audioCtx.close) { try { audioCtx.close(); } catch (e) { /* ignore */ } }
    }
    window.addEventListener('pagehide', teardown);

    renderSoundIcon();
    reset(false);
    resizeCanvas();
})();
</script>
</body>
</html>`;
}

module.exports = {
    name: 'airstrike',
    aliases: ['air', 'airstrikegame'],
    description: 'Play interactive Airstrike in WhatsApp GenAI',
    usage: '.airstrike',
    category: 'games',
    cooldown: 5,

    async execute(bot, msg) {
        const sock = bot && bot.sock;
        const from = msg && msg.chat;

        if (!sock || !from) {
            console.error('[AIRSTRIKE GenAI] missing socket or chat context');
            return;
        }

        try {
            await sendRichHtml({ sock, jid: from, quoted: msg, html: airstrikeHtml() });
        } catch (error) {
            console.error('[AIRSTRIKE GenAI]', error && error.message ? error.message : error);
            try {
                await msg.reply('Airstrike could not open on this client. Please update WhatsApp or run `.airstrike` again.');
            } catch (replyError) {
                console.error('[AIRSTRIKE GenAI] fallback reply failed:', replyError && replyError.message ? replyError.message : replyError);
            }
        }
    }
};

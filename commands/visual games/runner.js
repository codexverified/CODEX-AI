'use strict';

const { sendRichHtml } = require('../../lib/genaiRich');

function runnerHtml() {
    return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
* { box-sizing: border-box; }
html, body { margin: 0; background: transparent; font-family: Arial, sans-serif; }
body { padding: 6px; background: radial-gradient(circle at 50% 4%, #075985, #061323 74%); }

.card {
    padding: 12px;
    border: 2px solid #38bdf8;
    border-radius: 20px;
    background: linear-gradient(145deg, #06192d, #0b3551 54%, #061321);
    color: #dff6ff;
    box-shadow: inset 0 0 0 3px #0b4262, 0 8px 20px #000b;
    max-width: 340px;
    margin: 0 auto;
}

.titlebar {
    display: grid;
    grid-template-columns: 38px 1fr 38px;
    align-items: center;
}

.titlebar .title {
    grid-column: 2;
    text-align: center;
}

.title {
    color: #b9efff;
    font: bold 23px "Arial Black", Arial, sans-serif;
    letter-spacing: 1px;
    text-shadow: 0 0 12px #18bfff;
}

.sound {
    width: 38px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 2px solid #2f7fa8;
    border-radius: 10px;
    background: linear-gradient(#0d4363, #072435);
    color: #cdeeff;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    padding: 0;
}

.sound svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
}

.sound[data-muted="1"] {
    color: #7c93a1;
    border-color: #3d5a6b;
}

.sub {
    text-align: center;
    margin: 2px 0 8px;
    color: #7fc2df;
    font: 10px monospace;
}

.hud {
    display: flex;
    justify-content: space-between;
    margin: 0 0 6px;
    font: bold 13px monospace;
    color: #d4ffd7;
    text-shadow: 0 0 8px #39ff6d;
}

canvas#field {
    display: block;
    width: 100%;
    border: 2px solid #24874c;
    border-radius: 13px;
    background: #041008;
    box-shadow: inset 0 0 24px #001b09;
    touch-action: none;
}

.controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 8px;
}

.controls button {
    height: 44px;
    border: 2px solid #238d50;
    border-radius: 11px;
    color: #d8ffe0;
    background: linear-gradient(#155e35, #07341c);
    font-size: 15px;
    font-weight: 900;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
}

.controls button:active,
.reload:active,
.sound:active {
    transform: scale(.95);
}

.controls button:active {
    background: #1b8345;
}

.reload {
    display: block;
    width: 100%;
    margin: 8px auto 0;
    height: 40px;
    border: 2px solid #238d50;
    border-radius: 11px;
    color: #b6ffc4;
    background: #04180c;
    font: 900 15px monospace;
    letter-spacing: 1px;
    cursor: pointer;
    touch-action: manipulation;
}

.hint {
    text-align: center;
    margin: 7px 0 0;
    color: #7fc58d;
    font: 10px monospace;
}
</style>
</head>
<body>
<div class="card">
    <div class="titlebar">
        <span></span>
        <div class="title">RUNNER</div>
        <button class="sound" id="sound" type="button" data-muted="0" aria-label="Mute sound">
            <svg id="soundIcon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zm-2.5-8.8v2.06A7.5 7.5 0 0 1 19.5 12 7.5 7.5 0 0 1 14 18.74v2.06A9.5 9.5 0 0 0 21.5 12 9.5 9.5 0 0 0 14 3.2z"/>
            </svg>
        </button>
    </div>

    <div class="hud">
        <span>SCORE: <b id="score">0</b></span>
        <span>BEST: <b id="best">0</b></span>
    </div>

    <canvas id="field"></canvas>

    <div class="controls">
        <button id="jump" type="button">&#9650; JUMP</button>
        <button id="duck" type="button">&#9660; SLIDE</button>
    </div>

    <button class="reload" id="reload" type="button">RESTART</button>

    <div class="hint">Starts slow &middot; speeds up as you survive</div>
</div>

<script>
(function () {
    'use strict';

    var W = 320;
    var H = 180;
    var GROUND_Y = 142;
    var PLAYER_X = 44;
    var GRAVITY = 2400;
    var JUMP_VELOCITY = -720;
    var BASE_SPEED = 118;
    var MAX_SPEED = 560;
    var RAMP_SECONDS = 95;
    var COYOTE_MS = 90;
    var BUFFER_MS = 120;
    var DAY_LENGTH = 1400;
    var BEST_KEY = 'codex-runner-best';
    var MUTE_KEY = 'codex-runner-muted';

    var canvas = document.getElementById('field');
    var ctx = canvas.getContext('2d');
    var scoreEl = document.getElementById('score');
    var bestEl = document.getElementById('best');
    var soundBtn = document.getElementById('sound');
    var soundIcon = document.getElementById('soundIcon');

    var player;
    var obstacles;
    var speed;
    var score;
    var best;
    var running;
    var ended;
    var duckHeld;
    var rafId;
    var lastTs;
    var spawnIn;
    var groundOffset;
    var clouds;
    var stars;
    var lastGroundedAt;
    var jumpBufferedAt;
    var elapsed;
    var distance;
    var runPhase;
    var nextBeepAt;
    var muted = false;
    var actx = null;

    function readNum(key) {
        try {
            return Math.max(0, parseInt(localStorage.getItem(key), 10) || 0);
        } catch (e) {
            return 0;
        }
    }

    function writeVal(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch (e) {}
    }

    function audio() {
        if (muted) return null;

        try {
            if (!actx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                actx = new AC();
            }

            if (actx.state === 'suspended') {
                actx.resume();
            }

            return actx;
        } catch (e) {
            return null;
        }
    }

    function blip(freq, dur, type, vol) {
        var a = audio();
        if (!a) return;

        try {
            var osc = a.createOscillator();
            var gain = a.createGain();

            osc.type = type || 'square';
            osc.frequency.setValueAtTime(freq, a.currentTime);
            gain.gain.setValueAtTime(vol || 0.05, a.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);

            osc.connect(gain);
            gain.connect(a.destination);

            osc.start();
            osc.stop(a.currentTime + dur + 0.02);
        } catch (e) {}
    }

    function sfxJump() {
        blip(660, 0.12, 'square', 0.05);
    }

    function sfxSlide() {
        blip(220, 0.14, 'sawtooth', 0.04);
    }

    function sfxPoint() {
        blip(980, 0.07, 'triangle', 0.04);
    }

    function sfxCrash() {
        blip(180, 0.22, 'sawtooth', 0.07);

        setTimeout(function () {
            blip(110, 0.3, 'square', 0.06);
        }, 110);
    }

    function paintSound() {
        soundBtn.setAttribute('data-muted', muted ? '1' : '0');
        soundBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');

        soundIcon.innerHTML = muted
            ? '<path d="M3 9v6h4l5 4V5L7 9H3zm13.59 3L21 7.59 19.59 6.17 15.17 10.59 10.76 6.17 9.34 7.59 13.76 12l-4.42 4.41 1.42 1.42L15.17 13.41l4.42 4.42L21 16.41 16.59 12z"/>'
            : '<path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zm-2.5-8.8v2.06A7.5 7.5 0 0 1 19.5 12 7.5 7.5 0 0 1 14 18.74v2.06A9.5 9.5 0 0 0 21.5 12 9.5 9.5 0 0 0 14 3.2z"/>';
    }

    function resize() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.aspectRatio = W + ' / ' + H;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    function reset() {
        player = {
            y: GROUND_Y,
            vy: 0,
            w: 24,
            h: 30,
            ducking: false
        };

        obstacles = [];

        clouds = [
            { x: 40, y: 28, s: 1 },
            { x: 150, y: 16, s: 0.7 },
            { x: 260, y: 36, s: 0.85 }
        ];

        stars = [];

        for (var i = 0; i < 26; i++) {
            stars.push({
                x: Math.random() * W,
                y: Math.random() * 86,
                r: Math.random() * 1.1 + 0.5,
                tw: Math.random() * 6
            });
        }

        speed = BASE_SPEED;
        score = 0;
        elapsed = 0;
        distance = 0;
        runPhase = 0;
        nextBeepAt = 100;
        duckHeld = false;
        running = false;
        ended = false;
        spawnIn = 1.6;
        groundOffset = 0;
        lastGroundedAt = -Infinity;
        jumpBufferedAt = -Infinity;

        scoreEl.textContent = '0';

        draw();
    }

    function spawnObstacle() {
        if (score > 45 && Math.random() < 0.3) {
            obstacles.push({
                type: 'bird',
                x: W + 10,
                y: GROUND_Y - 40,
                w: 20,
                h: 15,
                t: 0
            });
        } else if (score > 70 && Math.random() < 0.28) {
            obstacles.push({
                type: 'cactus',
                x: W + 10,
                y: GROUND_Y - 28,
                w: 32,
                h: 28
            });
        } else {
            obstacles.push({
                type: 'cactus',
                x: W + 10,
                y: GROUND_Y - 26,
                w: 15,
                h: 26
            });
        }
    }

    function playerBox() {
        if (player.ducking) {
            return {
                x: PLAYER_X + 1,
                y: player.y - 15,
                w: 28,
                h: 14
            };
        }

        return {
            x: PLAYER_X + 3,
            y: player.y - 28,
            w: 17,
            h: 27
        };
    }

    function hits(a, b) {
        return (
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y
        );
    }

    function nightAmount() {
        var t = (distance % (DAY_LENGTH * 2)) / (DAY_LENGTH * 2);
        return (1 - Math.cos(t * Math.PI * 2)) / 2;
    }

    function mix(a, b, t) {
        return a + (b - a) * t;
    }

    function mixColor(c1, c2, t) {
        return 'rgb(' +
            Math.round(mix(c1[0], c2[0], t)) + ',' +
            Math.round(mix(c1[1], c2[1], t)) + ',' +
            Math.round(mix(c1[2], c2[2], t)) + ')';
    }

    function update(dt) {
        var i;
        var o;

        elapsed += dt;

        var ramp = 1 - Math.pow(
            1 - Math.min(elapsed / RAMP_SECONDS, 1),
            2
        );

        speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * ramp;
        distance += speed * dt;

        player.vy += GRAVITY * dt;
        player.y += player.vy * dt;

        if (player.y >= GROUND_Y) {
            player.y = GROUND_Y;
            player.vy = 0;
            lastGroundedAt = performance.now();
        }

        var grounded = player.y >= GROUND_Y - 0.5;

        player.ducking = duckHeld && grounded;

        if (
            jumpBufferedAt > 0 &&
            performance.now() - jumpBufferedAt < BUFFER_MS &&
            grounded
        ) {
            player.vy = JUMP_VELOCITY;
            jumpBufferedAt = -Infinity;
            sfxJump();
        }

        if (grounded && !player.ducking) {
            runPhase += speed * dt * 0.055;
        }

        spawnIn -= dt;

        if (spawnIn <= 0) {
            spawnObstacle();
            spawnIn = 0.55 + Math.random() * 0.5 + (300 / speed);
        }

        groundOffset = (groundOffset + speed * dt) % 24;

        for (i = 0; i < clouds.length; i++) {
            clouds[i].x -= speed * 0.12 * dt;

            if (clouds[i].x < -34) {
                clouds[i].x = W + 20;
                clouds[i].y = 10 + Math.random() * 32;
            }
        }

        var pb = playerBox();

        for (i = obstacles.length - 1; i >= 0; i--) {
            o = obstacles[i];

            o.x -= speed * dt;

            if (o.type === 'bird') {
                o.t = (o.t || 0) + dt;
                o.y += Math.sin(o.t * 10) * 0.4;
            }

            if (o.x + o.w < -12) {
                obstacles.splice(i, 1);
                continue;
            }

            if (hits(pb, o)) {
                endGame();
                return;
            }
        }

        score += dt * 10;

        if (score >= nextBeepAt) {
            nextBeepAt += 100;
            sfxPoint();
        }

        scoreEl.textContent = String(Math.floor(score));
    }

    function drawSky(night) {
        var top = mixColor([96, 190, 240], [4, 8, 30], night);
        var bottom = mixColor([201, 238, 255], [12, 26, 58], night);

        var grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y + 10);
        grad.addColorStop(0, top);
        grad.addColorStop(1, bottom);

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, GROUND_Y + 10);

        if (night > 0.15) {
            for (var i = 0; i < stars.length; i++) {
                var st = stars[i];
                var tw = 0.55 + 0.45 * Math.sin(elapsed * 2.2 + st.tw);

                ctx.globalAlpha =
                    Math.min(1, (night - 0.15) / 0.5) * tw;

                ctx.fillStyle = '#eaf6ff';
                ctx.beginPath();
                ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.globalAlpha = 1;
        }

        var t = (distance % (DAY_LENGTH * 2)) / (DAY_LENGTH * 2);

        function arcPos(phase) {
            var p = ((phase % 1) + 1) % 1;

            return {
                x: 20 + p * (W - 40),
                y: 96 - Math.sin(p * Math.PI) * 68
            };
        }

        var sun = arcPos(t * 2);
        var moon = arcPos(t * 2 - 1);

        if (night < 0.9) {
            ctx.globalAlpha = 1 - night;
            ctx.fillStyle = '#ffd75e';
            ctx.shadowColor = '#ffcf4d';
            ctx.shadowBlur = 18;

            ctx.beginPath();
            ctx.arc(sun.x, sun.y, 12, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }

        if (night > 0.1) {
            ctx.globalAlpha = night;
            ctx.fillStyle = '#e9f2ff';
            ctx.shadowColor = '#9ec7ff';
            ctx.shadowBlur = 16;

            ctx.beginPath();
            ctx.arc(moon.x, moon.y, 11, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;

            ctx.fillStyle = mixColor(
                [96, 190, 240],
                [6, 12, 36],
                night
            );

            ctx.beginPath();
            ctx.arc(moon.x + 5, moon.y - 3, 9, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 1;
        }

        ctx.fillStyle = night > 0.5
            ? 'rgba(150,180,220,.18)'
            : 'rgba(255,255,255,.55)';

        for (var c = 0; c < clouds.length; c++) {
            var cl = clouds[c];

            ctx.beginPath();
            ctx.ellipse(cl.x, cl.y, 16 * cl.s, 6 * cl.s, 0, 0, Math.PI * 2);
            ctx.ellipse(cl.x + 11 * cl.s, cl.y + 2, 10 * cl.s, 5 * cl.s, 0, 0, Math.PI * 2);
            ctx.ellipse(cl.x - 11 * cl.s, cl.y + 3, 9 * cl.s, 4 * cl.s, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawGround(night) {
        ctx.fillStyle = mixColor(
            [64, 132, 78],
            [12, 34, 22],
            night
        );

        ctx.fillRect(0, GROUND_Y + 2, W, H - GROUND_Y - 2);

        ctx.strokeStyle = mixColor(
            [120, 200, 130],
            [30, 82, 48],
            night
        );

        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, GROUND_Y + 1);
        ctx.lineTo(W, GROUND_Y + 1);
        ctx.stroke();

        ctx.fillStyle = mixColor(
            [92, 168, 104],
            [22, 62, 36],
            night
        );

        for (var g = -groundOffset; g < W; g += 24) {
            ctx.fillRect(g, GROUND_Y + 7, 10, 2);
            ctx.fillRect(g + 14, GROUND_Y + 13, 5, 2);
        }
    }

    function drawDino(x, y, night) {
        var skin = night > 0.5 ? '#7fe08a' : '#4bbd5c';
        var dark = night > 0.5 ? '#57b866' : '#2f8b3d';

        ctx.fillStyle = skin;

        if (player.ducking) {
            var by = y - 15;

            ctx.beginPath();

            if (ctx.roundRect) {
                ctx.roundRect(x, by + 3, 22, 11, 5);
            } else {
                ctx.rect(x, by + 3, 22, 11);
            }

            ctx.fill();

            ctx.beginPath();

            if (ctx.roundRect) {
                ctx.roundRect(x + 17, by, 12, 9, 3);
            } else {
                ctx.rect(x + 17, by, 12, 9);
            }

            ctx.fill();

            ctx.fillStyle = '#08210e';
            ctx.fillRect(x + 25, by + 3, 2, 2);

            ctx.fillStyle = skin;

            ctx.beginPath();
            ctx.moveTo(x + 2, by + 5);
            ctx.lineTo(x - 12, by - 4);
            ctx.lineTo(x - 9, by + 8);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = dark;
            ctx.fillRect(x + 4, by + 12, 7, 3);
            ctx.fillRect(x + 13, by + 12, 7, 3);

            ctx.fillStyle = 'rgba(220,235,255,.35)';

            var pf = (Math.sin(elapsed * 22) + 1) * 2;

            ctx.beginPath();
            ctx.arc(
                x - 14 - pf,
                y - 3,
                3 + pf * 0.4,
                0,
                Math.PI * 2
            );
            ctx.fill();

            return;
        }

        var airborne = player.y < GROUND_Y - 0.5;
        var bob = airborne ? 0 : Math.abs(Math.sin(runPhase)) * 1.2;
        var top = y - 28 + bob;

        ctx.fillStyle = skin;

        ctx.beginPath();
        ctx.moveTo(x + 2, top + 12);
        ctx.lineTo(x - 12, top + 7 + Math.sin(runPhase) * 1.5);
        ctx.lineTo(x - 2, top + 20);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();

        if (ctx.roundRect) {
            ctx.roundRect(x + 1, top + 8, 16, 14, 5);
        } else {
            ctx.rect(x + 1, top + 8, 16, 14);
        }

        ctx.fill();

        ctx.beginPath();

        if (ctx.roundRect) {
            ctx.roundRect(x + 9, top + 2, 8, 9, 3);
        } else {
            ctx.rect(x + 9, top + 2, 8, 9);
        }

        ctx.fill();

        ctx.beginPath();

        if (ctx.roundRect) {
            ctx.roundRect(x + 13, top, 11, 9, 3);
        } else {
            ctx.rect(x + 13, top, 11, 9);
        }

        ctx.fill();

        ctx.fillRect(x + 22, top + 5, 4, 3);

        ctx.fillStyle = '#08210e';
        ctx.fillRect(x + 19, top + 3, 2, 2);

        ctx.fillStyle = dark;

        for (var s = 0; s < 3; s++) {
            ctx.beginPath();
            ctx.moveTo(x + 3 + s * 4, top + 8);
            ctx.lineTo(x + 5 + s * 4, top + 4);
            ctx.lineTo(x + 7 + s * 4, top + 8);
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillRect(x + 14, top + 12, 5, 3);

        if (airborne) {
            ctx.fillRect(x + 4, top + 21, 4, 7);
            ctx.fillRect(x + 11, top + 21, 4, 5);
            ctx.fillRect(x + 3, top + 27, 6, 2);
        } else {
            var swing = Math.sin(runPhase);
            var lift = Math.max(0, swing) * 5;
            var lift2 = Math.max(0, -swing) * 5;

            ctx.fillRect(x + 4, top + 21, 4, 7 - lift);
            ctx.fillRect(x + 2 + swing * 2, top + 28 - lift, 6, 2);

            ctx.fillRect(x + 11, top + 21, 4, 7 - lift2);
            ctx.fillRect(x + 10 - swing * 2, top + 28 - lift2, 6, 2);
        }
    }

    function drawObstacle(o, night) {
        if (o.type === 'bird') {
            ctx.fillStyle = night > 0.5 ? '#c9a2ff' : '#ff9f43';

            ctx.beginPath();
            ctx.ellipse(
                o.x + o.w / 2,
                o.y + o.h / 2,
                o.w / 2,
                o.h / 2,
                0,
                0,
                Math.PI * 2
            );
            ctx.fill();

            ctx.fillStyle = night > 0.5 ? '#8d6bd0' : '#e0662f';

            var flap = Math.sin((o.t || 0) * 14) * 5;

            ctx.fillRect(o.x + 2, o.y - 3 + flap, o.w - 7, 4);

            ctx.fillStyle = '#20130a';
            ctx.fillRect(o.x + o.w - 6, o.y + 5, 2, 2);

            return;
        }

        var body = night > 0.5 ? '#2e7a49' : '#2f9e57';
        var cw = Math.min(o.w, 15);

        ctx.fillStyle = body;

        ctx.beginPath();

        if (ctx.roundRect) {
            ctx.roundRect(
                o.x + (o.w - cw) / 2,
                o.y,
                cw,
                o.h,
                4
            );
        } else {
            ctx.rect(
                o.x + (o.w - cw) / 2,
                o.y,
                cw,
                o.h
            );
        }

        ctx.fill();

        ctx.fillRect(
            o.x + (o.w - cw) / 2 - 4,
            o.y + 8,
            5,
            4
        );

        ctx.fillRect(
            o.x + (o.w + cw) / 2 - 1,
            o.y + 12,
            5,
            4
        );

        if (o.w > 20) {
            ctx.beginPath();

            if (ctx.roundRect) {
                ctx.roundRect(
                    o.x + o.w - 12,
                    o.y + 6,
                    11,
                    o.h - 6,
                    4
                );
            } else {
                ctx.rect(
                    o.x + o.w - 12,
                    o.y + 6,
                    11,
                    o.h - 6
                );
            }

            ctx.fill();
        }
    }

    function drawOverlay() {
        var cy = H * 0.43;
        var pulse = 0.86 + Math.sin(elapsed * 7) * 0.14;

        ctx.fillStyle = 'rgba(2,8,14,.55)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';

        ctx.save();
        ctx.translate(W / 2, cy);
        ctx.scale(pulse, pulse);

        ctx.shadowColor = '#ff1717';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#ff3030';
        ctx.font = '900 30px "Arial Black", Arial, sans-serif';
        ctx.fillText('GAME OVER', 0, 0);

        ctx.restore();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffe9e9';
        ctx.font = 'bold 17px monospace';
        ctx.fillText(
            'SCORE: ' + Math.floor(score),
            W / 2,
            cy + 25
        );

        ctx.save();

        var restartPulse = 0.88 + Math.sin(elapsed * 8) * 0.12;

        ctx.translate(W / 2, cy + 48);
        ctx.scale(restartPulse, restartPulse);

        ctx.shadowColor = '#ff1515';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ff4a4a';
        ctx.font = '900 13px monospace';
        ctx.fillText('TAP ↻ TO RESTART', 0, 0);

        ctx.restore();
        ctx.shadowBlur = 0;

        ctx.textAlign = 'left';
    }

    function drawIdle() {
        ctx.fillStyle = 'rgba(2,8,14,.4)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';

        ctx.fillStyle = '#d9f7ff';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(
            'TAP TO START',
            W / 2,
            H * 0.45
        );

        ctx.fillStyle = 'rgba(200,235,255,.75)';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(
            'JUMP OVER CACTI · SLIDE UNDER BIRDS',
            W / 2,
            H * 0.45 + 18
        );

        ctx.textAlign = 'left';
    }

    function draw() {
        var night = nightAmount();

        ctx.clearRect(0, 0, W, H);

        drawSky(night);
        drawGround(night);

        for (var i = 0; i < obstacles.length; i++) {
            drawObstacle(obstacles[i], night);
        }

        drawDino(PLAYER_X, player.y, night);

        if (ended) {
            drawOverlay();
        } else if (!running) {
            drawIdle();
        }
    }

    function endGame() {
        running = false;
        ended = true;

        sfxCrash();

        var finalScore = Math.floor(score);

        if (finalScore > best) {
            best = finalScore;
            writeVal(BEST_KEY, best);
            bestEl.textContent = String(best);
        }

        draw();
    }

    function frame(ts) {
        rafId = requestAnimationFrame(frame);

        if (lastTs === undefined) {
            lastTs = ts;
        }

        var dt = Math.min((ts - lastTs) / 1000, 0.05);

        lastTs = ts;

        if (running) {
            update(dt);
        } else {
            elapsed += dt * 0.15;
        }

        draw();
    }

    function begin() {
        reset();
        running = true;
        audio();
    }

    function jump() {
        if (!running) {
            begin();
            return;
        }

        var now = performance.now();

        if (
            player.y >= GROUND_Y - 0.5 ||
            now - lastGroundedAt < COYOTE_MS
        ) {
            player.vy = JUMP_VELOCITY;
            player.y = Math.min(player.y, GROUND_Y - 0.5);
            sfxJump();
        } else {
            jumpBufferedAt = now;
        }
    }

    function duck(state) {
        if (!running && state) {
            begin();
            return;
        }

        if (state && !duckHeld) {
            sfxSlide();
        }

        duckHeld = state;
    }

    best = readNum(BEST_KEY);
    bestEl.textContent = String(best);

    muted = readNum(MUTE_KEY) === 1;
    paintSound();

    reset();
    resize();

    window.addEventListener('resize', resize);

    rafId = requestAnimationFrame(frame);

    document.getElementById('jump').addEventListener('click', jump);

    soundBtn.addEventListener('click', function () {
        muted = !muted;

        writeVal(MUTE_KEY, muted ? 1 : 0);
        paintSound();

        if (!muted) {
            sfxPoint();
        }
    });

    function bindHold(el, on, off) {
        if (window.PointerEvent) {
            el.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                on();
            });

            el.addEventListener('pointerup', off);
            el.addEventListener('pointercancel', off);
            el.addEventListener('pointerleave', off);
        } else {
            el.addEventListener('mousedown', on);
            el.addEventListener('mouseup', off);

            el.addEventListener(
                'touchstart',
                function (e) {
                    e.preventDefault();
                    on();
                },
                { passive: false }
            );

            el.addEventListener(
                'touchend',
                function (e) {
                    e.preventDefault();
                    off();
                },
                { passive: false }
            );
        }
    }

    bindHold(
        document.getElementById('duck'),
        function () {
            duck(true);
        },
        function () {
            duck(false);
        }
    );

    document.getElementById('reload').addEventListener('click', begin);

    document.addEventListener('keydown', function (e) {
        if (e.repeat) return;

        if (e.key === 'ArrowUp' || e.key === ' ') {
            e.preventDefault();
            jump();
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            duck(true);
        }

        if (e.key === 'm' || e.key === 'M') {
            soundBtn.click();
        }
    });

    document.addEventListener('keyup', function (e) {
        if (e.key === 'ArrowDown') {
            duck(false);
        }
    });

    var tx = 0;
    var ty = 0;

    canvas.addEventListener(
        'touchstart',
        function (e) {
            var t = e.changedTouches[0];
            tx = t.clientX;
            ty = t.clientY;
        },
        { passive: true }
    );

    canvas.addEventListener(
        'touchend',
        function (e) {
            var t = e.changedTouches[0];
            var dx = t.clientX - tx;
            var dy = t.clientY - ty;

            if (
                Math.abs(dy) > Math.abs(dx) &&
                Math.abs(dy) > 18
            ) {
                if (dy < 0) {
                    jump();
                } else {
                    duck(true);

                    setTimeout(function () {
                        duck(false);
                    }, 420);
                }
            } else {
                jump();
            }
        },
        { passive: true }
    );

    canvas.addEventListener('click', function () {
        if (!running) {
            begin();
        }
    });

    window.addEventListener('pagehide', function () {
        if (rafId) {
            cancelAnimationFrame(rafId);
        }

        try {
            if (actx) {
                actx.close();
            }
        } catch (e) {}
    });
})();
</script>
</body>
</html>`;
}

module.exports = {
    name: 'runner',
    aliases: ['endlessrunner', 'dash', 'dino'],
    description: 'Play an endless dino runner in WhatsApp GenAI',
    usage: '.runner',
    category: 'games',
    cooldown: 5,

    async execute(bot, msg) {
        const sock = bot.sock;
        const from = msg.chat;

        try {
            await sendRichHtml({
                sock,
                jid: from,
                quoted: msg,
                html: runnerHtml()
            });
        } catch (error) {
            console.error(
                '[RUNNER GenAI]',
                error && error.message ? error.message : error
            );

            try {
                await msg.reply(
                    'Runner could not open on this client. Please update WhatsApp or run `.runner` again.'
                );
            } catch (replyError) {
                console.error(
                    '[RUNNER GenAI] fallback reply failed:',
                    replyError && replyError.message
                        ? replyError.message
                        : replyError
                );
            }
        }
    }
};
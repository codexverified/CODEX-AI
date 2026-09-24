'use strict';

/**
 * .tictactoe — Visual Tic-Tac-Toe for WhatsApp GenAI rich messages.
 *
 * Features:
 *  - Choose X or O before the game starts.
 *  - Responsive neon board with animated X/O marks and winning line.
 *  - Three CPU difficulties: Chill, Smart and Unbeatable (minimax).
 *  - Persistent match score and sound preference.
 *  - Synthesized WebAudio feedback; no external assets or network calls.
 *  - Touch, mouse and keyboard support with complete lifecycle cleanup.
 *  - Reload button spins when clicked.
 */

const { sendRichHtml } = require('../../lib/genaiRich');

function tictactoeHtml() {
    return `<!doctype html>
<html lang="en">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">

<style>
* {
    box-sizing: border-box;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
}

html,
body {
    margin: 0;
    background: transparent;
    font-family: Arial, sans-serif;
}

body {
    padding: 6px;
    background: radial-gradient(circle at 50% 5%, #19345d, #070b18 72%);
}

.card {
    position: relative;
    max-width: 340px;
    margin: 0 auto;
    padding: 12px;
    overflow: hidden;
    border: 2px solid #42d8ff;
    border-radius: 20px;
    background: linear-gradient(145deg, #071326, #10294a 52%, #090d1b);
    color: #eafaff;
    box-shadow: inset 0 0 0 3px #12345a, 0 8px 22px #000b;
}

.titlebar {
    display: grid;
    grid-template-columns: 36px 1fr 36px;
    align-items: center;
    min-height: 36px;
}

.title {
    grid-column: 2;
    text-align: center;
    color: #dffaff;
    font: bold 21px "Arial Black", Arial, sans-serif;
    letter-spacing: 1px;
    text-shadow: 0 0 12px #1fc8ff;
}

.iconBtn {
    width: 34px;
    height: 34px;
    padding: 4px;
    border: 1px solid #3475a5;
    border-radius: 8px;
    background: #0b213b;
    color: #dffaff;
    display: grid;
    place-items: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
}

.iconBtn:active {
    transform: scale(.9);
}

.iconBtn svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.sound {
    grid-column: 3;
}

.sub {
    margin: 1px 0 9px;
    text-align: center;
    color: #72b6d6;
    font: 10px monospace;
    letter-spacing: .5px;
}

/* MARK CHOICE */

.markChoice {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 9;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid #2e658e;
    border-radius: 12px;
    background: #0b1f33f2;
    box-shadow: 0 6px 16px #000a, inset 0 0 0 1px #12345a;
    animation: fadeIn .18s ease-out;
}

.markChoice .modalTitle {
    color: #bfe7ff;
    font: bold 10px monospace;
    letter-spacing: .5px;
    white-space: nowrap;
}

.markChoice .markButtons {
    display: flex;
    gap: 6px;
}

.markChoice button {
    width: 34px;
    height: 34px;
    border: 1px solid #2e658e;
    border-radius: 8px;
    background: #061424;
    color: #bfe7ff;
    font: bold 14px Arial, sans-serif;
    cursor: pointer;
    touch-action: manipulation;
    transition: .18s ease;
}

.markChoice button:hover {
    border-color: #42d8ff;
}

.markChoice button:active {
    transform: scale(.92);
}

.markChoice button.active {
    background: #17567a;
    color: #e7fbff;
    box-shadow: inset 0 0 9px #2bcfff55;
}

.markChoice.hidden {
    display: none;
}

/* SCORE */

.scorebar {
    display: grid;
    grid-template-columns: 1fr .75fr 1fr;
    gap: 6px;
    margin-bottom: 8px;
}

.score {
    min-width: 0;
    height: 47px;
    display: grid;
    place-content: center;
    text-align: center;
    border: 1px solid #2b638e;
    border-radius: 8px;
    background: #071526;
}

.score b {
    font: bold 18px monospace;
    line-height: 18px;
}

.score small {
    margin-top: 3px;
    color: #789bb5;
    font: bold 9px monospace;
}

.score.you b {
    color: #54e6ff;
    text-shadow: 0 0 9px #23c8ff;
}

.score.cpu b {
    color: #ff63a8;
    text-shadow: 0 0 9px #ff348c;
}

.score.draw b {
    color: #ffe07a;
    text-shadow: 0 0 9px #f3bd26;
}

/* STATUS */

.status {
    height: 34px;
    margin-bottom: 8px;
    display: grid;
    place-items: center;
    padding: 0 8px;
    border: 1px solid #2b638e;
    border-radius: 8px;
    background: #06111f;
    color: #bceeff;
    text-align: center;
    font: bold 11px monospace;
}

/* BOARD */

.boardWrap {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border: 2px solid #2e82b8;
    border-radius: 13px;
    overflow: hidden;
    background: #030a15;
    box-shadow: inset 0 0 34px #000;
}

.boardGlow {
    position: absolute;
    inset: 0;
    background: radial-gradient(
        circle at 50% 45%,
        #102e50,
        transparent 72%
    );
    pointer-events: none;
}

.board {
    position: absolute;
    inset: 7%;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
}

.cell {
    position: relative;
    min-width: 0;
    min-height: 0;
    border: 0;
    border-radius: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
}

.cell:nth-child(1),
.cell:nth-child(2),
.cell:nth-child(4),
.cell:nth-child(5),
.cell:nth-child(7),
.cell:nth-child(8) {
    border-right: 2px solid #256b99;
}

.cell:nth-child(-n+6) {
    border-bottom: 2px solid #256b99;
}

.cell:not([disabled]):active {
    background: #1a6b8e33;
}

.cell:focus-visible {
    outline: 2px solid #fff;
    outline-offset: -4px;
}

/* MARKS */

.mark {
    position: absolute;
    inset: 17%;
    transform: scale(0);
    opacity: 0;
}

.mark.show {
    animation: markIn .28s cubic-bezier(.2, 1.65, .45, 1) forwards;
}

.mark.x::before,
.mark.x::after {
    content: "";
    position: absolute;
    left: 47%;
    top: 3%;
    width: 9%;
    height: 94%;
    border-radius: 5px;
    background: #56e8ff;
    box-shadow:
        0 0 8px #24d6ff,
        0 0 17px #24d6ff;
}

.mark.x::before {
    transform: rotate(45deg);
}

.mark.x::after {
    transform: rotate(-45deg);
}

.mark.o {
    border: 8px solid #ff62a8;
    border-radius: 50%;
    box-shadow:
        0 0 8px #ff398f,
        inset 0 0 8px #ff398f,
        0 0 17px #ff398f;
}

.cell.win .mark {
    animation: winner .7s ease-in-out infinite alternate;
}

/* WIN LINE */

.winLine {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 5px;
    border-radius: 5px;
    opacity: 0;
    transform-origin: left center;
    background: #fff4a3;
    box-shadow:
        0 0 8px #ffdd43,
        0 0 18px #ffbf00;
    pointer-events: none;
    z-index: 5;
}

.winLine.show {
    opacity: 1;
    animation: lineGrow .36s ease-out forwards;
}

/* RESULT */

.result {
    position: absolute;
    inset: 0;
    z-index: 8;
    display: none;
    place-content: center;
    text-align: center;
    background: #020711d9;
    backdrop-filter: blur(2px);
    cursor: pointer;
}

.result.show {
    display: grid;
    animation: fadeIn .25s ease-out;
}

.result strong {
    color: #fff;
    font: bold 29px "Arial Black", Arial, sans-serif;
    text-shadow: 0 0 13px #36cfff;
}

.result.loss strong {
    color: #ff8aba;
    text-shadow: 0 0 13px #ff398f;
}

.result.draw strong {
    color: #ffe285;
    text-shadow: 0 0 13px #eebc25;
}

.result span {
    margin-top: 7px;
    color: #caeaff;
    font: bold 12px monospace;
}

.result em {
    margin-top: 12px;
    color: #7fdfff;
    font: normal 11px monospace;
    font-style: normal;
}

/* OPTIONS */

.options {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    margin-top: 9px;
}

.segment {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 3px;
    border: 1px solid #2e658e;
    border-radius: 8px;
    background: #061424;
}

.segment button {
    min-width: 0;
    height: 34px;
    padding: 0 3px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #779ab3;
    font: bold 9px monospace;
    cursor: pointer;
    touch-action: manipulation;
}

.segment button.active {
    background: #17567a;
    color: #e7fbff;
    box-shadow: inset 0 0 9px #2bcfff55;
}

.restart {
    width: 30px;
    height: 30px;
    padding: 3px;
}

#restartBtn svg {
    width: 15px;
    height: 15px;
}

/*
 * IMPORTANT:
 * The old :active animation was removed.
 * The JavaScript now adds .spin when the reload button is clicked.
 */
.restart.spin svg {
    animation: restartSpin .55s ease;
}

.hint {
    margin: 7px 0 0;
    text-align: center;
    color: #6f96af;
    font: 9px monospace;
}

/* ANIMATIONS */

@keyframes markIn {
    to {
        transform: scale(1);
        opacity: 1;
    }
}

@keyframes winner {
    from {
        filter: brightness(1);
        transform: scale(1);
    }

    to {
        filter: brightness(1.5);
        transform: scale(1.08);
    }
}

@keyframes lineGrow {
    from {
        width: 0;
    }

    to {
        width: var(--line-length);
    }
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

@keyframes restartSpin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

@media (prefers-reduced-motion: reduce) {
    .mark.show,
    .cell.win .mark,
    .winLine.show,
    .result.show,
    .restart.spin svg {
        animation-duration: .01ms;
        animation-iteration-count: 1;
    }
}

@media (max-width: 360px) {
    .card {
        padding: 9px;
    }

    .title {
        font-size: 19px;
    }

    .mark.o {
        border-width: 7px;
    }
}
</style>
</head>

<body>

<div class="card">

    <div class="titlebar">

        <button
            class="iconBtn home"
            id="homeBtn"
            type="button"
            aria-label="Back to mark selection"
        >
            <svg viewBox="0 0 24 24">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
        </button>

        <div class="title">
            TIC &#10005; TAC &#9711;
        </div>

        <button
            class="iconBtn sound"
            id="soundBtn"
            type="button"
            aria-label="Mute sound"
        >
            <svg id="soundIcon" viewBox="0 0 24 24"></svg>
        </button>

    </div>

    <div class="sub">
        THREE IN A ROW
    </div>

    <!-- PLAYER MARK SELECTION -->

    <div
        class="markChoice"
        id="markChoice"
        aria-label="Choose your mark"
    >

        <div class="modalTitle">CHOOSE&nbsp;MARK</div>

        <div class="markButtons">

            <button
                type="button"
                data-mark="X"
                aria-label="Play as X"
            >
                X
            </button>

            <button
                type="button"
                data-mark="O"
                aria-label="Play as O"
            >
                O
            </button>

        </div>

    </div>

    <div class="scorebar">

        <div class="score you">
            <b id="youScore">0</b>
            <small id="youLabel">YOU &middot; -</small>
        </div>

        <div class="score draw">
            <b id="drawScore">0</b>
            <small>DRAW</small>
        </div>

        <div class="score cpu">
            <b id="cpuScore">0</b>
            <small id="cpuLabel">CPU &middot; -</small>
        </div>

    </div>

    <div
        class="status"
        id="status"
        role="status"
        aria-live="polite"
    >
        Choose X or O to start
    </div>

    <div class="boardWrap">

        <div class="boardGlow"></div>

        <div
            class="board"
            id="board"
            role="grid"
            aria-label="Tic-Tac-Toe board"
        >

            <button class="cell" type="button" data-cell="0" aria-label="Top left"></button>
            <button class="cell" type="button" data-cell="1" aria-label="Top center"></button>
            <button class="cell" type="button" data-cell="2" aria-label="Top right"></button>

            <button class="cell" type="button" data-cell="3" aria-label="Middle left"></button>
            <button class="cell" type="button" data-cell="4" aria-label="Center"></button>
            <button class="cell" type="button" data-cell="5" aria-label="Middle right"></button>

            <button class="cell" type="button" data-cell="6" aria-label="Bottom left"></button>
            <button class="cell" type="button" data-cell="7" aria-label="Bottom center"></button>
            <button class="cell" type="button" data-cell="8" aria-label="Bottom right"></button>

        </div>

        <div
            class="winLine"
            id="winLine"
        ></div>

        <div
            class="result"
            id="result"
            role="button"
            tabindex="0"
            aria-label="Play again"
        >

            <strong id="resultTitle">
                YOU WIN!
            </strong>

            <span id="resultScore">
                THREE IN A ROW
            </span>

            <em>
                TAP &#8635; TO PLAY AGAIN
            </em>

        </div>

    </div>

    <div class="options">

        <div
            class="segment"
            id="difficulty"
            aria-label="Computer difficulty"
        >

            <button
                type="button"
                data-level="chill"
            >
                CHILL
            </button>

            <button
                type="button"
                data-level="smart"
                class="active"
            >
                SMART
            </button>

            <button
                type="button"
                data-level="pro"
            >
                PRO
            </button>

        </div>

        <button
            class="iconBtn restart"
            id="restartBtn"
            type="button"
            aria-label="Restart round"
        >
            <svg id="restartIcon" viewBox="0 0 24 24">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
        </button>

    </div>

    <p class="hint">
        Tap a square
    </p>

</div>

<script>
(function () {

    'use strict';

    var cells = Array.prototype.slice.call(
        document.querySelectorAll('.cell')
    );

    var statusEl = document.getElementById('status');
    var resultEl = document.getElementById('result');
    var resultTitle = document.getElementById('resultTitle');
    var resultScore = document.getElementById('resultScore');
    var winLine = document.getElementById('winLine');
    var restartBtn = document.getElementById('restartBtn');
    var markChoice = document.getElementById('markChoice');
    var difficultyEl = document.getElementById('difficulty');
    var soundBtn = document.getElementById('soundBtn');
    var soundIcon = document.getElementById('soundIcon');
    var homeBtn = document.getElementById('homeBtn');

    var youScore = document.getElementById('youScore');
    var drawScore = document.getElementById('drawScore');
    var cpuScore = document.getElementById('cpuScore');

    var youLabel = document.getElementById('youLabel');
    var cpuLabel = document.getElementById('cpuLabel');

    var wins = [
        [0,1,2],
        [3,4,5],
        [6,7,8],
        [0,3,6],
        [1,4,7],
        [2,5,8],
        [0,4,8],
        [2,4,6]
    ];

    var lineData = [
        {x:16.5,y:16.7,r:0,l:67},
        {x:16.5,y:50,r:0,l:67},
        {x:16.5,y:83.3,r:0,l:67},

        {x:16.7,y:16.5,r:90,l:67},
        {x:50,y:16.5,r:90,l:67},
        {x:83.3,y:16.5,r:90,l:67},

        {x:16,y:16,r:45,l:96},
        {x:84,y:16,r:135,l:96}
    ];

    var board = [];

    var playerMark = '';
    var cpuMark = '';

    var active = false;
    var thinking = false;

    var difficulty =
        safeGet('tttDifficulty') || 'smart';

    var muted =
        safeGet('tttMuted') === '1';

    var score = readScore();

    var cpuTimer = 0;
    var audioCtx = null;


    function safeGet(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }


    function safeSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            /* unavailable */
        }
    }


    function readScore() {

        try {

            var value = JSON.parse(
                safeGet('tttScore') || '{}'
            );

            return {
                you: Number(value.you) || 0,
                cpu: Number(value.cpu) || 0,
                draw: Number(value.draw) || 0
            };

        } catch (e) {

            return {
                you: 0,
                cpu: 0,
                draw: 0
            };

        }
    }


    function saveScore() {

        safeSet(
            'tttScore',
            JSON.stringify(score)
        );

    }


    function renderScore() {

        youScore.textContent = score.you;
        cpuScore.textContent = score.cpu;
        drawScore.textContent = score.draw;

    }


    function audio() {

        if (muted) return null;

        if (!audioCtx) {

            var AudioContext =
                window.AudioContext ||
                window.webkitAudioContext;

            if (!AudioContext) return null;

            audioCtx = new AudioContext();

        }

        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        return audioCtx;
    }


    function tone(
        freq,
        duration,
        type,
        volume,
        delay
    ) {

        var ac = audio();

        if (!ac) return;

        var start =
            ac.currentTime +
            (delay || 0);

        var osc =
            ac.createOscillator();

        var gain =
            ac.createGain();

        osc.type =
            type || 'sine';

        osc.frequency.setValueAtTime(
            freq,
            start
        );

        gain.gain.setValueAtTime(
            0.0001,
            start
        );

        gain.gain.exponentialRampToValueAtTime(
            volume || 0.06,
            start + 0.01
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            start + duration
        );

        osc.connect(gain);
        gain.connect(ac.destination);

        osc.start(start);
        osc.stop(start + duration + 0.02);

    }


    function sound(name) {

        if (name === 'you') {

            tone(540,.09,'sine',.05);
            tone(760,.08,'sine',.035,.05);

        }

        if (name === 'cpu') {

            tone(250,.12,'triangle',.055);

        }

        if (name === 'win') {

            tone(523,.14,'sine',.065);
            tone(659,.14,'sine',.065,.13);
            tone(784,.25,'sine',.07,.26);

        }

        if (name === 'lose') {

            tone(330,.14,'sawtooth',.04);
            tone(245,.2,'sawtooth',.04,.13);

        }

        if (name === 'draw') {

            tone(360,.11,'triangle',.045);
            tone(360,.11,'triangle',.045,.14);

        }

    }


    function renderSound() {

        soundBtn.setAttribute(
            'aria-label',
            muted
                ? 'Unmute sound'
                : 'Mute sound'
        );

        soundIcon.innerHTML = muted

            ? '<path d="M11 5 6 9H3v6h3l5 4V5Z"></path><path d="m16 9 5 6m0-6-5 6"></path>'

            : '<path d="M11 5 6 9H3v6h3l5 4V5Z"></path><path d="M15 9.5a4 4 0 0 1 0 5"></path><path d="M18 7a8 8 0 0 1 0 10"></path>';

    }


    function toggleSound() {

        muted = !muted;

        safeSet(
            'tttMuted',
            muted ? '1' : '0'
        );

        renderSound();

        if (!muted) {
            tone(620,.1,'sine',.05);
        }

    }


    /*
     * Reload button animation.
     *
     * The class is removed first, then added on the next animation frame.
     * This means the animation works every single time the button is clicked.
     */
    var restartIcon = document.getElementById('restartIcon');

    restartIcon.addEventListener('animationend', function () {
        restartBtn.classList.remove('spin');
    });

    function animateRestart() {

        restartBtn.classList.remove('spin');

        void restartBtn.offsetWidth;

        restartBtn.classList.add('spin');

        // Safety net in case animationend doesn't fire on some renderers.
        window.setTimeout(function () {
            restartBtn.classList.remove('spin');
        }, 900);

    }


    function winner(state) {

        for (
            var i = 0;
            i < wins.length;
            i++
        ) {

            var w = wins[i];

            if (
                state[w[0]] &&
                state[w[0]] === state[w[1]] &&
                state[w[0]] === state[w[2]]
            ) {

                return {
                    mark: state[w[0]],
                    combo: w,
                    index: i
                };

            }

        }

        return null;

    }


    function available(state) {

        var out = [];

        for (
            var i = 0;
            i < state.length;
            i++
        ) {

            if (!state[i]) {
                out.push(i);
            }

        }

        return out;

    }


    function randomFrom(items) {

        return items[
            Math.floor(
                Math.random() * items.length
            )
        ];

    }


    function immediateMove(mark) {

        var moves = available(board);

        for (
            var i = 0;
            i < moves.length;
            i++
        ) {

            board[moves[i]] = mark;

            var won = winner(board);

            board[moves[i]] = '';

            if (won) {
                return moves[i];
            }

        }

        return -1;

    }


    function minimax(
        state,
        maximizing,
        depth
    ) {

        var won = winner(state);

        if (won) {

            return won.mark === cpuMark
                ? 10 - depth
                : depth - 10;

        }

        var moves = available(state);

        if (!moves.length) {
            return 0;
        }

        var best =
            maximizing
                ? -100
                : 100;

        for (
            var i = 0;
            i < moves.length;
            i++
        ) {

            state[moves[i]] =
                maximizing
                    ? cpuMark
                    : playerMark;

            var value = minimax(
                state,
                !maximizing,
                depth + 1
            );

            state[moves[i]] = '';

            best = maximizing
                ? Math.max(best, value)
                : Math.min(best, value);

        }

        return best;

    }


    function bestMove() {

        var moves = available(board);

        if (!moves.length) {
            return -1;
        }

        if (difficulty === 'chill') {
            return randomFrom(moves);
        }

        var attack =
            immediateMove(cpuMark);

        if (attack >= 0) {
            return attack;
        }

        var block =
            immediateMove(playerMark);

        if (block >= 0) {
            return block;
        }

        if (difficulty === 'smart') {

            if (Math.random() < .38) {
                return randomFrom(moves);
            }

            var preferred = [
                4,
                0,
                2,
                6,
                8,
                1,
                3,
                5,
                7
            ].filter(function (n) {
                return !board[n];
            });

            return preferred.length
                ? preferred[0]
                : randomFrom(moves);

        }

        var top = -100;
        var choices = [];

        for (
            var i = 0;
            i < moves.length;
            i++
        ) {

            board[moves[i]] = cpuMark;

            var value =
                minimax(
                    board,
                    false,
                    0
                );

            board[moves[i]] = '';

            if (value > top) {

                top = value;
                choices = [moves[i]];

            } else if (value === top) {

                choices.push(moves[i]);

            }

        }

        return randomFrom(choices);

    }


    function paintMark(index, mark) {

        var el =
            document.createElement('span');

        el.className =
            'mark ' +
            mark.toLowerCase();

        cells[index].appendChild(el);

        window.requestAnimationFrame(
            function () {
                el.classList.add('show');
            }
        );

        cells[index].disabled = true;

        cells[index].setAttribute(
            'aria-label',
            cells[index].getAttribute('aria-label') +
            ', ' +
            mark
        );

    }


    function showWinningLine(result) {

        for (
            var i = 0;
            i < result.combo.length;
            i++
        ) {

            cells[
                result.combo[i]
            ].classList.add('win');

        }

        var d =
            lineData[result.index];

        winLine.style.left =
            d.x + '%';

        winLine.style.top =
            d.y + '%';

        winLine.style.transform =
            'rotate(' +
            d.r +
            'deg)';

        winLine.style.setProperty(
            '--line-length',
            d.l + '%'
        );

        winLine.classList.add('show');

    }


    function finish(result) {

        active = false;
        thinking = false;

        for (
            var i = 0;
            i < cells.length;
            i++
        ) {

            cells[i].disabled = true;

        }

        if (result) {

            showWinningLine(result);

            if (
                result.mark === playerMark
            ) {

                score.you++;

                statusEl.textContent =
                    'Brilliant — you won!';

                resultTitle.textContent =
                    'YOU WIN!';

                resultScore.textContent =
                    'THREE IN A ROW';

                resultEl.className =
                    'result show';

                sound('win');

            } else {

                score.cpu++;

                statusEl.textContent =
                    'CPU takes this round';

                resultTitle.textContent =
                    'CPU WINS';

                resultScore.textContent =
                    'TRY ANOTHER LINE';

                resultEl.className =
                    'result loss show';

                sound('lose');

            }

        } else {

            score.draw++;

            statusEl.textContent =
                'Perfectly matched';

            resultTitle.textContent =
                'DRAW';

            resultScore.textContent =
                'BOARD LOCKED';

            resultEl.className =
                'result draw show';

            sound('draw');

        }

        saveScore();
        renderScore();

    }


    function evaluate() {

        var won =
            winner(board);

        if (won) {

            window.setTimeout(
                function () {
                    finish(won);
                },
                180
            );

            return true;

        }

        if (
            !available(board).length
        ) {

            window.setTimeout(
                function () {
                    finish(null);
                },
                180
            );

            return true;

        }

        return false;

    }


    function cpuTurn() {

        if (!active) {
            return;
        }

        var index =
            bestMove();

        if (index < 0) {
            return;
        }

        board[index] =
            cpuMark;

        paintMark(
            index,
            cpuMark
        );

        sound('cpu');

        thinking = false;

        if (!evaluate()) {

            statusEl.textContent =
                'Your turn';

            setCellsEnabled(true);

        }

    }


    function setCellsEnabled(enabled) {

        for (
            var i = 0;
            i < cells.length;
            i++
        ) {

            cells[i].disabled =
                !enabled ||
                !!board[i];

        }

    }


    function play(index) {

        if (
            !active ||
            thinking ||
            board[index]
        ) {
            return;
        }

        audio();

        board[index] =
            playerMark;

        paintMark(
            index,
            playerMark
        );

        sound('you');

        if (evaluate()) {
            return;
        }

        thinking = true;

        setCellsEnabled(false);

        statusEl.textContent =
            'Computer';

        window.clearTimeout(cpuTimer);

        cpuTimer =
            window.setTimeout(
                cpuTurn,
                360 +
                Math.random() * 240
            );

    }


    function reset() {

        window.clearTimeout(cpuTimer);

        board = [
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            ''
        ];

        active = !!playerMark;
        thinking = false;

        resultEl.className =
            'result';

        winLine.className =
            'winLine';

        for (
            var i = 0;
            i < cells.length;
            i++
        ) {

            cells[i].innerHTML = '';

            cells[i].classList.remove(
                'win'
            );

            cells[i].disabled = false;

            var names = [
                'Top left',
                'Top center',
                'Top right',
                'Middle left',
                'Center',
                'Middle right',
                'Bottom left',
                'Bottom center',
                'Bottom right'
            ];

            cells[i].setAttribute(
                'aria-label',
                names[i]
            );

        }

        if (!playerMark) {

            statusEl.textContent =
                'Choose X or O to start';

            setCellsEnabled(false);

            return;

        }

        statusEl.textContent =
            'Your move';

        setCellsEnabled(true);

        /*
         * If player chose O, CPU gets the first move.
         */
        if (playerMark === 'O') {

            thinking = true;

            setCellsEnabled(false);

            statusEl.textContent =
                'Computer starts';

            cpuTimer =
                window.setTimeout(
                    cpuTurn,
                    360
                );

        }

    }


    function setMark(mark) {

        playerMark = mark;

        cpuMark =
            mark === 'X'
                ? 'O'
                : 'X';

        youLabel.textContent =
            'YOU · ' +
            playerMark;

        cpuLabel.textContent =
            'CPU · ' +
            cpuMark;

        var buttons =
            markChoice.querySelectorAll(
                'button'
            );

        for (
            var i = 0;
            i < buttons.length;
            i++
        ) {

            buttons[i].classList.toggle(
                'active',
                buttons[i].getAttribute(
                    'data-mark'
                ) === mark
            );

        }

        /*
         * Hide the X/O selection after
         * the player makes their choice.
         */
        markChoice.classList.add(
            'hidden'
        );

        reset();

    }


    function setDifficulty(level) {

        difficulty = level;

        safeSet(
            'tttDifficulty',
            level
        );

        var buttons =
            difficultyEl.querySelectorAll(
                'button'
            );

        for (
            var i = 0;
            i < buttons.length;
            i++
        ) {

            buttons[i].classList.toggle(
                'active',
                buttons[i].getAttribute(
                    'data-level'
                ) === level
            );

        }

        /*
         * Do not force the player to choose
         * X/O again when difficulty changes.
         */
        reset();

    }


    function onCell(event) {

        play(
            Number(
                event.currentTarget
                    .getAttribute('data-cell')
            )
        );

    }


    for (
        var i = 0;
        i < cells.length;
        i++
    ) {

        cells[i].addEventListener(
            'click',
            onCell
        );

    }


    /*
     * RELOAD BUTTON
     *
     * Spin the actual reload icon every
     * time the button is clicked.
     */
    restartBtn.addEventListener(
        'click',
        function () {

            animateRestart();

            reset();

        }
    );


    soundBtn.addEventListener(
        'click',
        toggleSound
    );


    function goHome() {

        window.clearTimeout(cpuTimer);

        score = { you: 0, cpu: 0, draw: 0 };

        saveScore();
        renderScore();

        playerMark = '';
        cpuMark = '';

        youLabel.textContent = 'YOU · -';
        cpuLabel.textContent = 'CPU · -';

        var buttons = markChoice.querySelectorAll('button');

        for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.remove('active');
        }

        markChoice.classList.remove('hidden');

        reset();

    }


    homeBtn.addEventListener(
        'click',
        goHome
    );


    resultEl.addEventListener(
        'click',
        function () {
            reset();
        }
    );


    resultEl.addEventListener(
        'keydown',
        function (event) {

            if (
                event.key === 'Enter' ||
                event.key === ' '
            ) {

                event.preventDefault();

                reset();

            }

        }
    );


    difficultyEl.addEventListener(
        'click',
        function (event) {

            var level =
                event.target.getAttribute(
                    'data-level'
                );

            if (level) {
                setDifficulty(level);
            }

        }
    );


    markChoice.addEventListener(
        'click',
        function (event) {

            var mark =
                event.target.getAttribute(
                    'data-mark'
                );

            if (mark) {
                setMark(mark);
            }

        }
    );


    function onKey(event) {

        if (
            event.key >= '1' &&
            event.key <= '9'
        ) {

            event.preventDefault();

            play(
                Number(event.key) - 1
            );

        } else if (
            event.key === 'r' ||
            event.key === 'R'
        ) {

            animateRestart();
            reset();

        } else if (
            event.key === 'm' ||
            event.key === 'M'
        ) {

            toggleSound();

        }

    }


    window.addEventListener(
        'keydown',
        onKey
    );


    function teardown() {

        window.clearTimeout(
            cpuTimer
        );

        window.removeEventListener(
            'keydown',
            onKey
        );

        if (
            audioCtx &&
            audioCtx.close
        ) {

            try {
                audioCtx.close();
            } catch (e) {
                /* ignore */
            }

        }

    }


    window.addEventListener(
        'pagehide',
        teardown
    );


    /*
     * INITIAL STATE
     *
     * Important: playerMark starts empty,
     * so the board cannot be played until
     * X or O is selected.
     */
    renderScore();
    renderSound();
    setDifficulty(difficulty);

    playerMark = '';
    cpuMark = '';

    youLabel.textContent =
        'YOU · -';

    cpuLabel.textContent =
        'CPU · -';

    markChoice.classList.remove(
        'hidden'
    );

    reset();

})();
</script>

</body>
</html>`;
}


module.exports = {

    name: 'tictactoe',

    aliases: [
        'ttt',
        'xo',
    ],

    description:
        'Play visual Tic-Tac-Toe against the computer in WhatsApp GenAI',

    usage:
        '.tictactoe',

    category:
        'games',

    cooldown:
        5,


    async execute(bot, msg) {

        const sock =
            bot && bot.sock;

        const from =
            msg && msg.chat;

        if (!sock || !from) {

            console.error(
                '[TICTACTOE GenAI] missing socket or chat context'
            );

            return;
        }

        try {

            await sendRichHtml({
                sock,
                jid: from,
                quoted: msg,
                html: tictactoeHtml()
            });

        } catch (error) {

            console.error(
                '[TICTACTOE GenAI]',
                error &&
                error.message
                    ? error.message
                    : error
            );

            try {

                await msg.reply(
                    'Tic-Tac-Toe could not open on this client. Please update WhatsApp or run `.tictactoe` again.'
                );

            } catch (replyError) {

                console.error(
                    '[TICTACTOE GenAI] fallback reply failed:',
                    replyError &&
                    replyError.message
                        ? replyError.message
                        : replyError
                );

            }

        }

    }

};

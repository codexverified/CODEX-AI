'use strict';

const { sendRichHtml } = require('../../lib/genaiRich');

function snakeHtml() {
    return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
* {
    box-sizing: border-box;
}

html,
body {
    margin: 0;
    background: transparent;
    font-family: Arial, sans-serif;
}

body {
    padding: 6px;
    background: radial-gradient(
        circle at 50% 4%,
        #075985,
        #061323 74%
    );
}

.card {
    padding: 12px;
    border: 2px solid #38bdf8;
    border-radius: 20px;
    background: linear-gradient(
        145deg,
        #06192d,
        #0b3551 54%,
        #061321
    );
    color: #dff6ff;
    box-shadow:
        inset 0 0 0 3px #0b4262,
        0 8px 20px #000b;
}

.title {
    text-align: center;
    color: #b9efff;
    font: bold 23px Arial Black, Arial, sans-serif;
    letter-spacing: 1px;
    text-shadow: 0 0 12px #18bfff;
}

.sub {
    text-align: center;
    margin: 2px 0 8px;
    color: #7fc2df;
    font: 10px monospace;
}

.boardWrap {
    position: relative;
}

.score {
    position: absolute;
    z-index: 2;
    top: 7px;
    left: 0;
    right: 0;
    text-align: center;
    color: #d4ffd7;
    font: bold 13px monospace;
    text-shadow: 0 0 8px #39ff6d;
}

.board {
    display: grid;
    grid-template-columns: repeat(20, 1fr);
    gap: 1px;
    padding: 7px;
    border: 2px solid #24874c;
    border-radius: 13px;
    background: #000;
    box-shadow: inset 0 0 24px #001b09;
}

.cell {
    aspect-ratio: 1;
    background: #020d07;
    box-shadow: inset 0 0 0 1px #0b3019;
}

.cell.snake {
    background: #8cff48;
    box-shadow: 0 0 5px #55ff38;
}

.cell.head {
    background: #c5ff8b;
    box-shadow: 0 0 8px #9dff65;
}

.cell.food {
    background: #8cff48;
    box-shadow: 0 0 8px #55ff38;
}

.message {
    height: 34px;
    margin: 8px 0;
    display: grid;
    place-items: center;
    border: 1px solid #2b8c54;
    border-radius: 8px;
    background: #031008;
    color: #bcffc2;
    font: bold 12px monospace;
}

.controls {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 42px);
    gap: 6px;
    max-width: 260px;
    margin: 0 auto;
}

.controls button {
    width: 100%;
    height: 42px;
    border: 2px solid #238d50;
    border-radius: 11px;
    color: #d8ffe0;
    background: linear-gradient(
        #155e35,
        #07341c
    );
    font-size: 21px;
    font-weight: 900;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
}

.controls button:active {
    transform: scale(.92);
    background: #1b8345;
}

.up {
    grid-column: 2;
    grid-row: 1;
}

.left {
    grid-column: 1;
    grid-row: 2;
}

.reload {
    grid-column: 2;
    grid-row: 2;
    font-size: 24px !important;
}

.right {
    grid-column: 3;
    grid-row: 2;
}

.down {
    grid-column: 2;
    grid-row: 3;
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

    <div class="title">
        🐍 SNAKE
    </div>

    <div class="sub">
        USE THE CONTROLS OR SWIPE THE BOARD
    </div>

    <div class="boardWrap">

        <div class="score">
            SCORE: <span id="score">0</span>
        </div>

        <div
            class="board"
            id="board"
        ></div>

    </div>

    <div
        class="message"
        id="message"
    >
        Tap a control to start
    </div>

    <div class="controls">

        <button
            class="up"
            id="up"
        >
            ▲
        </button>

        <button
            class="left"
            id="left"
        >
            ◀
        </button>

        <button
            class="reload"
            id="reload"
            aria-label="Restart"
        >
            ↻
        </button>

        <button
            class="right"
            id="right"
        >
            ▶
        </button>

        <button
            class="down"
            id="down"
        >
            ▼
        </button>

    </div>

    <div class="hint">
        Eat the green squares · avoid the walls and your tail
    </div>

</div>

<script>
(function () {

    var board = document.getElementById('board');
    var message = document.getElementById('message');
    var scoreEl = document.getElementById('score');

    var cells = [];
    var snake = [];
    var food = null;

    var dir = {
        x: 1,
        y: 0
    };

    var next = {
        x: 1,
        y: 0
    };

    var timer = null;
    var running = false;
    var score = 0;

    var W = 20;
    var H = 20;

    for (var i = 0; i < W * H; i++) {
        var cell = document.createElement('div');

        cell.className = 'cell';

        board.appendChild(cell);
        cells.push(cell);
    }

    function idx(x, y) {
        return y * W + x;
    }

    function clearBoard() {
        cells.forEach(function (cell) {
            cell.className = 'cell';
        });
    }

    function placeFood() {
        var open = [];

        for (var y = 0; y < H; y++) {
            for (var x = 0; x < W; x++) {

                var occupied = snake.some(function (part) {
                    return part.x === x && part.y === y;
                });

                if (!occupied) {
                    open.push({
                        x: x,
                        y: y
                    });
                }
            }
        }

        food = open.length
            ? open[Math.floor(Math.random() * open.length)]
            : null;
    }

    function draw() {
        clearBoard();

        snake.forEach(function (part, index) {

            cells[idx(part.x, part.y)].className =
                'cell snake' +
                (index === 0 ? ' head' : '');

        });

        if (food) {
            cells[idx(food.x, food.y)].className = 'cell food';
        }

        scoreEl.textContent = score;
    }

    function resetIdle() {
        running = false;

        clearInterval(timer);
        timer = null;

        snake = [];
        food = null;
        score = 0;

        dir = {
            x: 1,
            y: 0
        };

        next = {
            x: 1,
            y: 0
        };

        scoreEl.textContent = '0';

        clearBoard();

        message.textContent = 'Tap a control to start';
    }

    function endGame() {
        running = false;

        clearInterval(timer);
        timer = null;

        message.textContent =
            'Game over — score ' +
            score +
            ' · tap ↻ to restart';

        draw();
    }

    function step() {
        if (!running) {
            return;
        }

        dir = next;

        var head = {
            x: snake[0].x + dir.x,
            y: snake[0].y + dir.y
        };

        var hitWall =
            head.x < 0 ||
            head.x >= W ||
            head.y < 0 ||
            head.y >= H;

        var hitTail = snake.some(function (part) {
            return part.x === head.x &&
                   part.y === head.y;
        });

        if (hitWall || hitTail) {
            return endGame();
        }

        snake.unshift(head);

        if (
            food &&
            head.x === food.x &&
            head.y === food.y
        ) {
            score += 10;

            message.textContent = 'Score +10';

            placeFood();
        } else {
            snake.pop();
        }

        draw();
    }

    function start(x, y) {
        clearInterval(timer);

        var cx = Math.floor(W / 2);
        var cy = Math.floor(H / 2);

        dir = {
            x: x,
            y: y
        };

        next = {
            x: x,
            y: y
        };

        snake = [
            {
                x: cx,
                y: cy
            },
            {
                x: cx - x,
                y: cy - y
            },
            {
                x: cx - 2 * x,
                y: cy - 2 * y
            }
        ];

        score = 0;
        running = true;

        placeFood();

        message.textContent =
            'Running — eat the green squares';

        draw();

        timer = setInterval(step, 380);
    }

    function turn(x, y) {

        if (!running) {
            start(x, y);
            return;
        }

        if (
            x !== -dir.x ||
            y !== -dir.y
        ) {
            next = {
                x: x,
                y: y
            };
        }
    }

    document.getElementById('up').onclick = function () {
        turn(0, -1);
    };

    document.getElementById('down').onclick = function () {
        turn(0, 1);
    };

    document.getElementById('left').onclick = function () {
        turn(-1, 0);
    };

    document.getElementById('right').onclick = function () {
        turn(1, 0);
    };

    document.getElementById('reload').onclick = function () {
        resetIdle();
    };

    document.addEventListener('keydown', function (event) {

        if (event.key === 'ArrowUp') {
            turn(0, -1);
        }

        if (event.key === 'ArrowDown') {
            turn(0, 1);
        }

        if (event.key === 'ArrowLeft') {
            turn(-1, 0);
        }

        if (event.key === 'ArrowRight') {
            turn(1, 0);
        }
    });

    var tx = 0;
    var ty = 0;

    board.addEventListener(
        'touchstart',
        function (event) {

            var touch = event.changedTouches[0];

            tx = touch.clientX;
            ty = touch.clientY;

        },
        {
            passive: true
        }
    );

    board.addEventListener(
        'touchend',
        function (event) {

            var touch = event.changedTouches[0];

            var dx = touch.clientX - tx;
            var dy = touch.clientY - ty;

            if (
                Math.max(
                    Math.abs(dx),
                    Math.abs(dy)
                ) < 18
            ) {
                return;
            }

            if (Math.abs(dx) > Math.abs(dy)) {
                turn(
                    dx > 0 ? 1 : -1,
                    0
                );
            } else {
                turn(
                    0,
                    dy > 0 ? 1 : -1
                );
            }

        },
        {
            passive: true
        }
    );

    resetIdle();

})();
</script>

</body>
</html>`;
}

module.exports = {
    name: 'snake',
    aliases: [
        'bluesnake',
        'snakegame'
    ],
    description: 'Play interactive Snake in WhatsApp GenAI',
    usage: '.snake',
    category: 'games',

    async execute(bot, msg, args) {
        const sock = bot.sock;
        const from = msg.chat;

        const reply = (text, options) =>
            msg.reply(text, options);

        try {
            await sendRichHtml({
                sock,
                jid: from,
                quoted: msg,
                html: snakeHtml()
            });
        } catch (error) {
            console.error(
                '[SNAKE GenAI]',
                error.message
            );

            await reply(
                'Snake could not open on this client. Please update WhatsApp or run `.snake` again.'
            );
        }
    }
};
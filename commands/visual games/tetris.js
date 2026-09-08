'use strict';

const { sendRichHtml } = require('../../lib/genaiRich');

function tetrisHtml() {
    return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">

<style>
*{box-sizing:border-box}

html,body{
    margin:0;
    background:transparent;
    font-family:Arial,sans-serif
}

body{
    padding:4px;
    background:
        radial-gradient(circle at 50% 0%,#103d58 0%,#071a2a 48%,#030b13 100%);
    color:#e8f8ff
}

.card{
    width:100%;
    max-width:330px;
    margin:0 auto;
    padding:10px;
    border:1px solid #1c6686;
    border-radius:18px;
    background:linear-gradient(180deg,#0a2538 0%,#061723 100%);
    box-shadow:0 10px 28px #0009,inset 0 1px 0 #ffffff12;
}

.header{
    position:relative;
    min-height:31px;
    display:flex;
    align-items:center;
    justify-content:center;
    margin-bottom:3px
}

.title{
    color:#e9fbff;
    font:bold 21px Arial Black,Arial,sans-serif;
    letter-spacing:2px;
    text-shadow:0 0 14px #22c8ff;
}

.sound{
    position:absolute;
    right:0;
    top:-1px;
    width:30px;
    height:30px;
    padding:3px;
    border:0;
    outline:0;
    background:transparent;
    color:#9bd6e9;
    cursor:pointer;
    display:grid;
    place-items:center;
    -webkit-tap-highlight-color:transparent
}

.sound svg{
    width:22px;
    height:22px;
    fill:none;
    stroke:currentColor;
    stroke-width:2;
    stroke-linecap:round;
    stroke-linejoin:round
}

.sound:active{transform:scale(.88)}

.sub{
    text-align:center;
    margin:0 0 7px;
    color:#6797aa;
    font:9px monospace;
    letter-spacing:.5px
}

.hud{
    display:grid;
    grid-template-columns:1fr 1fr 1fr;
    gap:5px;
    margin:0 auto 7px;
    max-width:260px
}

.hud span{
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    min-height:36px;
    padding:4px 2px;
    border:1px solid #174a60;
    border-radius:9px;
    background:#04121c;
    color:#6f9bab;
    font:bold 8px monospace;
    letter-spacing:.7px
}

.hud b{
    display:block;
    margin-top:1px;
    color:#dffaff;
    font:bold 15px monospace;
    text-shadow:0 0 8px #1ec9ff
}

.gameArea{
    display:flex;
    align-items:flex-start;
    justify-content:center;
    gap:8px;
    position:relative
}

.boardWrap{
    display:flex;
    justify-content:center;
    position:relative
}

canvas#board{
    display:block;
    width:min(100%,200px);
    height:auto;
    aspect-ratio:1/2;
    border:1px solid #237a91;
    border-radius:9px;
    background:#02080d;
    box-shadow:
        0 0 0 2px #061a25,
        inset 0 0 22px #000,
        0 0 18px #00b7ff16;
    touch-action:none
}

.nextBox{
    width:58px;
    min-height:72px;
    padding:7px 4px;
    border:1px solid #1b596f;
    border-radius:11px;
    background:linear-gradient(180deg,#071a26,#041019);
    text-align:center;
    flex:0 0 58px;
    box-shadow:inset 0 1px 0 #ffffff08
}

.nextTitle{
    color:#719bad;
    font:bold 8px monospace;
    letter-spacing:1px;
    margin-bottom:4px
}

canvas#next{
    display:block;
    width:40px;
    height:40px;
    margin:0 auto
}

.gameover,
.pauseOverlay{
    position:absolute;
    inset:1px;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    padding:14px;
    background:rgba(2,8,13,.84);
    opacity:0;
    visibility:hidden;
    pointer-events:none;
    border-radius:8px;
    text-align:center;
    backdrop-filter:blur(2px)
}

.gameover.show,
.pauseOverlay.show{
    visibility:visible;
    animation:overlayIn .35s ease-out forwards
}

.gameoverTitle{
    color:#ff5260;
    font:bold 23px Arial Black,Arial,sans-serif;
    letter-spacing:2px;
    text-align:center;
    text-shadow:0 0 8px #ff3048,0 0 20px #ff304844;
    animation:gameOverPulse 1.1s ease-in-out infinite
}

.gameoverScore{
    margin-top:7px;
    color:#ffdfe2;
    font:bold 13px monospace;
    text-shadow:0 0 8px #ff4050;
    animation:scoreIn .45s ease-out .15s both
}

.gameoverRestart{
    margin-top:13px;
    color:#ff9da5;
    font:bold 10px monospace;
    letter-spacing:.4px;
    text-shadow:0 0 8px #ff4050;
    animation:restartPulse 1.1s ease-in-out infinite
}

.pauseTitle{
    color:#66d9ff;
    font:bold 23px Arial Black,Arial,sans-serif;
    letter-spacing:2px;
    text-align:center;
    text-shadow:0 0 8px #22c8ff,0 0 20px #22c8ff44;
    animation:pausePulse 1.1s ease-in-out infinite
}

.pauseText{
    margin-top:11px;
    color:#8bc7d9;
    font:bold 10px monospace;
    letter-spacing:.4px;
    animation:restartPulse 1.1s ease-in-out infinite
}

@keyframes overlayIn{
    0%{opacity:0;transform:scale(.55)}
    65%{opacity:1;transform:scale(1.04)}
    100%{opacity:1;transform:scale(1)}
}

@keyframes gameOverPulse{
    0%,100%{transform:scale(1);opacity:.88}
    50%{transform:scale(1.06);opacity:1}
}

@keyframes pausePulse{
    0%,100%{transform:scale(1);opacity:.88}
    50%{transform:scale(1.05);opacity:1}
}

@keyframes restartPulse{
    0%,100%{opacity:.65;transform:scale(1)}
    50%{opacity:1;transform:scale(1.04)}
}

@keyframes scoreIn{
    from{opacity:0;transform:translateY(8px)}
    to{opacity:1;transform:translateY(0)}
}

.message{
    height:28px;
    margin:7px 0 6px;
    display:grid;
    place-items:center;
    border:1px solid #174a60;
    border-radius:8px;
    background:#04121b;
    color:#8fc8da;
    font:bold 10px monospace;
    letter-spacing:.3px;
    text-align:center
}

.controls{
    display:grid;
    grid-template-columns:repeat(5,1fr);
    grid-template-rows:42px 48px;
    gap:6px;
    max-width:270px;
    margin:0 auto
}

.controls button{
    width:100%;
    min-height:42px;
    border:1px solid #20677e;
    border-radius:10px;
    color:#dff9ff;
    background:linear-gradient(180deg,#123c51,#092635);
    box-shadow:inset 0 1px 0 #ffffff10,0 3px 8px #0005;
    font-size:19px;
    font-weight:900;
    cursor:pointer;
    -webkit-tap-highlight-color:transparent;
    touch-action:manipulation
}

.controls button:active{
    transform:scale(.93);
    background:#18506a
}

.change{
    grid-column:1;
    grid-row:1;
    font-size:19px!important
}

.pause{
    grid-column:3;
    grid-row:1;
    font-size:18px!important
}

.restart{
    grid-column:5;
    grid-row:1;
    font-size:18px!important
}

.left{
    grid-column:1;
    grid-row:2
}

.down{
    grid-column:3;
    grid-row:2
}

.right{
    grid-column:5;
    grid-row:2
}

.dropBtn{
    display:block;
    width:100%;
    max-width:270px;
    margin:6px auto 0;
    height:40px;
    border:1px solid #2493ae;
    border-radius:10px;
    color:#e9fcff;
    background:linear-gradient(180deg,#126078,#0a3c50);
    box-shadow:inset 0 1px 0 #ffffff12,0 4px 10px #0005;
    font:bold 11px monospace;
    letter-spacing:1.5px;
    cursor:pointer;
    -webkit-tap-highlight-color:transparent;
    touch-action:manipulation
}

.dropBtn:active{
    transform:scale(.97);
    background:#16728e
}

.hint{
    text-align:center;
    margin:6px 0 0;
    color:#527c8d;
    font:8px monospace
}

@media(max-width:360px){
    .card{padding:8px}
    .title{font-size:20px}
    .hud{max-width:250px}
    .hud span{min-height:34px}
    .hud b{font-size:14px}
    .gameArea{gap:5px}
    .nextBox{width:52px;flex-basis:52px;min-height:68px}
    canvas#next{width:36px;height:36px}
    .controls{gap:5px;max-width:255px}
    .controls button{min-height:40px}
    .dropBtn{max-width:255px}
}
</style>
</head>

<body>
<div class="card">

    <div class="header">
        <div class="title">TETRIS</div>

        <button class="sound" id="sound" aria-label="Mute sound">
            <svg id="soundIcon" viewBox="0 0 24 24">
                <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
                <path d="M16 8.5c1.2 1 1.8 2.2 1.8 3.5s-.6 2.5-1.8 3.5"></path>
                <path d="M18.8 5.8c2 1.7 3.2 3.7 3.2 6.2s-1.2 4.5-3.2 6.2"></path>
            </svg>
        </button>
    </div>

    <div class="sub">SWIPE TO PLAY · TAP TO CHANGE</div>

    <div class="hud">
        <span>SCORE <b id="score">0</b></span>
        <span>LEVEL <b id="level">1</b></span>
        <span>LINES <b id="lines">0</b></span>
    </div>

    <div class="gameArea">
        <div class="boardWrap">

            <canvas id="board" width="200" height="400"></canvas>

            <div class="gameover" id="gameover">
                <div class="gameoverTitle">GAME OVER</div>
                <div class="gameoverScore">
                    SCORE: <span id="gameoverScore">0</span>
                </div>
                <div class="gameoverRestart">TAP ↻ TO RESTART</div>
            </div>

            <div class="pauseOverlay" id="pauseOverlay">
                <div class="pauseTitle">PAUSED</div>
                <div class="pauseText">TAP ▶ TO RESUME</div>
            </div>

        </div>

        <div class="nextBox">
            <div class="nextTitle">NEXT</div>
            <canvas id="next" width="40" height="40"></canvas>
        </div>
    </div>

    <div class="message" id="message">
        Tap a control to start
    </div>

    <div class="controls">
        <button class="change" id="change" aria-label="Change block">⇄</button>
        <button class="pause" id="pause" aria-label="Pause">Ⅱ</button>
        <button class="restart" id="restart" aria-label="Restart">↻</button>

        <button class="left" id="left" aria-label="Move left">◀</button>
        <button class="down" id="down" aria-label="Soft drop">▼</button>
        <button class="right" id="right" aria-label="Move right">▶</button>
    </div>

    <button class="dropBtn" id="drop">HARD DROP</button>

    <div class="hint">
        CLEAR FULL ROWS TO SCORE · SPEED RISES EACH LEVEL
    </div>

</div>
</body>
<script>
(function(){

var canvas=document.getElementById('board');
var ctx=canvas.getContext('2d');

var nextCanvas=document.getElementById('next');
var nextCtx=nextCanvas.getContext('2d');

var message=document.getElementById('message');

var scoreEl=document.getElementById('score');
var levelEl=document.getElementById('level');
var linesEl=document.getElementById('lines');

var gameover=document.getElementById('gameover');
var gameoverScore=document.getElementById('gameoverScore');

var pauseOverlay=document.getElementById('pauseOverlay');
var pauseButton=document.getElementById('pause');

var soundButton=document.getElementById('sound');
var soundIcon=document.getElementById('soundIcon');

var COLS=10;
var ROWS=20;
var CELL=20;

var COLORS={
    I:'#38e0ff',
    O:'#ffe14d',
    T:'#c77dff',
    S:'#5dffa3',
    Z:'#ff6b6b',
    J:'#5d8bff',
    L:'#ffa64d'
};

var SHAPES={
    I:[[0,1],[1,1],[2,1],[3,1]],
    O:[[1,0],[2,0],[1,1],[2,1]],
    T:[[1,0],[0,1],[1,1],[2,1]],
    S:[[1,0],[2,0],[0,1],[1,1]],
    Z:[[0,0],[1,0],[1,1],[2,1]],
    J:[[0,0],[0,1],[1,1],[2,1]],
    L:[[2,0],[0,1],[1,1],[2,1]]
};

var board=[];
var current=null;
var nextPiece=null;
var timer=null;

var running=false;
var paused=false;
var countingDown=false;
var countdownTimer=null;

var score=0;
var level=1;
var lines=0;
var dropInterval=800;

var soundEnabled=true;
var audioContext=null;
var backgroundGain=null;
var backgroundOscillator=null;
var backgroundRunning=false;

function emptyBoard(){

    var b=[];

    for(var y=0;y<ROWS;y++){

        var row=[];

        for(var x=0;x<COLS;x++){
            row.push(null);
        }

        b.push(row);
    }

    return b;
}

function getAudio(){

    if(!audioContext){

        var AudioContext=
            window.AudioContext||
            window.webkitAudioContext;

        if(!AudioContext)return null;

        audioContext=new AudioContext();
    }

    if(audioContext.state==='suspended'){
        audioContext.resume().catch(function(){});
    }

    return audioContext;
}

function soundTone(startFreq,endFreq,duration,type,volume,delay){

    if(!soundEnabled)return;

    var c=getAudio();

    if(!c)return;

    var t=c.currentTime+(delay||0);

    var oscillator=c.createOscillator();
    var gain=c.createGain();

    oscillator.type=type||'square';

    oscillator.frequency.setValueAtTime(
        startFreq,
        t
    );

    if(endFreq){

        oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(20,endFreq),
            t+duration
        );
    }

    gain.gain.setValueAtTime(
        0.0001,
        t
    );

    gain.gain.exponentialRampToValueAtTime(
        volume||0.03,
        t+0.008
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        t+duration
    );

    oscillator.connect(gain);
    gain.connect(c.destination);

    oscillator.start(t);

    oscillator.stop(
        t+duration+0.025
    );
}

function noise(duration,volume,delay){

    if(!soundEnabled)return;

    var c=getAudio();

    if(!c)return;

    var length=Math.max(
        1,
        Math.floor(c.sampleRate*duration)
    );

    var buffer=c.createBuffer(
        1,
        length,
        c.sampleRate
    );

    var data=buffer.getChannelData(0);

    for(var i=0;i<length;i++){

        data[i]=
            (Math.random()*2-1)*
            (1-i/length);
    }

    var source=c.createBufferSource();
    var gain=c.createGain();

    var t=c.currentTime+(delay||0);

    source.buffer=buffer;

    gain.gain.setValueAtTime(
        volume||0.025,
        t
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        t+duration
    );

    source.connect(gain);
    gain.connect(c.destination);

    source.start(t);
}

function moveSound(){

    soundTone(
        420,
        300,
        .045,
        'square',
        .018,
        0
    );
}

function dropSound(){

    soundTone(
        300,
        90,
        .09,
        'square',
        .028,
        0
    );

    noise(
        .035,
        .018,
        .01
    );
}

function lockSound(){

    soundTone(
        160,
        90,
        .055,
        'square',
        .022,
        0
    );
}

function changeSound(){

    soundTone(
        300,
        520,
        .055,
        'square',
        .022,
        0
    );

    soundTone(
        520,
        760,
        .065,
        'square',
        .025,
        .055
    );

    soundTone(
        760,
        1040,
        .075,
        'square',
        .018,
        .12
    );
}

function pauseSound(){

    soundTone(
        520,
        390,
        .08,
        'square',
        .025,
        0
    );

    soundTone(
        390,
        260,
        .11,
        'square',
        .022,
        .08
    );
}

function resumeSound(){

    soundTone(
        260,
        390,
        .08,
        'square',
        .022,
        0
    );

    soundTone(
        390,
        520,
        .11,
        'square',
        .025,
        .08
    );
}

function lineSound(count){

    if(count===4){

        soundTone(523,523,.08,'square',.028,0);
        soundTone(659,659,.08,'square',.028,.075);
        soundTone(784,784,.08,'square',.03,.15);
        soundTone(1047,1047,.16,'square',.035,.225);
        soundTone(1319,1319,.18,'triangle',.025,.31);

        noise(
            .09,
            .025,
            .22
        );

    }else{

        soundTone(
            440,
            660,
            .07,
            'square',
            .025,
            0
        );

        soundTone(
            660,
            880,
            .07,
            'square',
            .027,
            .065
        );

        if(count>=2){

            soundTone(
                880,
                1100,
                .08,
                'square',
                .03,
                .13
            );
        }

        if(count>=3){

            soundTone(
                1100,
                1320,
                .1,
                'square',
                .032,
                .205
            );
        }
    }
}

function levelUpSound(){

    soundTone(523,659,.07,'square',.025,0);
    soundTone(659,784,.07,'square',.025,.07);
    soundTone(784,1047,.08,'square',.03,.14);
    soundTone(1047,1319,.14,'square',.035,.22);
}

function startSound(){

    soundTone(392,523,.07,'square',.022,0);
    soundTone(523,659,.07,'square',.025,.07);
    soundTone(659,784,.07,'square',.028,.14);
    soundTone(784,1047,.14,'square',.032,.21);
}

function restartSound(){

    soundTone(784,659,.07,'square',.025,0);
    soundTone(659,523,.07,'square',.025,.07);
    soundTone(523,392,.1,'square',.022,.14);
}

function countdownSound(value){
    if(value==='GO')soundTone(520,900,.16,'square',.04,0);
    else soundTone(330,420,.1,'square',.028,0);
}

function startBackground(){
    if(!soundEnabled||backgroundRunning)return;
    var c=getAudio();
    if(!c)return;
    backgroundGain=c.createGain();
    backgroundOscillator=c.createOscillator();
    backgroundOscillator.type='triangle';
    backgroundOscillator.frequency.value=92;
    backgroundGain.gain.setValueAtTime(.0001,c.currentTime);
    backgroundGain.gain.exponentialRampToValueAtTime(.014,c.currentTime+.4);
    backgroundOscillator.connect(backgroundGain);
    backgroundGain.connect(c.destination);
    backgroundOscillator.start();
    backgroundRunning=true;
}

function stopBackground(){
    if(!backgroundRunning)return;
    var oscillator=backgroundOscillator;
    var c=audioContext;
    if(c&&backgroundGain){
        backgroundGain.gain.cancelScheduledValues(c.currentTime);
        backgroundGain.gain.setValueAtTime(Math.max(backgroundGain.gain.value,.0001),c.currentTime);
        backgroundGain.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.14);
    }
    backgroundOscillator=null;
    backgroundRunning=false;
    setTimeout(function(){try{if(oscillator)oscillator.stop();}catch(error){}},170);
}

function gameOverSound(){

    soundTone(392,330,.12,'sawtooth',.035,0);
    soundTone(330,262,.13,'sawtooth',.035,.11);
    soundTone(262,196,.15,'sawtooth',.038,.23);
    soundTone(196,110,.25,'sawtooth',.042,.37);

    noise(
        .18,
        .035,
        .4
    );
}

function setSoundIcon(){

    if(soundEnabled){

        soundIcon.innerHTML=
            '<path d="M4 9v6h4l5 4V5L8 9H4z"></path>'+
            '<path d="M16 8.5c1.2 1 1.8 2.2 1.8 3.5s-.6 2.5-1.8 3.5"></path>'+
            '<path d="M18.8 5.8c2 1.7 3.2 3.7 3.2 6.2s-1.2 4.5-3.2 6.2"></path>';

        soundButton.setAttribute(
            'aria-label',
            'Mute sound'
        );

    }else{

        soundIcon.innerHTML=
            '<path d="M4 9v6h4l5 4V5L8 9H4z"></path>'+
            '<path d="M17 9l4 6"></path>'+
            '<path d="M21 9l-4 6"></path>';

        soundButton.setAttribute(
            'aria-label',
            'Unmute sound'
        );
    }
}

function randomKey(){

    var keys=Object.keys(SHAPES);

    return keys[
        Math.floor(Math.random()*keys.length)
    ];
}

function makePiece(key){

    var cells=SHAPES[key].map(function(c){

        return {
            x:c[0],
            y:c[1]
        };
    });

    return {
        key:key,
        cells:cells,
        x:3,
        y:-1,
        color:COLORS[key]
    };
}

function randomPiece(){

    return makePiece(randomKey());
}

function cellsAt(piece){

    return piece.cells.map(function(c){

        return {
            x:piece.x+c.x,
            y:piece.y+c.y
        };
    });
}

function collides(piece,offX,offY,cells){

    var testCells=cells||piece.cells;

    for(var i=0;i<testCells.length;i++){

        var x=
            piece.x+
            testCells[i].x+
            (offX||0);

        var y=
            piece.y+
            testCells[i].y+
            (offY||0);

        if(x<0||x>=COLS||y>=ROWS){
            return true;
        }

        if(y>=0&&board[y][x]){
            return true;
        }
    }

    return false;
}

function lockPiece(){

    if(!current)return;

    var cells=cellsAt(current);

    for(var i=0;i<cells.length;i++){

        var c=cells[i];

        if(c.y<0){

            gameOver();

            return;
        }

        board[c.y][c.x]=current.color;
    }

    lockSound();

    clearLines();

    if(running&&!paused){
        spawn();
    }
}

function clearLines(){

    var cleared=0;

    for(var y=ROWS-1;y>=0;y--){

        var full=board[y].every(function(cell){
            return cell;
        });

        if(full){

            board.splice(y,1);

            board.unshift(
                new Array(COLS).fill(null)
            );

            cleared++;

            y++;
        }
    }

    if(!cleared)return;

    var oldLevel=level;

    var points=
        [0,100,300,500,800][cleared]||
        1000;

    score+=points*level;

    lines+=cleared;

    level=1+Math.floor(lines/10);

    dropInterval=
        Math.max(
            120,
            800-(level-1)*70
        );

    scoreEl.textContent=score;
    levelEl.textContent=level;
    linesEl.textContent=lines;

    lineSound(cleared);

    if(level>oldLevel){

        levelUpSound();

        message.textContent=
            'LEVEL '+level;

    }else{

        message.textContent=
            cleared===4?
            'TETRIS!':
            cleared+' LINE'+(cleared>1?'S':'')+' CLEAR';
    }

    setTimeout(function(){

        if(running&&!paused){

            message.textContent=
                'CLEAR LINES TO SCORE';
        }

    },900);

    restartTimer();
}

function spawn(){

    current=nextPiece||randomPiece();

    nextPiece=randomPiece();

    current.x=3;
    current.y=-1;

    drawNext();

    if(collides(current,0,0)){

        gameOver();
    }
}

function getGhost(){

    if(!current)return null;

    var ghost={
        x:current.x,
        y:current.y,
        cells:current.cells
    };

    while(!collides(ghost,0,1)){
        ghost.y++;
    }

    return ghost;
}

function drawBlock(x,y,size,color,alpha){

    if(y<0)return;

    ctx.save();

    ctx.globalAlpha=
        alpha===undefined?1:alpha;

    ctx.fillStyle=color;

    ctx.fillRect(
        x*CELL,
        y*CELL,
        CELL-1,
        CELL-1
    );

    ctx.globalAlpha=.28;

    ctx.fillStyle='#ffffff';

    ctx.fillRect(
        x*CELL+2,
        y*CELL+2,
        CELL-5,
        3
    );

    ctx.fillRect(
        x*CELL+2,
        y*CELL+2,
        3,
        CELL-5
    );

    ctx.restore();
}

function drawNext(){

    nextCtx.clearRect(
        0,
        0,
        nextCanvas.width,
        nextCanvas.height
    );

    nextCtx.fillStyle='#020d07';

    nextCtx.fillRect(
        0,
        0,
        nextCanvas.width,
        nextCanvas.height
    );

    if(!nextPiece)return;

    var cells=nextPiece.cells;

    var minX=Infinity;
    var maxX=-Infinity;
    var minY=Infinity;
    var maxY=-Infinity;

    cells.forEach(function(c){

        minX=Math.min(minX,c.x);
        maxX=Math.max(maxX,c.x);
        minY=Math.min(minY,c.y);
        maxY=Math.max(maxY,c.y);
    });

    var width=maxX-minX+1;
    var height=maxY-minY+1;

    var size=8;

    var ox=
        (40-(width*size))/2-
        minX*size;

    var oy=
        (40-(height*size))/2-
        minY*size;

    cells.forEach(function(c){

        var x=ox+c.x*size;
        var y=oy+c.y*size;

        nextCtx.fillStyle=
            nextPiece.color;

        nextCtx.fillRect(
            x,
            y,
            size-1,
            size-1
        );

        nextCtx.globalAlpha=.28;

        nextCtx.fillStyle='#fff';

        nextCtx.fillRect(
            x+1,
            y+1,
            size-3,
            2
        );

        nextCtx.fillRect(
            x+1,
            y+1,
            2,
            size-3
        );

        nextCtx.globalAlpha=1;
    });
}

function draw(){

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    for(var y=0;y<ROWS;y++){

        for(var x=0;x<COLS;x++){

            if(board[y][x]){

                drawBlock(
                    x,
                    y,
                    CELL,
                    board[y][x],
                    1
                );

            }else{

                ctx.fillStyle='#020d07';

                ctx.fillRect(
                    x*CELL,
                    y*CELL,
                    CELL-1,
                    CELL-1
                );
            }
        }
    }

    if(current){

        var ghost=getGhost();

        if(ghost){

            ghost.cells.forEach(function(c){

                var gx=ghost.x+c.x;
                var gy=ghost.y+c.y;

                if(gy>=0){

                    ctx.save();

                    ctx.globalAlpha=.2;

                    ctx.strokeStyle=
                        current.color;

                    ctx.lineWidth=1.5;

                    ctx.strokeRect(
                        gx*CELL+2,
                        gy*CELL+2,
                        CELL-5,
                        CELL-5
                    );

                    ctx.restore();
                }
            });
        }

        var cells=cellsAt(current);

        cells.forEach(function(c){

            drawBlock(
                c.x,
                c.y,
                CELL,
                current.color,
                1
            );
        });
    }
}

function gameOver(){

    running=false;
    paused=false;
    stopBackground();

    clearInterval(timer);

    timer=null;

    pauseOverlay.classList.remove('show');

    gameoverScore.textContent=score;

    gameover.classList.remove('show');

    void gameover.offsetWidth;

    gameover.classList.add('show');

    message.textContent=
        'TAP ↻ TO RESTART';

    gameOverSound();

    draw();
}

function hideGameOver(){

    gameover.classList.remove('show');
}

function hidePause(){

    pauseOverlay.classList.remove('show');
}

function resetIdle(){

    running=false;
    paused=false;
    countingDown=false;

    if(countdownTimer){
        clearTimeout(countdownTimer);
        countdownTimer=null;
    }

    stopBackground();

    clearInterval(timer);

    timer=null;

    board=emptyBoard();

    current=null;
    nextPiece=null;

    score=0;
    level=1;
    lines=0;

    dropInterval=800;

    scoreEl.textContent='0';
    levelEl.textContent='1';
    linesEl.textContent='0';

    gameoverScore.textContent='0';

    hideGameOver();
    hidePause();

    pauseButton.textContent='Ⅱ';
    pauseButton.setAttribute(
        'aria-label',
        'Pause'
    );

    message.textContent=
        'Tap a control to start';

    drawNext();

    draw();
}

function restartTimer(){

    clearInterval(timer);

    timer=null;

    if(running&&!paused){

        timer=setInterval(
            tick,
            dropInterval
        );
    }
}

function beginGame(){

    if(running)return;

    hideGameOver();
    hidePause();

    paused=false;

    board=emptyBoard();

    score=0;
    level=1;
    lines=0;

    dropInterval=800;

    scoreEl.textContent='0';
    levelEl.textContent='1';
    linesEl.textContent='0';

    nextPiece=randomPiece();

    running=true;

    pauseButton.textContent='Ⅱ';
    pauseButton.setAttribute(
        'aria-label',
        'Pause'
    );

    spawn();

    if(!running)return;

    message.textContent=
        'CLEAR LINES TO SCORE';

    draw();

    startSound();
    startBackground();

    restartTimer();
}

function begin(){
    if(running||countingDown)return;

    countingDown=true;
    message.textContent='GET READY 3';
    var values=['3','2','1','GO'];
    var index=0;

    function next(){
        if(!countingDown)return;
        var value=values[index++];
        message.textContent=value==='GO'?'GO!':'GET READY '+value;
        countdownSound(value);

        if(index<values.length){
            countdownTimer=setTimeout(next,1000);
            return;
        }

        countdownTimer=setTimeout(function(){
            countdownTimer=null;
            countingDown=false;
            beginGame();
        },450);
    }

    next();
}

function restartGame(){

    getAudio();

    restartSound();
    resetIdle();
    begin();
}

function togglePause(){

    if(!running||countingDown)return;

    if(paused){

        paused=false;

        hidePause();

        pauseButton.textContent='Ⅱ';

        pauseButton.setAttribute(
            'aria-label',
            'Pause'
        );

        message.textContent=
            'CLEAR LINES TO SCORE';

        resumeSound();
        startBackground();

        draw();

        restartTimer();

    }else{

        paused=true;

        clearInterval(timer);

        timer=null;

        pauseOverlay.classList.remove('show');

        void pauseOverlay.offsetWidth;

        pauseOverlay.classList.add('show');

        pauseButton.textContent='▶';

        pauseButton.setAttribute(
            'aria-label',
            'Resume'
        );

        message.textContent=
            'GAME PAUSED';

        pauseSound();
        stopBackground();

        draw();
    }
}

function changeBlock(){

    if(!running){

        begin();

        return;
    }

    if(paused||!current)return;

    var oldKey=current.key;

    var newKey=randomKey();

    var attempts=0;

    while(
        newKey===oldKey&&
        attempts<10
    ){

        newKey=randomKey();

        attempts++;
    }

    var replacement=
        makePiece(newKey);

    replacement.x=current.x;
    replacement.y=current.y;

    if(!collides(
        replacement,
        0,
        0
    )){

        current=replacement;

        changeSound();

        message.textContent=
            'BLOCK CHANGED';

        draw();

        setTimeout(function(){

            if(running&&!paused){

                message.textContent=
                    'CLEAR LINES TO SCORE';
            }

        },700);
    }
}

function tick(){

    if(!running||paused||!current)return;

    if(!collides(
        current,
        0,
        1
    )){

        current.y++;

    }else{

        lockPiece();
    }

    draw();
}

function move(dx){

    if(!running){

        begin();

        return;
    }

    if(paused||!current)return;

    if(!collides(
        current,
        dx,
        0
    )){

        current.x+=dx;

        moveSound();

        draw();
    }
}

function softDrop(){

    if(!running){

        begin();

        return;
    }

    if(paused||!current)return;

    if(!collides(
        current,
        0,
        1
    )){

        current.y++;

        score+=1;

        scoreEl.textContent=score;

        draw();

    }else{

        lockPiece();

        draw();
    }
}

function hardDrop(){

    if(!running){

        begin();

        return;
    }

    if(paused||!current)return;

    var dist=0;

    while(!collides(
        current,
        0,
        1
    )){

        current.y++;

        dist++;
    }

    score+=dist*2;

    scoreEl.textContent=score;

    dropSound();

    lockPiece();

    draw();
}

document.getElementById('left').onclick=function(){
    move(-1);
};

document.getElementById('right').onclick=function(){
    move(1);
};

document.getElementById('down').onclick=function(){
    softDrop();
};

document.getElementById('drop').onclick=function(){
    hardDrop();
};

document.getElementById('change').onclick=function(){
    changeBlock();
};

document.getElementById('restart').onclick=function(){
    restartGame();
};

pauseButton.onclick=function(){
    togglePause();
};

soundButton.onclick=function(){

    if(soundEnabled){

        soundEnabled=false;

        setSoundIcon();

    }else{

        soundEnabled=true;

        setSoundIcon();

        getAudio();

        soundTone(
            700,
            900,
            .08,
            'square',
            .03,
            0
        );

        if(running&&!paused)startBackground();
    }

    if(!soundEnabled){
        stopBackground();
    }
};

window.addEventListener('pagehide',function(){
    stopBackground();
    if(audioContext){
        audioContext.close().catch(function(){});
        audioContext=null;
    }
});

document.addEventListener(
    'keydown',
    function(e){

        if(e.key==='ArrowLeft'){

            e.preventDefault();

            move(-1);

        }else if(e.key==='ArrowRight'){

            e.preventDefault();

            move(1);

        }else if(e.key==='ArrowDown'){

            e.preventDefault();

            softDrop();

        }else if(e.key===' '){

            e.preventDefault();

            hardDrop();

        }else if(
            e.key==='c'||
            e.key==='C'
        ){

            e.preventDefault();

            changeBlock();

        }else if(
            e.key==='r'||
            e.key==='R'
        ){

            e.preventDefault();

            restartGame();

        }else if(
            e.key==='p'||
            e.key==='P'
        ){

            e.preventDefault();

            togglePause();
        }
    }
);

var tx=0;
var ty=0;

canvas.addEventListener(
    'touchstart',
    function(e){

        var t=e.changedTouches[0];

        tx=t.clientX;
        ty=t.clientY;
    },
    {passive:true}
);

canvas.addEventListener(
    'touchend',
    function(e){

        if(!running||paused)return;

        var t=e.changedTouches[0];

        var dx=t.clientX-tx;
        var dy=t.clientY-ty;

        if(
            Math.max(
                Math.abs(dx),
                Math.abs(dy)
            )<18
        ){

            changeBlock();

            return;
        }

        if(Math.abs(dx)>Math.abs(dy)){

            move(
                dx>0?1:-1
            );

        }else if(dy>0){

            if(dy>60){

                hardDrop();

            }else{

                softDrop();
            }

        }else{

            changeBlock();
        }
    },
    {passive:true}
);

setSoundIcon();

resetIdle();

})();
</script>

</body>
</html>`;
}

module.exports={
    name:'tetris',
    aliases:['tetrisgame'],
    description:'Play interactive Tetris in WhatsApp GenAI',
    usage:'.tetris',
    category:'games',

    async execute(bot,msg,args){

        const sock=bot.sock;
        const from=msg.chat;

        const reply=(text,options)=>
            msg.reply(text,options);

        try{

            await sendRichHtml({
                sock,
                jid:from,
                quoted:msg,
                html:tetrisHtml()
            });

        }catch(error){

            console.error(
                '[TETRIS GenAI]',
                error.message
            );

            await reply(
                'Tetris could not open on this client. Please update WhatsApp or run `.tetris` again.'
            );
        }
    }
};
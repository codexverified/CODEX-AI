'use strict';

const { sendRichHtml } = require('../../lib/genaiRich');

function snakeHtml() {
    return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">

<style>
*{box-sizing:border-box}
html,body{margin:0;background:transparent;font-family:Arial,sans-serif}
body{padding:6px;background:radial-gradient(circle at 50% 4%,#075985,#061323 74%)}

.card{
    padding:12px;
    border:2px solid #38bdf8;
    border-radius:20px;
    background:linear-gradient(145deg,#06192d,#0b3551 54%,#061321);
    color:#dff6ff;
    box-shadow:inset 0 0 0 3px #0b4262,0 8px 20px #000b
}

.header{
    position:relative;
    min-height:36px;
    display:flex;
    align-items:center;
    justify-content:center
}

.title{
    text-align:center;
    color:#b9efff;
    font:bold 23px Arial Black,Arial,sans-serif;
    letter-spacing:1px;
    text-shadow:0 0 12px #18bfff
}

.sound{
    position:absolute;
    right:1px;
    top:0;
    width:32px;
    height:32px;
    padding:3px;
    border:0;
    outline:0;
    background:transparent;
    color:#d8ffe0;
    cursor:pointer;
    display:grid;
    place-items:center;
    -webkit-tap-highlight-color:transparent
}

.sound svg{
    width:25px;
    height:25px;
    fill:none;
    stroke:currentColor;
    stroke-width:2;
    stroke-linecap:round;
    stroke-linejoin:round
}

.sound:active{
    transform:scale(.88)
}

.sub{
    text-align:center;
    margin:2px 0 8px;
    color:#7fc2df;
    font:10px monospace
}

.boardWrap{
    position:relative
}

.countdown{
    position:absolute;
    z-index:5;
    inset:0;
    display:none;
    place-items:center;
    background:#020b0dcc;
    color:#d8f6ff;
    text-align:center;
    pointer-events:none
}

.countdown.show{
    display:grid
}

.countdownNumber{
    font:bold 58px Arial Black,Arial,sans-serif;
    text-shadow:0 0 18px #22c8ff
}

.score{
    position:absolute;
    z-index:3;
    top:7px;
    left:0;
    right:0;
    text-align:center;
    color:#d4ffd7;
    font:bold 13px monospace;
    text-shadow:0 0 8px #39ff6d
}

.board{
    position:relative;
    display:grid;
    grid-template-columns:repeat(20,1fr);
    gap:1px;
    padding:7px;
    border:2px solid #24874c;
    border-radius:13px;
    background:#000;
    box-shadow:inset 0 0 24px #001b09;
    overflow:hidden
}

.cell{
    aspect-ratio:1;
    background:#020d07;
    box-shadow:inset 0 0 0 1px #0b3019
}

.cell.snake{
    background:#8cff48;
    box-shadow:0 0 5px #55ff38
}

.cell.head{
    background:#c5ff8b;
    box-shadow:0 0 8px #9dff65
}

.cell.food{
    background:#8cff48;
    box-shadow:0 0 8px #55ff38
}

.gameover{
    position:absolute;
    z-index:5;
    inset:0;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    background:rgba(0,8,3,.38);
    opacity:0;
    visibility:hidden;
    pointer-events:none
}

.gameover.show{
    visibility:visible;
    animation:overlayIn .35s ease-out forwards
}

.gameoverTitle{
    color:#ff3030;
    font:bold 26px Arial Black,Arial,sans-serif;
    letter-spacing:2px;
    text-align:center;
    text-shadow:
        0 0 5px #ff0000,
        0 0 12px #ff0000,
        0 0 25px #ff0000;
    animation:gameOverPulse 1.1s ease-in-out infinite
}

.gameoverScore{
    margin-top:5px;
    color:#ffd0d0;
    font:bold 13px monospace;
    text-shadow:0 0 8px #ff2020;
    animation:scoreIn .45s ease-out .15s both
}

@keyframes overlayIn{
    0%{
        opacity:0;
        transform:scale(.55)
    }
    65%{
        opacity:1;
        transform:scale(1.08)
    }
    100%{
        opacity:1;
        transform:scale(1)
    }
}

@keyframes gameOverPulse{
    0%,100%{
        transform:scale(1);
        opacity:.85
    }
    50%{
        transform:scale(1.08);
        opacity:1
    }
}

@keyframes scoreIn{
    from{
        opacity:0;
        transform:translateY(8px)
    }
    to{
        opacity:1;
        transform:translateY(0)
    }
}

.message{
    height:34px;
    margin:8px 0;
    display:grid;
    place-items:center;
    border:1px solid #2b8c54;
    border-radius:8px;
    background:#031008;
    color:#bcffc2;
    font:bold 12px monospace
}

.controls{
    display:grid;
    grid-template-columns:repeat(3,1fr);
    grid-template-rows:repeat(3,42px);
    gap:6px;
    max-width:260px;
    margin:0 auto
}

.controls button{
    width:100%;
    height:42px;
    border:2px solid #238d50;
    border-radius:11px;
    color:#d8ffe0;
    background:linear-gradient(#155e35,#07341c);
    font-size:21px;
    font-weight:900;
    cursor:pointer;
    -webkit-tap-highlight-color:transparent
}

.controls button:active{
    transform:scale(.92);
    background:#1b8345
}

.up{
    grid-column:2;
    grid-row:1
}

.left{
    grid-column:1;
    grid-row:2
}

.reload{
    grid-column:2;
    grid-row:2;
    font-size:24px!important
}

.right{
    grid-column:3;
    grid-row:2
}

.down{
    grid-column:2;
    grid-row:3
}

.hint{
    text-align:center;
    margin:7px 0 0;
    color:#7fc58d;
    font:10px monospace
}

@media(max-width:360px){
    .card{
        padding:9px
    }

    .title{
        font-size:21px
    }

    .gameoverTitle{
        font-size:22px
    }
}
</style>
</head>

<body>
<div class="card">

<div class="header">
<div class="title">🐍 SNAKE</div>

<button class="sound" id="sound" aria-label="Mute sound">
<svg id="soundIcon" viewBox="0 0 24 24">
<path d="M4 9v6h4l5 4V5L8 9H4z"></path>
<path d="M16 8.5c1.2 1 1.8 2.2 1.8 3.5s-.6 2.5-1.8 3.5"></path>
<path d="M18.8 5.8c2 1.7 3.2 3.7 3.2 6.2s-1.2 4.5-3.2 6.2"></path>
</svg>
</button>
</div>

<div class="sub">USE THE CONTROLS OR SWIPE THE BOARD</div>

<div class="boardWrap">

<div class="score">
SCORE: <span id="score">0</span>
</div>

<div class="board" id="board"></div>

<div class="gameover" id="gameover">
<div class="gameoverTitle">GAME OVER</div>
<div class="gameoverScore">SCORE: <span id="gameoverScore">0</span></div>
</div>

<div class="countdown" id="countdown">
<div>
<div class="countdownNumber" id="countdownNumber">3</div>
<div>GET READY</div>
</div>
</div>

</div>

<div class="message" id="message">
Tap a control to start
</div>

<div class="controls">
<button class="up" id="up">▲</button>
<button class="left" id="left">◀</button>
<button class="reload" id="reload" aria-label="Restart">↻</button>
<button class="right" id="right">▶</button>
<button class="down" id="down">▼</button>
</div>

<div class="hint">
Eat the green squares · avoid the walls and your tail
</div>

</div>

<script>
(function(){

var board=document.getElementById('board');
var message=document.getElementById('message');
var scoreEl=document.getElementById('score');
var gameover=document.getElementById('gameover');
var gameoverScore=document.getElementById('gameoverScore');
var countdown=document.getElementById('countdown');
var countdownNumber=document.getElementById('countdownNumber');
var soundButton=document.getElementById('sound');
var soundIcon=document.getElementById('soundIcon');

var cells=[];
var snake=[];
var food=null;

var dir={x:1,y:0};
var next={x:1,y:0};

var timer=null;
var running=false;
var countingDown=false;
var countdownTimer=null;
var score=0;

var W=20;
var H=20;

var soundEnabled=true;
var audioContext=null;
var backgroundGain=null;
var backgroundOscillator=null;
var backgroundRunning=false;

for(var i=0;i<W*H;i++){
    var cell=document.createElement('div');
    cell.className='cell';
    board.appendChild(cell);
    cells.push(cell);
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

function tone(frequency,duration,type,volume,delay){

    if(!soundEnabled)return;

    var ctx=getAudio();

    if(!ctx)return;

    var oscillator=ctx.createOscillator();
    var gain=ctx.createGain();

    oscillator.type=type||'square';

    oscillator.frequency.setValueAtTime(
        frequency,
        ctx.currentTime+(delay||0)
    );

    gain.gain.setValueAtTime(
        0.0001,
        ctx.currentTime+(delay||0)
    );

    gain.gain.exponentialRampToValueAtTime(
        volume||0.04,
        ctx.currentTime+(delay||0)+0.01
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime+(delay||0)+duration
    );

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(
        ctx.currentTime+(delay||0)
    );

    oscillator.stop(
        ctx.currentTime+(delay||0)+duration+0.02
    );
}

function buttonSound(){
    tone(520,.07,'square',.025,0);
}

function eatSound(){
    tone(620,.08,'square',.035,0);
    tone(820,.11,'square',.035,.07);
}

function gameOverSound(){
    tone(440,.13,'sawtooth',.035,0);
    tone(330,.15,'sawtooth',.035,.12);
    tone(220,.22,'sawtooth',.04,.26);
}

function startSound(){
    tone(500,.07,'square',.025,0);
    tone(700,.08,'square',.025,.08);
}

function restartSound(){
    tone(400,.06,'square',.025,0);
    tone(600,.08,'square',.025,.07);
}

function countdownSound(value){
    if(value==='GO')tone(520,.16,'square',.04,0);
    else tone(330,.1,'square',.028,0);
}

function startBackground(){
    if(!soundEnabled||backgroundRunning)return;

    var ctx=getAudio();
    if(!ctx)return;

    backgroundGain=ctx.createGain();
    backgroundOscillator=ctx.createOscillator();
    backgroundOscillator.type='triangle';
    backgroundOscillator.frequency.value=110;
    backgroundGain.gain.setValueAtTime(.0001,ctx.currentTime);
    backgroundGain.gain.exponentialRampToValueAtTime(.012,ctx.currentTime+.35);
    backgroundOscillator.connect(backgroundGain);
    backgroundGain.connect(ctx.destination);
    backgroundOscillator.start();
    backgroundRunning=true;
}

function stopBackground(){
    if(!backgroundRunning)return;

    var oscillator=backgroundOscillator;
    var ctx=audioContext;
    if(ctx&&backgroundGain){
        backgroundGain.gain.cancelScheduledValues(ctx.currentTime);
        backgroundGain.gain.setValueAtTime(Math.max(backgroundGain.gain.value,.0001),ctx.currentTime);
        backgroundGain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.12);
    }
    backgroundOscillator=null;
    backgroundRunning=false;
    setTimeout(function(){try{if(oscillator)oscillator.stop();}catch(error){}},150);
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

function idx(x,y){
    return y*W+x;
}

function clearBoard(){

    cells.forEach(function(cell){
        cell.className='cell';
    });
}

function placeFood(){

    var open=[];

    for(var y=0;y<H;y++){

        for(var x=0;x<W;x++){

            var occupied=snake.some(function(part){
                return part.x===x&&part.y===y;
            });

            if(!occupied){
                open.push({x:x,y:y});
            }
        }
    }

    food=open.length
        ?open[Math.floor(Math.random()*open.length)]
        :null;
}

function draw(){

    clearBoard();

    snake.forEach(function(part,index){

        cells[idx(part.x,part.y)].className=
            'cell snake'+
            (index===0?' head':'');
    });

    if(food){
        cells[idx(food.x,food.y)].className=
            'cell food';
    }

    scoreEl.textContent=score;
}

function hideGameOver(){

    gameover.classList.remove('show');
}

function showGameOver(){

    gameoverScore.textContent=score;

    gameover.classList.remove('show');

    void gameover.offsetWidth;

    gameover.classList.add('show');
}

function resetIdle(){

    running=false;
    countingDown=false;

    if(countdownTimer){
        clearTimeout(countdownTimer);
        countdownTimer=null;
    }

    countdown.classList.remove('show');
    stopBackground();

    clearInterval(timer);
    timer=null;

    snake=[];
    food=null;

    score=0;

    dir={x:1,y:0};
    next={x:1,y:0};

    scoreEl.textContent='0';
    gameoverScore.textContent='0';

    hideGameOver();

    clearBoard();

    message.textContent='Tap a control to start';
}

function endGame(){

    running=false;
    stopBackground();

    clearInterval(timer);
    timer=null;

    showGameOver();

    gameOverSound();

    draw();
}

function step(){

    if(!running)return;

    dir=next;

    var head={
        x:snake[0].x+dir.x,
        y:snake[0].y+dir.y
    };

    var hitWall=
        head.x<0||
        head.x>=W||
        head.y<0||
        head.y>=H;

    var hitTail=snake.some(function(part){
        return part.x===head.x&&part.y===head.y;
    });

    if(hitWall||hitTail){

        endGame();

        return;
    }

    snake.unshift(head);

    if(
        food&&
        head.x===food.x&&
        head.y===food.y
    ){

        score+=10;

        eatSound();

        placeFood();

    }else{

        snake.pop();
    }

    draw();
}

function start(x,y){

    clearInterval(timer);

    hideGameOver();

    var cx=Math.floor(W/2);
    var cy=Math.floor(H/2);

    dir={x:x,y:y};
    next={x:x,y:y};

    snake=[
        {x:cx,y:cy},
        {x:cx-x,y:cy-y},
        {x:cx-2*x,y:cy-2*y}
    ];

    score=0;

    running=true;

    placeFood();

    message.textContent='Tap a control to start';

    draw();

    startSound();
    startBackground();

    timer=setInterval(step,380);
}

function startCountdown(x,y){
    if(running||countingDown)return;

    countingDown=true;
    countdown.classList.add('show');
    var values=['3','2','1','GO'];
    var index=0;

    function next(){
        if(!countingDown)return;
        var value=values[index++];
        countdownNumber.textContent=value;
        countdownSound(value);

        if(index<values.length){
            countdownTimer=setTimeout(next,1000);
            return;
        }

        countdownTimer=setTimeout(function(){
            countingDown=false;
            countdownTimer=null;
            countdown.classList.remove('show');
            start(x,y);
        },500);
    }

    next();
}

function turn(x,y){

    if(!running){
        startCountdown(x,y);

        return;
    }

    if(countingDown)return;

    if(x!==-dir.x||y!==-dir.y){

        next={x:x,y:y};

        buttonSound();
    }
}

document.getElementById('up').onclick=function(){
    turn(0,-1);
};

document.getElementById('down').onclick=function(){
    turn(0,1);
};

document.getElementById('left').onclick=function(){
    turn(-1,0);
};

document.getElementById('right').onclick=function(){
    turn(1,0);
};

document.getElementById('reload').onclick=function(){

    getAudio();

    restartSound();

    resetIdle();
};

soundButton.onclick=function(){

    if(soundEnabled){

        soundEnabled=false;

        stopBackground();

        setSoundIcon();

    }else{

        soundEnabled=true;

        setSoundIcon();

        getAudio();

        tone(700,.08,'square',.03,0);
        if(running)startBackground();
    }
};

window.addEventListener('pagehide',function(){
    stopBackground();
    if(audioContext){audioContext.close().catch(function(){});audioContext=null;}
});

document.addEventListener('keydown',function(event){

    if(event.key==='ArrowUp'){

        event.preventDefault();
        turn(0,-1);
    }

    if(event.key==='ArrowDown'){

        event.preventDefault();
        turn(0,1);
    }

    if(event.key==='ArrowLeft'){

        event.preventDefault();
        turn(-1,0);
    }

    if(event.key==='ArrowRight'){

        event.preventDefault();
        turn(1,0);
    }
});

var tx=0;
var ty=0;

board.addEventListener(
    'touchstart',
    function(event){

        var touch=event.changedTouches[0];

        tx=touch.clientX;
        ty=touch.clientY;

    },
    {passive:true}
);

board.addEventListener(
    'touchend',
    function(event){

        var touch=event.changedTouches[0];

        var dx=touch.clientX-tx;
        var dy=touch.clientY-ty;

        if(
            Math.max(
                Math.abs(dx),
                Math.abs(dy)
            )<18
        )return;

        if(Math.abs(dx)>Math.abs(dy)){

            turn(dx>0?1:-1,0);

        }else{

            turn(0,dy>0?1:-1);
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
    name:'snake',
    aliases:['bluesnake','snakegame'],
    description:'Play interactive Snake in WhatsApp GenAI',
    usage:'.snake',
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
                html:snakeHtml()
            });

        }catch(error){

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
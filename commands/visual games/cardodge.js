'use strict';

const { sendRichHtml } = require('../../lib/genaiRich');

function carDodgeHtml() {
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
    color:#edf8ff;
    background:radial-gradient(circle at 50% 0%,#254b64 0%,#0a1928 48%,#02070d 100%)
}

.card{
    width:100%;
    max-width:330px;
    margin:0 auto;
    padding:10px;
    border:1px solid #41738b;
    border-radius:18px;
    background:linear-gradient(180deg,#132a39,#06111b);
    box-shadow:0 10px 28px #0009,inset 0 1px 0 #ffffff18
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
    color:#f1fbff;
    font:bold 20px Arial Black,Arial,sans-serif;
    letter-spacing:1.5px;
    text-shadow:0 0 14px #43d8ff
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
    margin:0 0 7px;
    color:#86aebb;
    text-align:center;
    font:9px monospace;
    letter-spacing:.4px
}

.hud{
    display:grid;
    grid-template-columns:1fr 1fr 1fr;
    gap:5px;
    max-width:270px;
    margin:0 auto 7px
}

.hud span{
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    min-height:36px;
    padding:4px 2px;
    border:1px solid #315b6f;
    border-radius:9px;
    background:#06131d;
    color:#82a9b8;
    font:bold 8px monospace;
    letter-spacing:.6px
}

.hud b{
    display:block;
    margin-top:2px;
    color:#e7fbff;
    font:bold 15px monospace;
    text-shadow:0 0 8px #2ad3ff
}

.roadWrap{
    position:relative;
    width:min(100%,230px);
    margin:0 auto;
    overflow:hidden;
    border:2px solid #4a778b;
    border-radius:12px;
    background:#111;
    box-shadow:0 0 0 2px #07141e,inset 0 0 22px #000,0 0 18px #00b7ff18
}

canvas#road{
    display:block;
    width:100%;
    height:auto;
    aspect-ratio:230/360;
    touch-action:none
}

.overlay{
    position:absolute;
    inset:0;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    padding:14px;
    background:rgba(2,8,13,.82);
    opacity:0;
    visibility:hidden;
    pointer-events:none;
    text-align:center
}

.overlay.show{
    opacity:1;
    visibility:visible
}

.gameoverTitle{
    color:#ff5d67;
    font:bold 23px Arial Black,Arial,sans-serif;
    letter-spacing:2px;
    text-shadow:0 0 8px #ff3048,0 0 20px #ff304844;
    animation:pulse 1.1s ease-in-out infinite
}

.gameoverScore{
    margin-top:7px;
    color:#ffdfe2;
    font:bold 13px monospace;
    text-shadow:0 0 8px #ff4050
}

.gameoverHint,
.pauseText{
    margin-top:13px;
    color:#9bd6e9;
    font:bold 10px monospace;
    letter-spacing:.4px;
    animation:hintPulse 1.1s ease-in-out infinite
}

.pauseTitle{
    color:#6cddff;
    font:bold 23px Arial Black,Arial,sans-serif;
    letter-spacing:2px;
    text-shadow:0 0 8px #22c8ff
}

.countdownNumber{
    color:#fff4a9;
    font:bold 76px Arial Black,Arial,sans-serif;
    line-height:1;
    text-shadow:0 0 10px #ffb31e,0 0 30px #ff7200;
    animation:countPop .66s ease-out infinite
}

.countdownText{
    margin-top:10px;
    color:#b9edff;
    font:bold 11px monospace;
    letter-spacing:2px
}

@keyframes pulse{
    0%,100%{transform:scale(1);opacity:.86}
    50%{transform:scale(1.06);opacity:1}
}

@keyframes hintPulse{
    0%,100%{opacity:.62}
    50%{opacity:1}
}

@keyframes countPop{
    0%{transform:scale(.42);opacity:0}
    45%{transform:scale(1.16);opacity:1}
    100%{transform:scale(1);opacity:.92}
}

.message{
    height:28px;
    margin:7px 0 6px;
    display:grid;
    place-items:center;
    border:1px solid #315b6f;
    border-radius:8px;
    background:#06131d;
    color:#9ed8e9;
    font:bold 10px monospace;
    text-align:center
}

.controls{
    display:grid;
    grid-template-columns:repeat(6,1fr);
    grid-template-rows:42px 48px;
    gap:6px;
    max-width:270px;
    margin:0 auto
}

.controls button{
    width:100%;
    min-height:42px;
    border:1px solid #3b7188;
    border-radius:10px;
    color:#e2faff;
    background:linear-gradient(180deg,#1b4356,#0a2635);
    box-shadow:inset 0 1px 0 #ffffff16,0 3px 8px #0005;
    font-size:19px;
    font-weight:900;
    cursor:pointer;
    -webkit-tap-highlight-color:transparent;
    touch-action:manipulation
}

.controls button:active:not(:disabled){
    transform:scale(.93);
    background:#225d74
}

.controls button:disabled{
    opacity:.30;
    cursor:not-allowed;
    filter:saturate(.3)
}

.pause{
    grid-column:2 / span 2;
    grid-row:1;
    font-size:17px!important
}

.restart{
    grid-column:4 / span 2;
    grid-row:1;
    font-size:18px!important
}

.left{
    grid-column:1 / span 2;
    grid-row:2
}

.boost{
    grid-column:3;
    grid-row:2;
    color:#fff4ba!important;
    border-color:#a8893c!important;
    background:linear-gradient(180deg,#735916,#3d2b06)!important;
    font-size:10px!important;
    letter-spacing:.1px
}

.jump{
    grid-column:4;
    grid-row:2;
    color:#ffe3f1!important;
    border-color:#b25484!important;
    background:linear-gradient(180deg,#7c2455,#3e0b28)!important;
    font-size:10px!important;
    letter-spacing:.1px
}

.right{
    grid-column:5 / span 2;
    grid-row:2
}

.hint{
    margin:7px 0 0;
    color:#648e9d;
    text-align:center;
    font:8px monospace
}

@media(max-width:360px){
    .card{padding:8px}
    .title{font-size:18px}
    .roadWrap{width:218px}
    .controls{gap:5px;max-width:255px}
    .controls button{min-height:40px}
}
</style>
</head>

<body>
<div class="card">

    <div class="header">
        <div class="title">CAR DODGE</div>

        <button class="sound" id="sound" aria-label="Mute sound">
            <svg id="soundIcon" viewBox="0 0 24 24">
                <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
                <path d="M16 8.5c1.2 1 1.8 2.2 1.8 3.5s-.6 2.5-1.8 3.5"></path>
                <path d="M18.8 5.8c2 1.7 3.2 3.7 3.2 6.2s-1.2 4.5-3.2 6.2"></path>
            </svg>
        </button>
    </div>

    <div class="sub">DODGE TRAFFIC · JUMP IN EMERGENCIES</div>

    <div class="hud">
        <span>SCORE <b id="score">0</b></span>
        <span>BEST <b id="best">0</b></span>
        <span>SPEED <b id="speed">1</b></span>
    </div>

    <div class="roadWrap">
        <canvas id="road" width="230" height="360"></canvas>

        <div class="overlay" id="gameover">
            <div class="gameoverTitle">CRASHED</div>
            <div class="gameoverScore">SCORE: <span id="gameoverScore">0</span></div>
            <div class="gameoverHint">TAP ↻ TO DRIVE AGAIN</div>
        </div>

        <div class="overlay" id="pauseOverlay">
            <div class="pauseTitle">PAUSED</div>
            <div class="pauseText">TAP ▶ TO RESUME</div>
        </div>

        <div class="overlay" id="countdownOverlay">
            <div class="countdownNumber" id="countdownNumber">3</div>
            <div class="countdownText" id="countdownText">GET READY</div>
        </div>
    </div>

    <div class="message" id="message">Tap START to begin</div>

    <div class="controls">
        <button class="pause" id="pause" aria-label="Pause">Ⅱ</button>
        <button class="restart" id="restart" aria-label="Restart">↻</button>

        <button class="left" id="left" aria-label="Move left">◀</button>
        <button class="boost" id="boost" aria-label="Start game">START</button>
        <button class="jump" id="jump" aria-label="Jump over traffic">JUMP</button>
        <button class="right" id="right" aria-label="Move right">▶</button>
    </div>

    <div class="hint">
        SWIPE LEFT/RIGHT · TAP ROAD TO BOOST · UP OR J TO JUMP
    </div>
</div>

<script>
(function(){

    var canvas=document.getElementById('road');
    var ctx=canvas.getContext('2d');

    var scoreEl=document.getElementById('score');
    var bestEl=document.getElementById('best');
    var speedEl=document.getElementById('speed');
    var message=document.getElementById('message');

    var gameover=document.getElementById('gameover');
    var gameoverScore=document.getElementById('gameoverScore');
    var pauseOverlay=document.getElementById('pauseOverlay');
    var countdownOverlay=document.getElementById('countdownOverlay');
    var countdownNumber=document.getElementById('countdownNumber');
    var countdownText=document.getElementById('countdownText');

    var pauseButton=document.getElementById('pause');
    var restartButton=document.getElementById('restart');
    var leftButton=document.getElementById('left');
    var rightButton=document.getElementById('right');
    var boostButton=document.getElementById('boost');
    var jumpButton=document.getElementById('jump');
    var soundButton=document.getElementById('sound');
    var soundIcon=document.getElementById('soundIcon');

    var W=230;
    var H=360;
    var ROAD_LEFT=22;
    var ROAD_RIGHT=208;
    var ROAD_WIDTH=ROAD_RIGHT-ROAD_LEFT;
    var LANE_WIDTH=ROAD_WIDTH/3;

    var player=null;
    var traffic=[];
    var particles=[];
    var smoke=[];
    var flames=[];

    var running=false;
    var paused=false;
    var crashed=false;
    var countingDown=false;

    var animationId=null;
    var countdownTimer=null;
    var lastTime=0;

    var score=0;
    var best=0;
    var level=1;
    var elapsed=0;
    var roadOffset=0;
    var spawnTimer=0;
    var boostTimer=0;
    var boostCooldown=0;
    var jumpTimer=0;
    var jumpCooldown=0;
    var shakeTimer=0;

    var BOOST_DURATION=1.25;
    var BOOST_COOLDOWN=4;
    var JUMP_DURATION=.72;
    var JUMP_COOLDOWN=4.5;

    var soundEnabled=true;
    var audioContext=null;

    try{
        best=Number(localStorage.getItem('carDodgeBest'))||0;
    }catch(error){
        best=0;
    }

    bestEl.textContent=best;

    function getAudio(){
        if(!audioContext){
            var AudioContext=window.AudioContext||window.webkitAudioContext;
            if(!AudioContext)return null;
            audioContext=new AudioContext();
        }

        if(audioContext.state==='suspended'){
            audioContext.resume().catch(function(){});
        }

        return audioContext;
    }

    function tone(start,end,duration,type,volume,delay){
        if(!soundEnabled)return;

        var audio=getAudio();
        if(!audio)return;

        var time=audio.currentTime+(delay||0);
        var oscillator=audio.createOscillator();
        var gain=audio.createGain();

        oscillator.type=type||'square';
        oscillator.frequency.setValueAtTime(start,time);

        if(end){
            oscillator.frequency.exponentialRampToValueAtTime(
                Math.max(20,end),
                time+duration
            );
        }

        gain.gain.setValueAtTime(.0001,time);
        gain.gain.exponentialRampToValueAtTime(volume||.025,time+.01);
        gain.gain.exponentialRampToValueAtTime(.0001,time+duration);

        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(time);
        oscillator.stop(time+duration+.03);
    }

    function noise(duration,volume){
        if(!soundEnabled)return;

        var audio=getAudio();
        if(!audio)return;

        var length=Math.floor(audio.sampleRate*duration);
        var buffer=audio.createBuffer(1,length,audio.sampleRate);
        var data=buffer.getChannelData(0);

        for(var i=0;i<length;i++){
            data[i]=(Math.random()*2-1)*(1-i/length);
        }

        var source=audio.createBufferSource();
        var gain=audio.createGain();

        source.buffer=buffer;
        gain.gain.setValueAtTime(volume||.03,audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);

        source.connect(gain);
        gain.connect(audio.destination);
        source.start();
    }

    function moveSound(){tone(370,300,.045,'square',.018,0)}
    function startSound(){
        tone(400,530,.07,'square',.022,0);
        tone(530,680,.08,'square',.025,.07);
        tone(680,850,.1,'square',.028,.14);
    }

    function countdownSound(number){
        if(number==='GO'){
            tone(520,900,.20,'square',.045,0);
        }else{
            tone(330,420,.10,'square',.028,0);
        }
    }

    function boostSound(){tone(220,820,.18,'sawtooth',.025,0)}
    function jumpSound(){
        tone(420,980,.15,'square',.03,0);
        tone(900,620,.13,'triangle',.02,.14);
    }

    function crashSound(){
        tone(250,70,.28,'sawtooth',.05,0);
        tone(180,55,.32,'sawtooth',.04,.13);
        noise(.22,.07);
    }

    function setSoundIcon(){
        if(soundEnabled){
            soundIcon.innerHTML=
                '<path d="M4 9v6h4l5 4V5L8 9H4z"></path>'+
                '<path d="M16 8.5c1.2 1 1.8 2.2 1.8 3.5s-.6 2.5-1.8 3.5"></path>'+
                '<path d="M18.8 5.8c2 1.7 3.2 3.7 3.2 6.2s-1.2 4.5-3.2 6.2"></path>';
        }else{
            soundIcon.innerHTML=
                '<path d="M4 9v6h4l5 4V5L8 9H4z"></path>'+
                '<path d="M17 9l4 6"></path>'+
                '<path d="M21 9l-4 6"></path>';
        }
    }

    function laneX(lane){
        return ROAD_LEFT+lane*LANE_WIDTH+LANE_WIDTH/2;
    }

    function makePlayer(){
        return {
            lane:1,
            targetLane:1,
            x:laneX(1),
            y:H-71,
            width:33,
            height:59,
            color:'#27c8ff'
        };
    }

    function randomColor(){
        var colors=['#ff4c57','#ffc94d','#a868ff','#51d981','#ff8a4d','#eb5ca8'];
        return colors[Math.floor(Math.random()*colors.length)];
    }

    function controlsLocked(){
        return crashed||countingDown;
    }

    function canDrive(){
        return running&&!paused&&!crashed&&!countingDown;
    }

    function updateControls(){
        var locked=controlsLocked();

        leftButton.disabled=locked;
        rightButton.disabled=locked;
        boostButton.disabled=locked;
        jumpButton.disabled=locked;
        pauseButton.disabled=locked;
        soundButton.disabled=false;

        restartButton.disabled=false;

        if(crashed||countingDown){
            return;
        }

        if(!running){
            boostButton.textContent='START';
            boostButton.setAttribute('aria-label','Start game');
        }else if(boostTimer>0){
            boostButton.textContent='BOOST';
        }else if(boostCooldown>0){
            boostButton.textContent=Math.ceil(boostCooldown)+'s';
            boostButton.disabled=true;
        }else{
            boostButton.textContent='BOOST';
            boostButton.setAttribute('aria-label','Boost');
        }

        if(!running){
            jumpButton.textContent='JUMP';
            jumpButton.disabled=false;
        }else if(jumpTimer>0){
            jumpButton.textContent='AIR';
            jumpButton.disabled=true;
        }else if(jumpCooldown>0){
            jumpButton.textContent=Math.ceil(jumpCooldown)+'s';
            jumpButton.disabled=true;
        }else{
            jumpButton.textContent='JUMP';
            jumpButton.disabled=false;
        }
    }

    function spawnCar(){
        var lanes=[0,1,2];

        traffic.forEach(function(car){
            if(car.y<92){
                var index=lanes.indexOf(car.lane);
                if(index!==-1)lanes.splice(index,1);
            }
        });

        if(!lanes.length)return;

        var lane=lanes[Math.floor(Math.random()*lanes.length)];

        traffic.push({
            lane:lane,
            x:laneX(lane),
            y:-70,
            width:32,
            height:58,
            color:randomColor(),
            speed:150+level*23+Math.random()*42
        });
    }

    function drawRoad(){
        ctx.fillStyle='#1a442c';
        ctx.fillRect(0,0,W,H);

        ctx.fillStyle='#202126';
        ctx.fillRect(ROAD_LEFT,0,ROAD_WIDTH,H);

        ctx.fillStyle='#d7d2a8';
        ctx.fillRect(ROAD_LEFT-3,0,3,H);
        ctx.fillRect(ROAD_RIGHT,0,3,H);

        for(var lane=1;lane<3;lane++){
            var x=ROAD_LEFT+lane*LANE_WIDTH;

            for(var y=-30+roadOffset;y<H;y+=48){
                ctx.fillStyle='#f1ebbf';
                ctx.fillRect(x-2,y,4,25);
            }
        }

        for(var i=0;i<14;i++){
            var grassY=(i*30+roadOffset*.6)%H;
            ctx.fillStyle='#58784c';
            ctx.fillRect(6,grassY,8,3);
            ctx.fillRect(W-14,grassY+11,8,3);
        }
    }

    function drawCar(car,isPlayer){
        var lift=0;

        if(isPlayer&&jumpTimer>0){
            var progress=1-jumpTimer/JUMP_DURATION;
            lift=Math.sin(progress*Math.PI)*47;
        }

        var x=car.x-car.width/2;
        var y=car.y-lift;

        ctx.save();

        if(isPlayer){
            ctx.globalAlpha=jumpTimer>0?.3:.17;
            ctx.fillStyle='#000';
            ctx.beginPath();
            ctx.ellipse(car.x,car.y+car.height-3,car.width*.64,7,0,0,Math.PI*2);
            ctx.fill();
            ctx.globalAlpha=1;
        }

        if(isPlayer&&boostTimer>0){
            ctx.shadowColor='#ffd54d';
            ctx.shadowBlur=17;
        }

        if(isPlayer&&jumpTimer>0){
            ctx.shadowColor='#ff75bc';
            ctx.shadowBlur=18;
        }

        ctx.fillStyle='#090a0d';
        ctx.fillRect(x-3,y+9,4,15);
        ctx.fillRect(x+car.width-1,y+9,4,15);
        ctx.fillRect(x-3,y+car.height-24,4,15);
        ctx.fillRect(x+car.width-1,y+car.height-24,4,15);

        ctx.fillStyle=car.color;
        ctx.beginPath();
        ctx.moveTo(x+7,y);
        ctx.lineTo(x+car.width-7,y);
        ctx.lineTo(x+car.width,y+10);
        ctx.lineTo(x+car.width-2,y+car.height);
        ctx.lineTo(x+2,y+car.height);
        ctx.lineTo(x,y+10);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle='#94e0f3';
        ctx.beginPath();
        ctx.moveTo(x+8,y+12);
        ctx.lineTo(x+car.width-8,y+12);
        ctx.lineTo(x+car.width-5,y+26);
        ctx.lineTo(x+5,y+26);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle=isPlayer?'#eaffff':'#fbd2a9';
        ctx.fillRect(x+5,y+3,6,4);
        ctx.fillRect(x+car.width-11,y+3,6,4);

        ctx.fillStyle=isPlayer?'#ff4d56':'#ffdf65';
        ctx.fillRect(x+5,y+car.height-7,6,4);
        ctx.fillRect(x+car.width-11,y+car.height-7,6,4);

        ctx.restore();
    }

    function createExplosion(x,y){
        var colors=['#fff4a0','#ffd13d','#ff822c','#ff3f24','#b91d1d'];

        for(var i=0;i<74;i++){
            var angle=Math.random()*Math.PI*2;
            var force=55+Math.random()*235;

            particles.push({
                x:x,
                y:y,
                vx:Math.cos(angle)*force,
                vy:Math.sin(angle)*force,
                gravity:240,
                size:2+Math.random()*5,
                life:.4+Math.random()*.65,
                maxLife:1,
                color:colors[Math.floor(Math.random()*colors.length)]
            });
        }

        for(var j=0;j<25;j++){
            smoke.push({
                x:x+(Math.random()*26-13),
                y:y+(Math.random()*25-13),
                vx:Math.random()*45-22,
                vy:-20-Math.random()*70,
                size:8+Math.random()*17,
                life:.7+Math.random()*.75,
                maxLife:1.45
            });
        }

        for(var k=0;k<15;k++){
            flames.push({
                x:x+(Math.random()*26-13),
                y:y+(Math.random()*26-13),
                size:10+Math.random()*19,
                life:.22+Math.random()*.32,
                maxLife:.54
            });
        }
    }

    function updateEffects(delta){
        particles.forEach(function(p){
            p.x+=p.vx*delta;
            p.y+=p.vy*delta;
            p.vy+=p.gravity*delta;
            p.life-=delta;
        });

        smoke.forEach(function(s){
            s.x+=s.vx*delta;
            s.y+=s.vy*delta;
            s.size+=18*delta;
            s.life-=delta;
        });

        flames.forEach(function(f){
            f.y-=28*delta;
            f.size+=5*delta;
            f.life-=delta;
        });

        particles=particles.filter(function(p){return p.life>0});
        smoke=smoke.filter(function(s){return s.life>0});
        flames=flames.filter(function(f){return f.life>0});
    }

    function drawEffects(){
        smoke.forEach(function(s){
            ctx.save();
            ctx.globalAlpha=Math.max(0,s.life/s.maxLife)*.42;
            ctx.fillStyle='#2f3335';
            ctx.beginPath();
            ctx.arc(s.x,s.y,s.size,0,Math.PI*2);
            ctx.fill();
            ctx.restore();
        });

        flames.forEach(function(f){
            ctx.save();
            ctx.globalAlpha=Math.max(0,f.life/f.maxLife);
            ctx.fillStyle='#ff6b25';
            ctx.beginPath();
            ctx.arc(f.x,f.y,f.size,0,Math.PI*2);
            ctx.fill();

            ctx.globalAlpha=Math.max(0,f.life/f.maxLife)*.8;
            ctx.fillStyle='#ffe75c';
            ctx.beginPath();
            ctx.arc(f.x,f.y,f.size*.48,0,Math.PI*2);
            ctx.fill();
            ctx.restore();
        });

        particles.forEach(function(p){
            ctx.save();
            ctx.globalAlpha=Math.max(0,p.life/p.maxLife);
            ctx.fillStyle=p.color;
            ctx.fillRect(p.x,p.y,p.size,p.size);
            ctx.restore();
        });
    }

    function draw(){
        var shakeX=0;
        var shakeY=0;

        if(shakeTimer>0){
            shakeX=(Math.random()-.5)*8;
            shakeY=(Math.random()-.5)*8;
        }

        ctx.save();
        ctx.translate(shakeX,shakeY);
        ctx.clearRect(-10,-10,W+20,H+20);

        drawRoad();

        traffic.forEach(function(car){
            drawCar(car,false);
        });

        if(player&&!crashed){
            drawCar(player,true);
        }

        drawEffects();
        ctx.restore();
    }

    function overlaps(a,b){
        return (
            Math.abs(a.x-b.x)<(a.width+b.width)/2-7 &&
            a.y<b.y+b.height-8 &&
            a.y+a.height-8>b.y
        );
    }

    function updateHud(){
        scoreEl.textContent=Math.floor(score);
        speedEl.textContent=level;
    }

    function stopLoop(){
        if(animationId){
            cancelAnimationFrame(animationId);
            animationId=null;
        }
    }

    function clearCountdown(){
        if(countdownTimer){
            clearTimeout(countdownTimer);
            countdownTimer=null;
        }

        countingDown=false;
        countdownOverlay.classList.remove('show');
    }

    function crash(){
        if(!running||crashed)return;

        crashed=true;
        running=false;
        paused=false;
        clearCountdown();

        createExplosion(player.x,player.y+28);
        shakeTimer=.72;
        crashSound();

        if(score>best){
            best=Math.floor(score);
            bestEl.textContent=best;

            try{
                localStorage.setItem('carDodgeBest',best);
            }catch(error){}
        }

        gameoverScore.textContent=Math.floor(score);
        message.textContent='YOU HIT TRAFFIC';
        gameover.classList.add('show');

        pauseOverlay.classList.remove('show');
        updateControls();
    }

    function resetIdle(){
        clearCountdown();
        stopLoop();

        running=false;
        paused=false;
        crashed=false;

        player=makePlayer();
        traffic=[];
        particles=[];
        smoke=[];
        flames=[];

        score=0;
        level=1;
        elapsed=0;
        roadOffset=0;
        spawnTimer=0;
        boostTimer=0;
        boostCooldown=0;
        jumpTimer=0;
        jumpCooldown=0;
        shakeTimer=0;

        gameover.classList.remove('show');
        pauseOverlay.classList.remove('show');

        pauseButton.textContent='Ⅱ';
        message.textContent='Tap START to begin';

        updateHud();
        updateControls();
        draw();
    }

    function prepareGame(){
        player=makePlayer();
        traffic=[];
        particles=[];
        smoke=[];
        flames=[];

        score=0;
        level=1;
        elapsed=0;
        roadOffset=0;
        spawnTimer=.8;
        boostTimer=0;
        boostCooldown=0;
        jumpTimer=0;
        jumpCooldown=0;
        shakeTimer=0;

        paused=false;
        crashed=false;

        gameover.classList.remove('show');
        pauseOverlay.classList.remove('show');

        pauseButton.textContent='Ⅱ';
        updateHud();
    }

    function startCountdown(){
        if(running||countingDown)return;

        clearCountdown();
        prepareGame();

        countingDown=true;
        message.textContent='GET READY...';

        countdownOverlay.classList.add('show');
        updateControls();
        draw();

        var steps=['3','2','1','GO'];
        var index=0;

        function nextStep(){
            if(!countingDown)return;

            var value=steps[index];
            countdownNumber.textContent=value;
            countdownText.textContent=value==='GO'?'DODGE THE TRAFFIC':'GET READY';
            countdownNumber.style.animation='none';
            void countdownNumber.offsetWidth;
            countdownNumber.style.animation='countPop .66s ease-out';

            countdownSound(value);
            index++;

            if(index<steps.length){
                countdownTimer=setTimeout(nextStep,1000);
                return;
            }

            countdownTimer=setTimeout(function(){
                if(!countingDown)return;

                countingDown=false;
                countdownOverlay.classList.remove('show');

                running=true;
                message.textContent='DODGE THE TRAFFIC';
                startSound();

                lastTime=performance.now();
                updateControls();
                animationId=requestAnimationFrame(loop);
            },620);
        }

        nextStep();
    }

    function restartGame(){
        getAudio();
        resetIdle();
        startCountdown();
    }

    function move(direction){
        if(!canDrive()||!player)return;

        var nextLane=Math.max(0,Math.min(2,player.targetLane+direction));

        if(nextLane!==player.targetLane){
            player.targetLane=nextLane;
            moveSound();
        }
    }

    function activateBoost(){
        if(!canDrive())return;
        if(boostTimer>0||boostCooldown>0)return;

        boostTimer=BOOST_DURATION;
        boostCooldown=BOOST_COOLDOWN;
        score+=12;
        message.textContent='BOOST ENGAGED';
        boostSound();
        updateControls();
    }

    function jumpCar(){
        if(!canDrive())return;
        if(jumpTimer>0||jumpCooldown>0)return;

        jumpTimer=JUMP_DURATION;
        jumpCooldown=JUMP_COOLDOWN;
        message.textContent='JUMP!';
        jumpSound();
        updateControls();
    }

    function togglePause(){
        if(!running||crashed||countingDown)return;

        if(paused){
            paused=false;
            pauseOverlay.classList.remove('show');
            pauseButton.textContent='Ⅱ';
            message.textContent='DODGE THE TRAFFIC';

            lastTime=performance.now();
            animationId=requestAnimationFrame(loop);
        }else{
            paused=true;
            stopLoop();

            pauseOverlay.classList.add('show');
            pauseButton.textContent='▶';
            message.textContent='GAME PAUSED';
        }
    }

    function loop(now){
        var delta=Math.min(.05,(now-lastTime)/1000);
        lastTime=now;

        if(shakeTimer>0){
            shakeTimer-=delta;
        }

        updateEffects(delta);

        if(running&&!paused&&!crashed){
            elapsed+=delta;
            level=1+Math.floor(elapsed/13);

            if(jumpTimer>0){
                jumpTimer-=delta;

                if(jumpTimer<=0){
                    jumpTimer=0;

                    if(message.textContent==='JUMP!'){
                        message.textContent='DODGE THE TRAFFIC';
                    }
                }
            }

            if(jumpCooldown>0){
                jumpCooldown=Math.max(0,jumpCooldown-delta);
            }

            if(boostTimer>0){
                boostTimer-=delta;

                if(boostTimer<=0){
                    boostTimer=0;

                    if(message.textContent==='BOOST ENGAGED'){
                        message.textContent='DODGE THE TRAFFIC';
                    }
                }
            }

            if(boostCooldown>0){
                boostCooldown=Math.max(0,boostCooldown-delta);
            }

            var roadSpeed=150+level*22;

            if(boostTimer>0){
                roadSpeed*=1.35;
            }

            roadOffset=(roadOffset+roadSpeed*delta)%48;

            var targetX=laneX(player.targetLane);
            player.x+=(targetX-player.x)*Math.min(1,delta*13);

            spawnTimer-=delta;

            if(spawnTimer<=0){
                spawnCar();
                spawnTimer=Math.max(.40,.95-level*.045)+Math.random()*.25;
            }

            traffic.forEach(function(car){
                car.y+=(car.speed+(boostTimer>0?65:0))*delta;
            });

            traffic=traffic.filter(function(car){
                if(car.y>H+70){
                    score+=10;
                    return false;
                }

                return true;
            });

            if(jumpTimer<=0){
                for(var i=0;i<traffic.length;i++){
                    if(overlaps(player,traffic[i])){
                        crash();
                        break;
                    }
                }
            }

            score+=delta*(4+level);

            if(
                Math.floor(elapsed)%13===0 &&
                elapsed>1 &&
                Math.floor(elapsed-delta)%13!==0
            ){
                message.textContent='SPEED '+level;
            }

            updateHud();
            updateControls();
        }

        draw();

        if(running||particles.length||smoke.length||flames.length||shakeTimer>0){
            animationId=requestAnimationFrame(loop);
        }else{
            animationId=null;
        }
    }

    leftButton.onclick=function(){
        move(-1);
    };

    rightButton.onclick=function(){
        move(1);
    };

    boostButton.onclick=function(){
        if(!running&&!countingDown&&!crashed){
            startCountdown();
            return;
        }

        activateBoost();
    };

    jumpButton.onclick=function(){
        jumpCar();
    };

    restartButton.onclick=function(){
        restartGame();
    };

    pauseButton.onclick=function(){
        togglePause();
    };

    soundButton.onclick=function(){
        if(crashed||countingDown)return;

        soundEnabled=!soundEnabled;
        setSoundIcon();

        if(soundEnabled){
            tone(700,900,.08,'square',.03,0);
        }
    };

    document.addEventListener('keydown',function(event){
        if(event.key==='r'||event.key==='R'){
            event.preventDefault();
            restartGame();
            return;
        }

        if(crashed||countingDown)return;

        if(event.key==='Enter'){
            event.preventDefault();

            if(!running){
                startCountdown();
            }

            return;
        }

        if(event.key==='ArrowLeft'){
            event.preventDefault();
            move(-1);
        }else if(event.key==='ArrowRight'){
            event.preventDefault();
            move(1);
        }else if(event.key==='ArrowUp'||event.key==='j'||event.key==='J'){
            event.preventDefault();
            jumpCar();
        }else if(event.key===' '){
            event.preventDefault();
            activateBoost();
        }else if(event.key==='p'||event.key==='P'){
            event.preventDefault();
            togglePause();
        }
    });

    var touchX=0;
    var touchY=0;

    canvas.addEventListener('touchstart',function(event){
        var touch=event.changedTouches[0];
        touchX=touch.clientX;
        touchY=touch.clientY;
    },{passive:true});

    canvas.addEventListener('touchend',function(event){
        if(!canDrive())return;

        var touch=event.changedTouches[0];
        var dx=touch.clientX-touchX;
        var dy=touch.clientY-touchY;

        if(Math.max(Math.abs(dx),Math.abs(dy))<16){
            activateBoost();
            return;
        }

        if(Math.abs(dx)>Math.abs(dy)){
            move(dx>0?1:-1);
        }else if(dy<0){
            jumpCar();
        }else{
            activateBoost();
        }
    },{passive:true});

    window.addEventListener('pagehide',function(){
        clearCountdown();
        stopLoop();

        if(audioContext){
            audioContext.close().catch(function(){});
            audioContext=null;
        }
    });

    setSoundIcon();
    resetIdle();

})();
</script>
</body>
</html>`;
}

module.exports = {
    name: 'cardodge',
    aliases: ['car', 'dodgecar', 'trafficdodge'],
    description: 'Play a 3-lane Car Dodge game in WhatsApp GenAI',
    usage: '.cardodge',
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
                html: carDodgeHtml()
            });
        } catch (error) {
            console.error(
                '[CAR DODGE GenAI]',
                error.message
            );

            await reply(
                'Car Dodge could not open on this client. Please update WhatsApp or run `.cardodge` again.'
            );
        }
    }
};

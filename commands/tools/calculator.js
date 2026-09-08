'use strict';

const { sendRichHtml } = require('../../lib/genaiRich');

function calculatorHtml() {
    return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">

<style>
*{box-sizing:border-box}

html,body{
    margin:0;
    min-width:0;
    background:transparent;
    font-family:Arial,sans-serif
}

body{
    padding:6px;
    background:radial-gradient(circle at 50% 0%,#0b4664,#061321 72%)
}

button{
    font:inherit
}

.card{
    width:100%;
    max-width:470px;
    margin:auto;
    padding:12px;
    border:1px solid #2e7894;
    border-radius:20px;
    background:linear-gradient(145deg,#071725,#0a2b3d 55%,#06131d);
    color:#e8f8ff;
    box-shadow:inset 0 0 0 1px #12435a,0 10px 28px #0009
}

.header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    margin-bottom:8px
}

.titleWrap{
    min-width:0
}

.title{
    color:#d8f6ff;
    font:bold clamp(17px,5vw,22px) Arial Black,Arial,sans-serif;
    letter-spacing:.6px;
    line-height:1.05
}

.sub{
    margin-top:3px;
    color:#78b4ca;
    font:10px monospace
}

.badge{
    flex:0 0 auto;
    padding:5px 8px;
    border:1px solid #267c9c;
    border-radius:999px;
    color:#b9efff;
    background:#082638;
    font:bold 9px monospace
}

.screen{
    min-height:112px;
    margin-bottom:9px;
    padding:11px 12px;
    border:1px solid #2f8453;
    border-radius:14px;
    background:#020b0f;
    box-shadow:inset 0 0 24px #001d10;
    overflow:hidden
}

.expression{
    min-height:27px;
    color:#7dbbd1;
    text-align:right;
    font:14px/1.35 monospace;
    overflow-wrap:anywhere;
    word-break:break-word
}

.answer{
    min-height:48px;
    display:flex;
    align-items:center;
    justify-content:flex-end;
    color:#ddffe1;
    text-align:right;
    font:bold clamp(27px,8vw,36px)/1.1 Arial,sans-serif;
    overflow-wrap:anywhere;
    word-break:break-word
}

.status{
    min-height:15px;
    margin-top:3px;
    color:#79bd8a;
    font:10px monospace;
    overflow-wrap:anywhere
}

.topbar{
    display:grid;
    grid-template-columns:repeat(3,1fr);
    gap:6px;
    margin-bottom:7px
}

.topbar button,
.memory button,
.historyClear{
    min-height:34px;
    border:1px solid #297d9c;
    border-radius:8px;
    color:#bdefff;
    background:#08293d;
    font:bold 11px monospace;
    cursor:pointer;
    touch-action:manipulation;
    -webkit-tap-highlight-color:transparent;
    -webkit-user-select:none;
    user-select:none
}

.topbar button.active{
    border-color:#63d9ff;
    background:#0e5875;
    color:#fff
}

.memory{
    display:grid;
    grid-template-columns:repeat(4,1fr);
    gap:6px;
    margin-bottom:7px
}

.memory button{
    min-height:31px;
    border-color:#2d8050;
    color:#c7ffd1;
    background:#061d11
}

.keys{
    display:grid;
    grid-template-columns:repeat(5,minmax(0,1fr));
    gap:6px
}

.keys button{
    min-width:0;
    min-height:45px;
    padding:5px 2px;
    border:1px solid #327a4d;
    border-radius:10px;
    color:#e4ffe8;
    background:linear-gradient(#155d36,#0a351f);
    font:bold 13px Arial,sans-serif;
    cursor:pointer;
    box-shadow:inset 0 1px 0 #4b9667;
    touch-action:manipulation;
    -webkit-tap-highlight-color:transparent;
    -webkit-user-select:none;
    user-select:none
}

.keys button.fn{
    border-color:#2b7698;
    color:#d1f3ff;
    background:linear-gradient(#14526d,#092d40)
}

.keys button.op{
    border-color:#9d742f;
    color:#fff0be;
    background:linear-gradient(#694a18,#342408)
}

.keys button.clear{
    border-color:#a83f43;
    color:#ffd9d9;
    background:linear-gradient(#702528,#3a1012)
}

.keys button.equal{
    border-color:#4bbd68;
    color:#f1fff3;
    background:linear-gradient(#20904a,#0c4b27);
    box-shadow:0 0 8px #1d9f4d
}

.keys button:active,
.memory button:active,
.topbar button:active,
.historyClear:active{
    transform:scale(.94)
}

.historyWrap{
    margin-top:9px;
    border:1px solid #2d7046;
    border-radius:10px;
    background:#031008;
    overflow:hidden
}

.historyHead{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    padding:6px 8px;
    border-bottom:1px solid #1b5733
}

.historyTitle{
    min-width:0;
    color:#7fc18e;
    font:bold 10px monospace
}

.historyClear{
    flex:0 0 auto;
    min-height:27px;
    padding:3px 8px;
    border-color:#315d45;
    color:#a7d9b3;
    background:#07170d;
    font-size:9px
}

.history{
    max-height:112px;
    overflow-y:auto;
    overscroll-behavior:contain
}

.historyItem{
    width:100%;
    padding:8px 9px;
    border:0;
    border-bottom:1px solid #11391f;
    background:transparent;
    color:#c1edcb;
    text-align:left;
    font:11px/1.35 monospace;
    cursor:pointer;
    overflow-wrap:anywhere;
    touch-action:manipulation;
    -webkit-user-select:none;
    user-select:none
}

.historyItem:last-child{
    border-bottom:0
}

.historyItem:active{
    background:#0b3220
}

.emptyHistory{
    padding:9px;
    color:#669673;
    font:10px monospace
}

.hint{
    margin:8px 0 0;
    color:#6eaa7d;
    text-align:center;
    font:10px monospace
}

button:focus-visible{
    outline:2px solid #a8ebff;
    outline-offset:2px
}

@media(max-width:360px){
    body{padding:4px}
    .card{padding:9px;border-radius:16px}
    .keys,.memory,.topbar{gap:5px}
    .keys button{min-height:42px;font-size:11.5px}
    .memory button,.topbar button{font-size:10px}
    .screen{min-height:103px;padding:9px}
}

@media(max-width:320px){
    .keys button{min-height:40px;font-size:10.5px}
    .title{letter-spacing:0}
}
</style>
</head>

<body>
<div class="card" id="calculator">

    <div class="header">
        <div class="titleWrap">
            <div class="title">SCIENTIFIC CALCULATOR</div>
            <div class="sub">PRECISION MATH CONSOLE</div>
        </div>
        <div class="badge">SCIENTIFIC</div>
    </div>

    <div class="screen" aria-live="polite">
        <div class="expression" id="expression">0</div>
        <div class="answer" id="answer">0</div>
        <div class="status" id="status">DEG · M: 0</div>
    </div>

    <div class="topbar">
        <button type="button" id="angle" class="active">DEG</button>
        <button type="button" id="inverse">INV OFF</button>
        <button type="button" id="ans">ANS</button>
    </div>

    <div class="memory">
        <button type="button" id="mc">MC</button>
        <button type="button" id="mr">MR</button>
        <button type="button" id="mplus">M+</button>
        <button type="button" id="mminus">M−</button>
    </div>

    <div class="keys">
        <button type="button" class="clear" data-action="clear">AC</button>
        <button type="button" class="clear" data-action="delete">DEL</button>
        <button type="button" class="fn" data-value="(">(</button>
        <button type="button" class="fn" data-value=")">)</button>
        <button type="button" class="op" data-value="÷">÷</button>

        <button type="button" class="fn invfn" data-fn="sin">sin</button>
        <button type="button" class="fn invfn" data-fn="cos">cos</button>
        <button type="button" class="fn invfn" data-fn="tan">tan</button>
        <button type="button" class="fn invfn" data-fn="log">log</button>
        <button type="button" class="fn invfn" data-fn="ln">ln</button>

        <button type="button" class="fn" data-value="π">π</button>
        <button type="button" class="fn" data-value="e">e</button>
        <button type="button" class="fn" data-fn="sqrt">√</button>
        <button type="button" class="fn" data-action="square">x²</button>
        <button type="button" class="fn" data-value="^">xʸ</button>

        <button type="button" class="fn" data-action="factorial">x!</button>
        <button type="button" class="fn" data-action="percent">%</button>
        <button type="button" class="fn" data-action="reciprocal">1/x</button>
        <button type="button" class="fn" data-fn="cbrt">∛x</button>
        <button type="button" class="fn" data-action="exp10">10ˣ</button>

        <button type="button" data-value="7">7</button>
        <button type="button" data-value="8">8</button>
        <button type="button" data-value="9">9</button>
        <button type="button" class="op" data-value="×">×</button>
        <button type="button" class="fn" data-action="ee">EXP</button>

        <button type="button" data-value="4">4</button>
        <button type="button" data-value="5">5</button>
        <button type="button" data-value="6">6</button>
        <button type="button" class="op" data-value="−">−</button>
        <button type="button" class="fn" data-action="negate">±</button>

        <button type="button" data-value="1">1</button>
        <button type="button" data-value="2">2</button>
        <button type="button" data-value="3">3</button>
        <button type="button" class="op" data-value="+">+</button>
        <button type="button" class="equal" data-action="equals">=</button>

        <button type="button" class="fn" data-fn="abs">|x|</button>
        <button type="button" data-value="0">0</button>
        <button type="button" data-value=".">.</button>
        <button type="button" class="fn" data-action="openAns">Ans×</button>
    </div>

    <div class="historyWrap">
        <div class="historyHead">
            <div class="historyTitle">HISTORY · TAP TO REUSE</div>
            <button type="button" class="historyClear" id="clearHistory">CLEAR</button>
        </div>
        <div class="history" id="history">
            <div class="emptyHistory">No calculations yet</div>
        </div>
    </div>
</div>

<script>
(function(){
    'use strict';

    var root=document.getElementById('calculator');
    var expressionEl=document.getElementById('expression');
    var answerEl=document.getElementById('answer');
    var statusEl=document.getElementById('status');
    var historyEl=document.getElementById('history');

    var expression='';
    var lastAnswer=0;
    var memory=0;
    var degrees=true;
    var inverse=false;
    var errorState=false;
    var history=[];
    var historyTimer=null;

    var FUNCTION_NAMES={
        sin:true,cos:true,tan:true,
        asin:true,acos:true,atan:true,
        log:true,ln:true,sqrt:true,cbrt:true,abs:true
    };

    var CONSTANT_NAMES={
        pi:true,e:true,ans:true
    };

    function factorial(n){
        if(!Number.isFinite(n) || n<0 || Math.floor(n)!==n || n>170){
            throw new Error('Factorial requires an integer from 0 to 170');
        }

        var result=1;
        for(var i=2;i<=n;i++)result*=i;
        return result;
    }

    function cleanZero(value){
        return Math.abs(value)<1e-14 ? 0 : value;
    }

    function formatNumber(value){
        if(!Number.isFinite(value)){
            throw new Error('Result is outside the supported range');
        }

        value=cleanZero(value);

        if(value===0)return '0';

        var absolute=Math.abs(value);

        if(absolute>=1e12 || absolute<1e-9){
            return value
                .toExponential(10)
                        .replace(/(\.\\d*?[1-9])0+e/,'$1e')
                        .replace(/\\.0+e/,'e')
                        .replace(/e\\+/,'e+');
        }

        return String(Number(value.toPrecision(12)));
    }

    function displayExpression(value){
        return (value||'0')
            .replace(/\\bpi\\b/g,'π')
             .replace(/\\*/g,'Ã—')
             .replace(/\\//g,'Ã·')
            .replace(/-/g,'−');
    }

    function setStatus(message){
        statusEl.textContent=message || (
            (degrees?'DEG':'RAD')+
            ' · M: '+formatNumber(memory)+
            (inverse?' · INV':'')
        );
    }

    function updateDisplay(preview){
        expressionEl.textContent=displayExpression(expression);

        if(preview!==undefined){
            answerEl.textContent=preview;
        }else if(!expression){
            answerEl.textContent='0';
        }

        setStatus();
    }

    function showError(message){
        answerEl.textContent='Error';
        statusEl.textContent=message || 'Invalid calculation';
        errorState=true;
    }

    function clearErrorForInput(){
        if(errorState){
            expression='';
            answerEl.textContent='0';
            errorState=false;
        }
    }

    function isDigit(ch){
        return ch>='0' && ch<='9';
    }

    function tokenize(input){
        var tokens=[];
        var i=0;

        while(i<input.length){
            var ch=input[i];

            if(/\\s/.test(ch)){
                i++;
                continue;
            }

            if(ch==='π'){
                tokens.push({type:'const',value:'pi'});
                i++;
                continue;
            }

            if(isDigit(ch) || ch==='.'){
                var start=i;
                var sawDot=false;

                if(ch==='.'){
                    sawDot=true;
                    i++;
                    if(i>=input.length || !isDigit(input[i])){
                        throw new Error('Decimal point must be part of a number');
                    }
                }else{
                    i++;
                }

                while(i<input.length){
                    var c=input[i];

                    if(isDigit(c)){
                        i++;
                        continue;
                    }

                    if(c==='.' && !sawDot){
                        sawDot=true;
                        i++;
                        continue;
                    }

                    break;
                }

                if(i<input.length && (input[i]==='E')){
                    var expStart=i;
                    i++;

                    if(i<input.length && (input[i]==='+' || input[i]==='−' || input[i]==='-')){
                        i++;
                    }

                    var expDigits=i;
                    while(i<input.length && isDigit(input[i]))i++;

                    if(expDigits===i){
                        i=expStart;
                    }
                }

                var raw=input.slice(start,i).replace(/−/g,'-');
                var number=Number(raw);

                if(!Number.isFinite(number)){
                    throw new Error('Invalid number');
                }

                tokens.push({type:'number',value:number,raw:raw});
                continue;
            }

            if(/[A-Za-z]/.test(ch)){
                var nameStart=i;
                i++;

                while(i<input.length && /[A-Za-z]/.test(input[i]))i++;

                var name=input.slice(nameStart,i).toLowerCase();

                if(FUNCTION_NAMES[name]){
                    tokens.push({type:'func',value:name});
                }else if(CONSTANT_NAMES[name]){
                    tokens.push({type:'const',value:name});
                }else{
                    throw new Error('Unknown function or constant');
                }

                continue;
            }

            if(ch==='×')ch='*';
            if(ch==='÷')ch='/';
            if(ch==='−')ch='-';

            if('+-*/^!%()'.indexOf(ch)!==-1){
                if(ch==='(')tokens.push({type:'lparen',value:ch});
                else if(ch===')')tokens.push({type:'rparen',value:ch});
                else if(ch==='!' || ch==='%')tokens.push({type:'postfix',value:ch});
                else tokens.push({type:'op',value:ch});

                i++;
                continue;
            }

            throw new Error('Unsupported character');
        }

        var expanded=[];

        function endsValue(token){
            return token &&
                (token.type==='number' ||
                 token.type==='const' ||
                 token.type==='rparen' ||
                 token.type==='postfix');
        }

        function startsValue(token){
            return token &&
                (token.type==='number' ||
                 token.type==='const' ||
                 token.type==='func' ||
                 token.type==='lparen');
        }

        for(var t=0;t<tokens.length;t++){
            var current=tokens[t];
            var previous=expanded.length?expanded[expanded.length-1]:null;

            if(endsValue(previous) && startsValue(current)){
                expanded.push({type:'op',value:'*',implicit:true});
            }

            expanded.push(current);
        }

        return expanded;
    }

    function Parser(tokens){
        this.tokens=tokens;
        this.index=0;
    }

    Parser.prototype.peek=function(){
        return this.tokens[this.index] || null;
    };

    Parser.prototype.take=function(){
        return this.tokens[this.index++] || null;
    };

    Parser.prototype.match=function(type,value){
        var token=this.peek();

        if(!token || token.type!==type)return false;
        if(value!==undefined && token.value!==value)return false;

        this.index++;
        return token;
    };

    Parser.prototype.parse=function(){
        if(!this.tokens.length){
            throw new Error('Enter a calculation');
        }

        var result=this.parseAddSub();

        if(this.peek()){
            throw new Error('Incomplete or invalid expression');
        }

        return result;
    };

    Parser.prototype.parseAddSub=function(){
        var left=this.parseMulDiv();

        while(true){
            var token=this.peek();

            if(!token || token.type!=='op' || (token.value!=='+' && token.value!=='-')){
                break;
            }

            this.take();
            var right=this.parseMulDiv();
            var rightValue=right.value;

            if(right.percent){
                rightValue=left.value*right.value;
            }

            left={
                value:token.value==='+' ? left.value+rightValue : left.value-rightValue,
                percent:false
            };
        }

        return left;
    };

    Parser.prototype.parseMulDiv=function(){
        var left=this.parseUnary();

        while(true){
            var token=this.peek();

            if(!token || token.type!=='op' || (token.value!=='*' && token.value!=='/')){
                break;
            }

            this.take();
            var right=this.parseUnary();

            if(token.value==='/' && right.value===0){
                throw new Error('Cannot divide by zero');
            }

            left={
                value:token.value==='*' ? left.value*right.value : left.value/right.value,
                percent:false
            };
        }

        return left;
    };

    Parser.prototype.parseUnary=function(){
        var token=this.peek();

        if(token && token.type==='op' && (token.value==='+' || token.value==='-')){
            this.take();
            var next=this.parseUnary();

            return {
                value:token.value==='-' ? -next.value : next.value,
                percent:false
            };
        }

        return this.parsePower();
    };

    Parser.prototype.parsePower=function(){
        var left=this.parsePostfix();
        var token=this.peek();

        if(token && token.type==='op' && token.value==='^'){
            this.take();
            var right=this.parseUnary();
            var value=Math.pow(left.value,right.value);

            if(!Number.isFinite(value) || Number.isNaN(value)){
                throw new Error('Invalid power operation');
            }

            return {value:value,percent:false};
        }

        return left;
    };

    Parser.prototype.parsePostfix=function(){
        var value=this.parsePrimary();
        var token;

        while((token=this.peek()) && token.type==='postfix'){
            this.take();

            if(token.value==='!'){
                value={value:factorial(value.value),percent:false};
            }else{
                value={value:value.value/100,percent:true};
            }
        }

        return value;
    };

    Parser.prototype.parsePrimary=function(){
        var token=this.take();

        if(!token){
            throw new Error('Expression is incomplete');
        }

        if(token.type==='number'){
            return {value:token.value,percent:false};
        }

        if(token.type==='const'){
            if(token.value==='pi')return {value:Math.PI,percent:false};
            if(token.value==='e')return {value:Math.E,percent:false};
            if(token.value==='ans')return {value:lastAnswer,percent:false};
        }

        if(token.type==='lparen'){
            var inside=this.parseAddSub();

            if(!this.match('rparen')){
                throw new Error('Missing closing parenthesis');
            }

            return {value:inside.value,percent:inside.percent};
        }

        if(token.type==='func'){
            if(!this.match('lparen')){
                throw new Error('Function needs parentheses');
            }

            var argument=this.parseAddSub();

            if(!this.match('rparen')){
                throw new Error('Missing closing parenthesis');
            }

            return {
                value:applyMathFunction(token.value,argument.value),
                percent:false
            };
        }

        throw new Error('Unexpected token');
    };

    function applyMathFunction(name,x){
        var radians=degrees ? x*Math.PI/180 : x;
        var result;

        if(name==='sin')result=Math.sin(radians);
        else if(name==='cos')result=Math.cos(radians);
        else if(name==='tan'){
            if(Math.abs(Math.cos(radians))<1e-12){
                throw new Error('tan is undefined at this angle');
            }
            result=Math.tan(radians);
        }
        else if(name==='asin'){
            if(x<-1 || x>1)throw new Error('asin domain is −1 to 1');
            result=Math.asin(x);
            if(degrees)result=result*180/Math.PI;
        }
        else if(name==='acos'){
            if(x<-1 || x>1)throw new Error('acos domain is −1 to 1');
            result=Math.acos(x);
            if(degrees)result=result*180/Math.PI;
        }
        else if(name==='atan'){
            result=Math.atan(x);
            if(degrees)result=result*180/Math.PI;
        }
        else if(name==='log'){
            if(x<=0)throw new Error('log requires a positive number');
            result=Math.log(x)/Math.LN10;
        }
        else if(name==='ln'){
            if(x<=0)throw new Error('ln requires a positive number');
            result=Math.log(x);
        }
        else if(name==='sqrt'){
            if(x<0)throw new Error('Square root requires a non-negative number');
            result=Math.sqrt(x);
        }
        else if(name==='cbrt'){
            result=Math.cbrt ? Math.cbrt(x) : (x<0 ? -Math.pow(-x,1/3) : Math.pow(x,1/3));
        }
        else if(name==='abs'){
            result=Math.abs(x);
        }
        else{
            throw new Error('Unsupported function');
        }

        if(!Number.isFinite(result) || Number.isNaN(result)){
            throw new Error('Calculation is undefined');
        }

        return cleanZero(result);
    }

    function evaluate(input){
        var parser=new Parser(tokenize(input));
        var result=parser.parse().value;

        if(!Number.isFinite(result) || Number.isNaN(result)){
            throw new Error('Calculation is undefined');
        }

        return cleanZero(result);
    }

    function unmatchedOpenCount(){
        var count=0;

        for(var i=0;i<expression.length;i++){
            if(expression[i]==='(')count++;
            if(expression[i]===')')count--;
        }

        return count;
    }

    function currentNumberHasDot(){
        var match=expression.match(/(?:^|[+−×÷^()])([^+−×÷^()]*)$/);
        if(!match)return false;

        var segment=match[1];
        if(segment.indexOf('E')!==-1)return true;
        return segment.indexOf('.')!==-1;
    }

    function endsWithBasicOperator(){
        return /[+−×÷^]$/.test(expression);
    }

    function endsWithValue(){
        return /(?:\\d|π|e|\\)|!|%)$/.test(expression) || /ans$/i.test(expression);
    }

    function appendRaw(value){
        clearErrorForInput();

        if(value==='('){
            expression+='(';
            refreshPreview();
            return;
        }

        if(value===')'){
            if(unmatchedOpenCount()<=0)return;
            if(!endsWithValue())return;

            expression+=')';
            refreshPreview();
            return;
        }

        if(value==='.'){
            if(expression.endsWith('E'))return;
            if(currentNumberHasDot())return;

            if(!expression || endsWithBasicOperator() || expression.endsWith('(')){
                expression+='0.';
            }else{
                expression+='.';
            }

            refreshPreview();
            return;
        }

        if(value==='+' || value==='−' || value==='×' || value==='÷' || value==='^'){
            if(!expression){
                if(value==='−')expression='−';
                refreshPreview();
                return;
            }

            if(expression.endsWith('E')){
                if(value==='+' || value==='−'){
                    expression+=value;
                    refreshPreview();
                }
                return;
            }

            if(/[+−×÷^]$/.test(expression)){
                if(value==='−' && /[×÷^]$/.test(expression)){
                    expression+=value;
                }else{
                    expression=expression.slice(0,-1)+value;
                }

                refreshPreview();
                return;
            }

            if(expression.endsWith('(')){
                if(value==='−')expression+=value;
                refreshPreview();
                return;
            }

            if(endsWithValue()){
                expression+=value;
            }

            refreshPreview();
            return;
        }

        expression+=value;
        refreshPreview();
    }

    function appendFunction(name){
        clearErrorForInput();

        var actual=name;

        if(inverse){
            if(name==='sin')actual='asin';
            else if(name==='cos')actual='acos';
            else if(name==='tan')actual='atan';
            else if(name==='log'){
                wrapPowerBase('10');
                return;
            }
            else if(name==='ln'){
                wrapPowerBase('e');
                return;
            }
        }

        expression+=actual+'(';
        refreshPreview();
    }

    function wrapPowerBase(base){
        clearErrorForInput();

        if(expression && endsWithValue()){
            expression+='×';
        }

        expression+=base+'^(';
        refreshPreview();
    }

    function refreshPreview(){
        errorState=false;
        expressionEl.textContent=displayExpression(expression);

        if(!expression){
            answerEl.textContent='0';
            setStatus();
            return;
        }

        try{
            var preview=evaluate(expression);
            answerEl.textContent=formatNumber(preview);
            setStatus();
        }catch(error){
            if(answerEl.textContent==='Error'){
                answerEl.textContent='0';
            }
            setStatus();
        }
    }

    function solve(){
        if(!expression){
            showError('Enter a calculation');
            return;
        }

        try{
            var original=expression;
            var result=evaluate(original);
            var shown=formatNumber(result);

            lastAnswer=result;
            answerEl.textContent=shown;
            expression=shown;
            errorState=false;

            addHistory(original,shown);
            updateDisplay(shown);
        }catch(error){
            showError(error.message || 'Invalid calculation');
        }
    }

    function clearAll(){
        expression='';
        errorState=false;
        answerEl.textContent='0';
        updateDisplay();
    }

    function deleteLast(){
        if(errorState){
            clearAll();
            return;
        }

        if(!expression)return;

        var functionMatch=expression.match(/(?:asin|acos|atan|sqrt|cbrt|sin|cos|tan|log|ln|abs)\\($/);

        if(functionMatch){
            expression=expression.slice(0,-functionMatch[0].length);
        }else{
            expression=expression.slice(0,-1);
        }

        refreshPreview();
    }

    function applySquare(){
        clearErrorForInput();

        if(!expression){
            expression='ans^2';
        }else{
            expression='('+expression+')^2';
        }

        refreshPreview();
    }

    function applyReciprocal(){
        clearErrorForInput();

        if(!expression){
            expression='1/(ans)';
        }else{
            expression='1/('+expression+')';
        }

        refreshPreview();
    }

    function applyFactorial(){
        clearErrorForInput();

        if(!expression){
            expression='ans!';
        }else if(endsWithValue()){
            expression+='!';
        }

        refreshPreview();
    }

    function applyPercent(){
        clearErrorForInput();

        if(endsWithValue()){
            expression+='%';
            refreshPreview();
        }
    }

    function applyNegate(){
        clearErrorForInput();

        if(!expression){
            expression='−';
            refreshPreview();
            return;
        }

        var numberMatch=expression.match(/(\\d+(?:\\.\\d+)?(?:E[+−-]?\\d+)?)$/);

        if(numberMatch){
            var start=numberMatch.index;
            var before=expression.slice(0,start);
            var number=numberMatch[1];

            if(before.endsWith('−') && (before.length===1 || /[+−×÷^(]−$/.test(before))){
                expression=before.slice(0,-1)+number;
            }else{
                expression=before+'−'+number;
            }

            refreshPreview();
            return;
        }

        if(endsWithValue()){
            expression='−('+expression+')';
            refreshPreview();
        }
    }

    function applyEE(){
        clearErrorForInput();

        if(/(?:^|[+−×÷^(])\\d+(?:\\.\\d+)?$/.test(expression) && !/E[+−-]?\\d*$/.test(expression)){
            expression+='E';
            refreshPreview();
        }
    }

    function addHistory(item,result){
        history.unshift({
            expression:item,
            result:result
        });

        history=history.slice(0,10);
        renderHistory();
        scheduleHistoryClear();
    }

    function clearHistory(){
        if(historyTimer){
            clearTimeout(historyTimer);
            historyTimer=null;
        }

        history=[];
        renderHistory();
    }

    function scheduleHistoryClear(){
        if(historyTimer)clearTimeout(historyTimer);

        historyTimer=setTimeout(function(){
            historyTimer=null;
            history=[];
            renderHistory();
        },60000);
    }

    function renderHistory(){
        historyEl.innerHTML='';

        if(!history.length){
            var empty=document.createElement('div');
            empty.className='emptyHistory';
            empty.textContent='No calculations yet';
            historyEl.appendChild(empty);
            return;
        }

        history.forEach(function(entry){
            var row=document.createElement('button');
            row.type='button';
            row.className='historyItem';
            row.textContent=displayExpression(entry.expression)+' = '+entry.result;

            row.addEventListener('click',function(){
                expression=entry.expression;
                errorState=false;
                refreshPreview();
            });

            historyEl.appendChild(row);
        });
    }

    function updateInverseLabels(){
        var buttons=root.querySelectorAll('.invfn');

        for(var i=0;i<buttons.length;i++){
            var button=buttons[i];
            var fn=button.getAttribute('data-fn');

            if(!inverse){
                button.textContent=fn;
                continue;
            }

            if(fn==='sin')button.textContent='sin⁻¹';
            else if(fn==='cos')button.textContent='cos⁻¹';
            else if(fn==='tan')button.textContent='tan⁻¹';
            else if(fn==='log')button.textContent='10ˣ';
            else if(fn==='ln')button.textContent='eˣ';
        }
    }

    var valueButtons=root.querySelectorAll('[data-value]');
    for(var i=0;i<valueButtons.length;i++){
        valueButtons[i].onclick=function(){
            appendRaw(this.getAttribute('data-value'));
        };
    }

    var functionButtons=root.querySelectorAll('[data-fn]');
    for(var j=0;j<functionButtons.length;j++){
        functionButtons[j].onclick=function(){
            appendFunction(this.getAttribute('data-fn'));
        };
    }

    var actionButtons=root.querySelectorAll('[data-action]');
    for(var k=0;k<actionButtons.length;k++){
        actionButtons[k].onclick=function(){
            var action=this.getAttribute('data-action');
            if(action==='clear')clearAll();
            else if(action==='delete')deleteLast();
            else if(action==='equals')solve();
            else if(action==='square')applySquare();
            else if(action==='factorial')applyFactorial();
            else if(action==='percent')applyPercent();
            else if(action==='reciprocal')applyReciprocal();
            else if(action==='negate')applyNegate();
            else if(action==='ee')applyEE();
            else if(action==='exp10')wrapPowerBase('10');
            else if(action==='openAns'){
                clearErrorForInput();
                expression+=(expression && endsWithValue()?'×':'')+'ans';
                refreshPreview();
            }
        };
    }

    document.getElementById('angle').addEventListener('click',function(){
        degrees=!degrees;
        this.textContent=degrees?'DEG':'RAD';
        this.classList.toggle('active',degrees);
        refreshPreview();
    });

    document.getElementById('inverse').addEventListener('click',function(){
        inverse=!inverse;
        this.textContent=inverse?'INV ON':'INV OFF';
        this.classList.toggle('active',inverse);
        updateInverseLabels();
        setStatus();
    });

    document.getElementById('ans').addEventListener('click',function(){
        appendRaw('ans');
    });

    document.getElementById('mc').addEventListener('click',function(){
        memory=0;
        setStatus();
    });

    document.getElementById('mr').addEventListener('click',function(){
        appendRaw('('+formatNumber(memory)+')');
    });

    document.getElementById('mplus').addEventListener('click',function(){
        try{
            memory+=evaluate(expression || String(lastAnswer));
            setStatus();
        }catch(error){
            statusEl.textContent='Cannot add this value to memory';
        }
    });

    document.getElementById('mminus').addEventListener('click',function(){
        try{
            memory-=evaluate(expression || String(lastAnswer));
            setStatus();
        }catch(error){
            statusEl.textContent='Cannot subtract this value from memory';
        }
    });

    document.getElementById('clearHistory').addEventListener('click',function(){
        clearHistory();
    });

    root.addEventListener('contextmenu',function(event){
        var target=event.target;
        while(target && target!==root && target.tagName!=='BUTTON')target=target.parentNode;
        if(target && target.tagName==='BUTTON'){
            event.preventDefault();
        }
    });

    root.addEventListener('keydown',function(event){
        var target=event.target;

        if(target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)){
            return;
        }

        var key=event.key;

        if(key==='Enter' || key==='='){
            event.preventDefault();
            solve();
            return;
        }

        if(key==='Escape'){
            event.preventDefault();
            clearAll();
            return;
        }

        if(key==='Backspace'){
            event.preventDefault();
            deleteLast();
            return;
        }

        if(key==='*')key='×';
        if(key==='/')key='÷';
        if(key==='-')key='−';

        if('0123456789.+−×÷()^'.indexOf(key)!==-1){
            event.preventDefault();
            appendRaw(key);
        }
    });

    root.tabIndex=0;
    updateInverseLabels();
    updateDisplay();
})();
</script>
</body>
</html>`;
}

module.exports = {
    name: 'calculator',
    aliases: ['calc', 'scientificcalculator', 'scientificcalc'],
    description: 'Open an interactive scientific calculator in WhatsApp GenAI',
    usage: '.calculator',
    category: 'tools',

    async execute(bot, msg, args) {
        const sock = bot.sock;
        const from = msg.chat;

        try {
            await sendRichHtml({
                sock,
                jid: from,
                quoted: msg,
                html: calculatorHtml()
            });
        } catch (error) {
            console.error('[CALCULATOR GenAI]', error.message);

            await msg.reply(
                'Calculator could not open on this client. Please update WhatsApp and run `.calculator` again.'
            );
        }
    }
};

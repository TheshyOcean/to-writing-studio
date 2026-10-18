/* ==========================================================================
   boot-draw.js · 开屏「图纸显影」
   把工作台自己的背景图纸（bg/tws-*.svg：线装书叶 / 书写机械 / 永字八法 /
   对开页比例 / 图签）放在和背景完全相同的位置，一笔一笔描出来，
   标注随后浮现，标题逐字落下；揭幕时只退去纸面和标题——
   线条留在原地，主界面直接在同一张图纸上浮现，没有跳位。

   图纸来自 boot-art-desktop.js / boot-art-mobile.js（由 tools/build-boot-art.py 从 bg/ 生成）。
   放在 <div id="loader"></div> 之后同步加载：页面一开始就能画，
   不用等后面几千行主程序解析完。主程序的 boot() 只需要：
     TWSBoot.onReveal(fn)  —— 开始揭幕时调用（让 #app 进场）
     TWSBoot.onDone(fn)    —— loader 完全移除后调用
     TWSBoot.instant()     —— 减少动效 / 静态模式下立刻结束
   ========================================================================== */
(function(){
'use strict';
var loader=document.getElementById('loader');
if(!loader) return;
var de=document.documentElement;

/* 1. 先把主题定下来，避免浅色用户先看到一帧深色 */
try{
  var tv=localStorage.getItem('endfield_theme_v2');
  if(tv==='auto') tv=(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
  if(tv==='light'||tv==='dark') de.setAttribute('data-theme',tv);
}catch(e){}
var theme=de.getAttribute('data-theme')==='light'?'light':'dark';
var mobile=de.getAttribute('data-shell')==='mobile';

/* 2. 节奏：第一次完整播放；以后再打开快一些，不让人每次都等 */
var seen=false;
try{ seen=localStorage.getItem('tws_boot_seen')==='1'; localStorage.setItem('tws_boot_seen','1'); }catch(e){}
var K=seen?0.62:1;
function ms(v){ return Math.round(v*K); }

/* 3. 骨架 */
var TITLE='让故事，在此发生。';
var chars='';
for(var i=0;i<TITLE.length;i++){
  chars+='<span style="transition-delay:'+ms(1150+i*80)+'ms">'+TITLE[i]+'</span>';
  if(i===3) chars+='<br class="bd-br">';
}
loader.className='bd-root'+(mobile?' bd-mobile':'');
loader.setAttribute('aria-hidden','true');
loader.innerHTML=
  '<div class="bd-paper"></div>'+
  '<div class="bd-bp" id="bdBp"></div>'+
  '<div class="bd-head"><div class="bd-title">'+chars+'</div>'+
    '<p class="bd-sub" style="transition-delay:'+ms(1950)+'ms">EVERY WORLD BEGINS WITH A WORD</p></div>'+
  '<div class="bd-hud bd-tl"><span class="bd-mk"></span>TO // STUDIO · <b>To写作工作台</b></div>'+
  '<div class="bd-hud bd-tr">SEQ 01 · BOOT</div>'+
  '<button class="bd-skip" id="skipBtn" type="button">跳过 SKIP →</button>'+
  '<div class="bd-hud bd-bl"><span id="bdTc">TC 00:00:00:000</span> · 120 FPS</div>'+
  '<div class="bd-prog"><i id="bdProg"></i></div>'+
  '<div class="bd-sweep"><i></i><i></i><i></i></div>';

var bp=document.getElementById('bdBp');
var tc=document.getElementById('bdTc'),prog=document.getElementById('bdProg');

/* 4. 把图纸里每一笔排好：位置越靠左上越先画，像一支笔扫过整张图 */
var plan=[];   /* [元素, 过渡] —— 初始状态先落地，再挂过渡，否则浏览器会把“藏起来”也当成动画 */
function prepare(svg){
  var vb=(svg.getAttribute('viewBox')||'0 0 1600 1000').split(/[\s,]+/).map(Number);
  var W=vb[2]||1600,H=vb[3]||1000;
  svg.removeAttribute('width'); svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio','xMinYMin meet');
  var els=svg.querySelectorAll('line,circle,rect,path,polyline,polygon,ellipse,text');
  for(var n=0;n<els.length;n++){
    var el=els[n];
    if(el.closest('defs,pattern')) continue;
    var cx=W/2,cy=H/2;
    try{ var b=el.getBBox(); cx=b.x+b.width/2; cy=b.y+b.height/2; }catch(e){}
    var jit=((n*97)%13)*9;
    var d=ms((cx/W)*820+(cy/H)*420+jit);
    var fill=el.getAttribute('fill')||'';
    var stroke=el.getAttribute('stroke')||'';
    var tag=el.tagName.toLowerCase();

    if(fill.indexOf('url(')===0){                        /* 底纹点阵：先淡入 */
      el.style.opacity='0';
      plan.push([el,'opacity '+ms(500)+'ms ease 0ms']);
      continue;
    }
    if(tag==='text'||el.getAttribute('stroke-dasharray')||!stroke||stroke==='none'){
      el.style.opacity='0';                               /* 文字、虚线、纯色块：落笔后浮现 */
      plan.push([el,'opacity '+ms(420)+'ms ease '+(d+ms(260))+'ms']);
      continue;
    }
    var len=80;
    try{ len=Math.ceil(el.getTotalLength())+2; }catch(e){}
    var dur=ms(Math.max(320,Math.min(1000,300+len*2.2)));
    el.style.strokeDasharray=len+' '+len;
    el.style.strokeDashoffset=String(len);
    var tr='stroke-dashoffset '+dur+'ms cubic-bezier(.65,.02,.25,1) '+d+'ms';
    if(fill&&fill!=='none'){ el.style.fillOpacity='0'; tr+=',fill-opacity '+ms(500)+'ms ease '+(d+dur-ms(120))+'ms'; }
    plan.push([el,tr]);
  }
}
function draw(){
  for(var n=0;n<plan.length;n++){
    var s=plan[n][0].style;
    s.transition=plan[n][1];
    s.opacity=''; s.fillOpacity='';
    if(s.strokeDashoffset) s.strokeDashoffset='0';
  }
}

/* 5. 时间线 */
var DRAW_END=ms(2600),MAX_WAIT=4200,t0=0,state=0;    /* state：0 播放 1 揭幕 2 结束 */
var revealCbs=[],doneCbs=[],started=false;
var loaded=document.readyState==='complete';
window.addEventListener('load',function(){ loaded=true; maybeReveal(); });

function pad(v,n){ v=String(v); while(v.length<n) v='0'+v; return v; }
function frame(now){
  if(state===2) return;
  var e=now-t0;
  if(tc) tc.textContent='TC 00:00:'+pad(Math.floor(e/1000),2)+':'+pad(Math.floor(e%1000/8.333),3);
  if(prog&&state===0) prog.style.transform='scaleX('+Math.min(loaded?1:.92,e/DRAW_END)+')';
  requestAnimationFrame(frame);
}
function start(){
  if(started||state!==0) return;
  started=true;
  if(plan.length) getComputedStyle(plan[plan.length-1][0]).strokeDashoffset;   /* 先让初始状态落地 */
  void loader.offsetWidth;
  requestAnimationFrame(function(){
    t0=performance.now();
    loader.classList.add('bd-play');
    draw();
    requestAnimationFrame(frame);
    setTimeout(maybeReveal,DRAW_END+30);
    setTimeout(function(){ loaded=true; maybeReveal(); },MAX_WAIT);
  });
}
function maybeReveal(){
  if(state!==0||!started) return;
  var e=performance.now()-t0;
  if(e<DRAW_END) return;
  if(!loaded&&e<MAX_WAIT) return;
  reveal(false);
}
/* 揭幕时，如果对话区是空的，标题会直接飞到工作台里同一句「让故事，在此发生」的位置落下 */
function fly(){
  var head=loader.querySelector('.bd-title');
  var tgt=document.querySelector('#chat .empty .em-t');
  if(!head||!tgt) return;
  var A=head.getBoundingClientRect(),B=tgt.getBoundingClientRect();
  if(!B.width||!B.height||B.bottom<0||B.top>window.innerHeight) return;
  var k=parseFloat(getComputedStyle(tgt).fontSize)/parseFloat(getComputedStyle(head).fontSize);
  if(!(k>0)) return;
  var land=ms(760);
  tgt.style.transition='none'; tgt.style.opacity='0';
  loader.classList.add('bd-fly');
  head.style.transformOrigin='0 0';
  head.style.transition='transform '+land+'ms cubic-bezier(.7,0,.2,1) '+ms(120)+'ms,opacity '+ms(220)+'ms ease '+(land+ms(60))+'ms';
  void head.offsetWidth;
  head.style.transform='translate('+(B.left-A.left)+'px,'+(B.top-A.top)+'px) scale('+k+')';
  head.style.opacity='0';
  setTimeout(function(){
    tgt.style.transition='opacity '+ms(200)+'ms ease'; tgt.style.opacity='';
    setTimeout(function(){ tgt.style.transition=''; },400);
  },land+ms(80));
}
function fire(list){ while(list.length){ try{ list.shift()(); }catch(e){} } }
function reveal(fast){
  if(state!==0) return;
  state=1;
  if(prog) prog.style.transform='scaleX(1)';
  if(!fast) fly();
  loader.classList.add(fast?'bd-leave-fast':'bd-leave');
  setTimeout(function(){ fire(revealCbs); },fast?0:ms(220));
  setTimeout(function(){
    state=2;
    loader.classList.add('done');
    fire(doneCbs);
  },fast?280:ms(1260));
}

/* 6. 取图纸：优先用内置副本（boot-art-*.js，双击本地文件也能画）；
      万一没带上，再去读 bg/ 里的同一张图 */
function mount(txt){
  if(state!==0||started) return;
  bp.innerHTML=txt;
  var svg=bp.querySelector('svg');
  if(svg) prepare(svg);
  start();
}
var art=window.TWS_BOOT_ART&&window.TWS_BOOT_ART[theme];
if(art){ mount(art); }
else{
  var fallback=setTimeout(start,900);                 /* 网络太慢就先播标题，不干等 */
  try{
    fetch('bg/tws-'+(mobile?'m-':'')+theme+'.svg').then(function(r){ if(!r.ok) throw 0; return r.text(); })
      .then(function(t){ clearTimeout(fallback); mount(t); })
      .catch(function(){ clearTimeout(fallback); start(); });
  }catch(e){ clearTimeout(fallback); start(); }
}

/* 7. 跳过：按钮、点任意处、Esc / Enter / 空格；切到后台也直接进 */
loader.addEventListener('click',function(){ reveal(true); });
function onKey(e){
  if(state!==0){ document.removeEventListener('keydown',onKey); return; }
  if(e.key==='Escape'||e.key==='Enter'||e.key===' '){ e.preventDefault(); reveal(true); }
}
document.addEventListener('keydown',onKey);
document.addEventListener('visibilitychange',function(){ if(document.hidden&&state===0) reveal(true); });

window.TWSBoot={
  onReveal:function(fn){ if(state>=1) fn(); else revealCbs.push(fn); },
  onDone:function(fn){ if(state===2) fn(); else doneCbs.push(fn); },
  skip:function(){ reveal(true); },
  instant:function(){
    if(state===2) return;
    state=1; fire(revealCbs);
    state=2; loader.classList.add('done'); fire(doneCbs);
  }
};
})();

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

/* 4. 描绘方式（为流畅重写）
   旧做法让 400 多个 SVG 元素各自做描线动画，浏览器每帧都要重画整张图纸，
   开屏时主程序还在解析，主线程一忙就掉帧。现在分三层，全部只动 transform / opacity，
   交给合成器（显卡）跑，主线程再忙也不卡：
   ① 结构线：从图纸里挑出横平竖直的长线和矩形边框，换成 1px 的 div，用 scaleX/scaleY 「画」出来；
   ② 细节：整张图纸静态放好，上面盖一张纸，带柔边的纸面从左向右滑开，把细节「显影」出来；
   ③ 收尾：结构线整体淡出，只剩和工作台背景完全一样的淡色图纸。 */
var plan=[];          /* 保留给 start() 的兼容判断；新做法不再逐元素过渡 */
var cl=null;
function prepare(svg){
  var vb=(svg.getAttribute('viewBox')||'0 0 1600 1000').split(/[\s,]+/).map(Number);
  var W=vb[2]||1600,H=vb[3]||1000;
  svg.removeAttribute('width'); svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio','xMinYMin meet');
  var segs=[];
  function num(el,k){ return parseFloat(el.getAttribute(k))||0; }
  function ok(el){ return !el.closest('defs,pattern,[transform]')&&!el.getAttribute('stroke-dasharray'); }
  var ls=svg.querySelectorAll('line');
  for(var n=0;n<ls.length;n++){
    var l=ls[n]; if(!ok(l)) continue;
    var x1=num(l,'x1'),y1=num(l,'y1'),x2=num(l,'x2'),y2=num(l,'y2');
    if(Math.abs(y2-y1)<.5&&Math.abs(x2-x1)>60) segs.push([Math.min(x1,x2),y1,Math.abs(x2-x1),0]);
    else if(Math.abs(x2-x1)<.5&&Math.abs(y2-y1)>60) segs.push([x1,Math.min(y1,y2),0,Math.abs(y2-y1)]);
  }
  var rs=svg.querySelectorAll('rect');
  for(n=0;n<rs.length;n++){
    var r=rs[n]; if(!ok(r)) continue;
    var f=r.getAttribute('fill')||'';
    if(f&&f!=='none') continue;
    var x=num(r,'x'),y=num(r,'y'),w=num(r,'width'),h=num(r,'height');
    if(w<90||h<90) continue;
    segs.push([x,y,w,0],[x,y+h,w,0],[x,y,0,h],[x+w,y,0,h]);
  }
  if(!segs.length) return;
  cl=document.createElement('div');
  cl.className='bd-cl';
  var html='';
  for(n=0;n<segs.length;n++){
    var g=segs[n],hz=g[3]===0,len=hz?g[2]:g[3];
    var cx=g[0]+g[2]/2,cy=g[1]+g[3]/2;
    var d=ms(60+(cx/W)*560+(cy/H)*300+((n*53)%7)*24);
    var dur=ms(Math.min(1150,620+len*.55));
    html+='<i class="'+(hz?'h':'v')+'" style="left:'+(g[0]/W*100)+'%;top:'+(g[1]/H*100)+'%;'+
      (hz?'width:'+(g[2]/W*100)+'%':'height:'+(g[3]/H*100)+'%')+
      ';animation-duration:'+dur+'ms;animation-delay:'+d+'ms"></i>';
  }
  cl.innerHTML=html;
  bp.parentNode.insertBefore(cl,bp.nextSibling);
  var cover=document.createElement('div');
  cover.className='bd-cover';
  bp.parentNode.insertBefore(cover,cl);
  loader.style.setProperty('--bd-k',String(K));
}
function draw(){ /* 动画全部由 CSS（#loader.bd-play）驱动 */ }

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
  if(!head||!tgt) return false;
  var A=head.getBoundingClientRect(),B=tgt.getBoundingClientRect();
  if(!B.width||!B.height||B.bottom<0||B.top>window.innerHeight) return false;
  var k=parseFloat(getComputedStyle(tgt).fontSize)/parseFloat(getComputedStyle(head).fontSize);
  if(!(k>0)) return false;
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
  return true;
}
/* 对话区已有内容时：标题逐字向上收走，再由一条黄绿线自上而下把纸面“揭”开。
   纸面始终不透明，揭开处直接是主界面，不会出现半透明叠影。返回揭幕结束的时间。 */
var edge=null;
function wipe(){
  loader.classList.add('bd-wipe');
  var sp=loader.querySelectorAll('.bd-title span');
  for(var i=0;i<sp.length;i++) sp[i].style.transitionDelay=ms(i*32)+'ms';
  var at=ms(300),dur=ms(820),ease=' cubic-bezier(.65,0,.3,1) ';
  loader.style.animation='bdWipe '+dur+'ms'+ease+at+'ms both';
  edge=document.createElement('div');
  edge.className='bd-edge';
  edge.style.animation='bdEdge '+dur+'ms'+ease+at+'ms both';
  document.body.appendChild(edge);
  return {at:at,end:at+dur};
}
function fire(list){ while(list.length){ try{ list.shift()(); }catch(e){} } }
function reveal(fast){
  if(state!==0) return;
  state=1;
  if(prog) prog.style.transform='scaleX(1)';
  var w=null;
  if(!fast&&!fly()) w=wipe();
  loader.classList.add(fast?'bd-leave-fast':'bd-leave');
  setTimeout(function(){ fire(revealCbs); },fast?0:(w?w.at:ms(220)));
  setTimeout(function(){
    state=2;
    loader.classList.add('done');
    if(edge&&edge.parentNode) edge.parentNode.removeChild(edge);
    fire(doneCbs);
  },fast?280:(w?w.end+40:ms(1260)));
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

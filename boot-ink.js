/* ==========================================================================
   boot-ink.js · 开屏「墨字落印」（V3.0.0 古典文学风）
   宣纸铺开 → 一条细线从中间向两侧描出 → 「让故事，在此发生。」逐字由墨晕凝成字
   → 朱砂小印落下。揭幕时：对话为空，标题直接飞到工作台里同一句话的位置；
   已有内容，则纸面柔和退去。
   对外接口与旧版 boot-draw.js 完全一致，主程序不用改：
     TWSBoot.onReveal(fn) / TWSBoot.onDone(fn) / TWSBoot.skip() / TWSBoot.instant()
   ========================================================================== */
(function(){
'use strict';
var loader=document.getElementById('loader');
if(!loader) return;
var de=document.documentElement;

/* 1. 先定主题，避免闪一帧错色 */
try{
  var tv=localStorage.getItem('endfield_theme_v2')||'auto';
  if(tv==='auto') tv=(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
  if(tv==='light'||tv==='dark') de.setAttribute('data-theme',tv);
}catch(e){}
var mobile=de.getAttribute('data-shell')==='mobile';

/* 2. 节奏：第一次完整，之后更快 */
var seen=false;
try{ seen=localStorage.getItem('tws_boot_seen')==='1'; localStorage.setItem('tws_boot_seen','1'); }catch(e){}
var K=seen?0.6:1;
function ms(v){ return Math.round(v*K); }
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 3. 骨架 */
var L1='让故事，',L2='在此发生。';
function spans(s,off){
  var h='';
  for(var i=0;i<s.length;i++) h+='<span style="animation-delay:'+ms(520+(off+i)*95)+'ms">'+s[i]+'</span>';
  return h;
}
loader.className='bi-root'+(mobile?' bi-mobile':'');
loader.setAttribute('aria-hidden','true');
loader.style.setProperty('--bi-k',String(K));
loader.innerHTML=
  '<div class="bi-paper"></div>'+
  '<div class="bi-center">'+
    '<div class="bi-title">'+spans(L1,0)+'<br>'+spans(L2,L1.length)+'</div>'+
    '<i class="bi-line" style="animation-delay:'+ms(260)+'ms"></i>'+
    '<div class="bi-sub" style="animation-delay:'+ms(1500)+'ms">To 写作工作台<em>·</em>每一个世界，都始于一句话</div>'+
  '</div>'+
  '<div class="bi-seal" style="animation-delay:'+ms(1650)+'ms"><span>書</span></div>'+
  '<button class="bi-skip" type="button">跳过</button>';

/* 4. 时间线 */
var DRAW_END=ms(2350),MAX_WAIT=4000,t0=0,state=0;   /* 0 播放 1 揭幕 2 结束 */
var revealCbs=[],doneCbs=[];
var loaded=document.readyState==='complete';
window.addEventListener('load',function(){ loaded=true; maybeReveal(); });

function start(){
  if(reduce){ setTimeout(function(){ reveal(true); },0); return; }
  void loader.offsetWidth;
  requestAnimationFrame(function(){
    t0=performance.now();
    loader.classList.add('bi-play');
    setTimeout(maybeReveal,DRAW_END+30);
    setTimeout(function(){ loaded=true; maybeReveal(); },MAX_WAIT);
  });
}
function maybeReveal(){
  if(state!==0||!t0) return;
  var e=performance.now()-t0;
  if(e<DRAW_END) return;
  if(!loaded&&e<MAX_WAIT) return;
  reveal(false);
}

/* 对话为空：标题飞到工作台卷首那句话的位置，一字不跳 */
function fly(){
  var head=loader.querySelector('.bi-title');
  var tgt=document.querySelector('#chat .empty .em-t');
  if(!head||!tgt) return false;
  var A=head.getBoundingClientRect(),B=tgt.getBoundingClientRect();
  if(!B.width||!B.height||B.bottom<0||B.top>window.innerHeight) return false;
  var k=parseFloat(getComputedStyle(tgt).fontSize)/parseFloat(getComputedStyle(head).fontSize);
  if(!(k>0)) return false;
  var land=ms(900);
  tgt.style.transition='none'; tgt.style.opacity='0';
  loader.classList.add('bi-fly');
  head.style.transformOrigin='0 0';
  head.style.transition='transform '+land+'ms cubic-bezier(.65,0,.25,1) '+ms(80)+'ms,opacity '+ms(260)+'ms ease '+(land+ms(40))+'ms';
  void head.offsetWidth;
  head.style.transform='translate('+(B.left-A.left)+'px,'+(B.top-A.top)+'px) scale('+k+')';
  head.style.opacity='0';
  setTimeout(function(){
    tgt.style.transition='opacity '+ms(260)+'ms ease'; tgt.style.opacity='';
    setTimeout(function(){ tgt.style.transition=''; },500);
  },land+ms(60));
  return land+ms(400);
}
function fire(list){ while(list.length){ try{ list.shift()(); }catch(e){} } }
function reveal(fast){
  if(state!==0) return;
  state=1;
  var end=fast?320:0;
  if(!fast){ var f=fly(); end=f||ms(1000); }
  loader.classList.add(fast?'bi-leave-fast':'bi-leave');
  setTimeout(function(){ fire(revealCbs); },fast?0:ms(160));
  setTimeout(function(){
    state=2;
    loader.classList.add('done');
    fire(doneCbs);
  },end);
}

/* 5. 跳过：按钮、点任意处、Esc / Enter / 空格；切到后台直接进 */
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
start();
})();

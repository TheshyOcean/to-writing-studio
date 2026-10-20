/* ==========================================================================
   boot-ink.js · 开屏「墨字显影」（V2.5.0 电脑版）
   To 标识浮现 → 「让故事，在此发生。」逐字由墨晕凝成字 → 细线展开 → Incipit fabula
   揭幕：对话为空时，标题飞到卷首同一句话的位置落下；否则整张纸柔和退去。
   接口与旧版 boot-draw.js 一致：TWSBoot.onReveal / onDone / skip / instant
   ========================================================================== */
(function(){
'use strict';
var loader=document.getElementById('loader');
if(!loader) return;
var de=document.documentElement;

/* 1. 先定主题、夜读配色与灵光，避免闪一帧错色 */
try{
  var tv=localStorage.getItem('endfield_theme_v2')||'auto';
  if(tv==='auto') tv=(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
  if(tv==='light'||tv==='dark') de.setAttribute('data-theme',tv);
  var nv=localStorage.getItem('tws_night')||'ink';
  if(nv!=='violet') de.setAttribute('data-night',nv);
  if(localStorage.getItem('tws_lux')==='1') de.classList.add('lux');
}catch(e){}

/* 2. 节奏：第一次完整，之后更快 */
var seen=false;
try{ seen=localStorage.getItem('tws_boot_seen')==='1'; localStorage.setItem('tws_boot_seen','1'); }catch(e){}
var K=seen?0.62:1;
function ms(v){ return Math.round(v*K); }

/* 3. 骨架 */
var L1='让故事，',L2='在此发生。';
function spans(s,off){
  var h='';
  for(var i=0;i<s.length;i++) h+='<span style="animation-delay:'+ms(520+(off+i)*105)+'ms">'+s[i]+'</span>';
  return h;
}
var LOGO='<svg class="bi-logo" viewBox="0 0 42 42" aria-hidden="true"><defs><linearGradient id="biLg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--ac,#6f63e6)"/><stop offset="1" style="stop-color:var(--ac2,#7f93ff)"/></linearGradient></defs><rect width="42" height="42" rx="13" fill="url(#biLg)"/><path d="M8.5 15.6C13.5 13.2 22 11.6 31.5 11.9c1.1.05 1.3 1.4.2 1.6-8.2.8-16.2 1.9-22.3 3.7-1.2.4-1.8-1.1-.9-1.6z" fill="#fff"/><path d="M19.6 14.6c-.4 5-.7 10.4-.3 15.6.1 1.4 1.3 2 2.3 1" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="27.4" cy="26.6" rx="4.3" ry="4.6" transform="rotate(-18 27.4 26.6)" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="33.6" cy="8.6" r="1.6" fill="#fff" opacity=".85"/></svg>';
loader.className='bi-root';
loader.setAttribute('aria-hidden','true');
loader.style.setProperty('--bi-k',String(K));
loader.innerHTML=
  '<div class="bi-center">'+LOGO+
    '<div class="bi-title">'+spans(L1,0)+'<br>'+spans(L2,L1.length)+'</div>'+
    '<i class="bi-line"></i>'+
    '<div class="bi-sub">Incipit fabula</div>'+
  '</div>'+
  '<button class="bi-skip" type="button">点击任意处进入</button>';

/* 4. 时间线 */
var DRAW_END=ms(2500),MAX_WAIT=4200,t0=0,state=0;   /* 0 播放 1 揭幕 2 结束 */
var revealCbs=[],doneCbs=[];
var loaded=document.readyState==='complete';
window.addEventListener('load',function(){ loaded=true; maybeReveal(); });

function start(){
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

/* 对话为空：标题飞到卷首那句话的位置，一字不跳 */
function fly(){
  var head=loader.querySelector('.bi-title');
  var tgt=document.querySelector('#chat .empty .em-t');
  if(!head||!tgt) return 0;
  var A=head.getBoundingClientRect(),B=tgt.getBoundingClientRect();
  if(!B.width||!B.height||B.bottom<0||B.top>window.innerHeight) return 0;
  var k=parseFloat(getComputedStyle(tgt).fontSize)/parseFloat(getComputedStyle(head).fontSize);
  if(!(k>0)) return 0;
  var land=ms(950);
  tgt.style.transition='none'; tgt.style.opacity='0';
  loader.classList.add('bi-fly');
  head.style.transformOrigin='0 0';
  head.style.transition='transform '+land+'ms cubic-bezier(.65,0,.25,1) '+ms(100)+'ms,opacity '+ms(280)+'ms ease '+(land+ms(60))+'ms';
  void head.offsetWidth;
  head.style.transform='translate('+(B.left-A.left+parseFloat(getComputedStyle(head).paddingLeft)*0)+'px,'+(B.top-A.top)+'px) scale('+k+')';
  head.style.opacity='0';
  setTimeout(function(){
    tgt.style.transition='opacity '+ms(260)+'ms ease'; tgt.style.opacity='';
    setTimeout(function(){ tgt.style.transition=''; },500);
  },land+ms(80));
  return land+ms(420);
}
function fire(list){ while(list.length){ try{ list.shift()(); }catch(e){} } }
function reveal(fast){
  if(state!==0) return;
  state=1;
  var end;
  if(fast){ loader.classList.add('bi-leave-fast'); end=300; fire(revealCbs); }
  else{
    fire(revealCbs);                         /* 先让主界面进场，飞行时能看到落点 */
    var f=0;
    try{ f=fly(); }catch(e){ f=0; }
    if(!f){ loader.classList.add('bi-leave'); end=ms(1100); } else end=f;
  }
  setTimeout(function(){ state=2; loader.classList.add('done'); fire(doneCbs); },end);
}

/* 5. 跳过：点任意处、Esc / Enter / 空格；切到后台直接进 */
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

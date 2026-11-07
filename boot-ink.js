/* ==========================================================================
   boot-ink.js · 开屏「泼墨落笔」（Beta V3.3.2）
   To 标识浮现 → 「让故事，在此发生。」每个字先溅开一团墨，再按笔顺从墨里写出来 → 细线展开 → Incipit fabula
   揭幕：不再让标题飞过去。开屏这行字在原地像墨迹一样淡去，
         卷首同一句话在它自己的位置由淡到浓显现出来——谁都不挪位置。
   字形始终是霞鹜文楷；笔顺数据（boot-strokes.js）只决定先写哪一笔、每一笔往哪走（见第 5 节）。
   拿不到笔顺数据或字体加载太慢时，退回原来的「墨晕凝字」。
   接口与旧版一致：TWSBoot.onReveal / onDone / skip / instant
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

/* 3. 骨架：每个字一个 span，字本身先透明占位（排版和以前完全一样），笔画画在它上面 */
var L1='让故事，',L2='在此发生。';
var STROKES=window.TWS_BOOT_STROKES||null;
function spans(s,off){
  var h='';
  for(var i=0;i<s.length;i++){
    var c=s[i],cls=STROKES&&STROKES[c]?'bi-ch':'bi-pu';
    /* animation-delay 只给退回方案（墨晕凝字）用 */
    h+='<span class="'+cls+'" style="animation-delay:'+ms(520+(off+i)*105)+'ms">'+c+'</span>';
  }
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
var title=loader.querySelector('.bi-title');

/* 4. 时间线 */
var WRITE_AT=ms(380);           /* 标识浮现后落笔（字体晚到就字体到了再落笔） */
var DRAW_END=1e9,t0=0,state=0;  /* 0 播放 1 揭幕 2 结束；DRAW_END 等笔顺排好后才知道 */
var revealCbs=[],doneCbs=[];
var loaded=document.readyState==='complete';
window.addEventListener('load',function(){ loaded=true; maybeReveal(); });

function maybeReveal(){
  if(state!==0||!t0) return;
  var e=performance.now()-t0;
  if(e<DRAW_END) return;
  if(!loaded&&e<DRAW_END+1700) return;   /* 页面还没加载完就再等一会儿，最多 1.7 秒 */
  reveal(false);
}
function setDrawEnd(v){
  DRAW_END=v;
  var left=Math.max(0,t0+v-performance.now());
  setTimeout(maybeReveal,left+30);
  setTimeout(function(){ loaded=true; maybeReveal(); },left+1700);
}

/* 5. 泼墨落笔
   每个字一组画布（湿墨 / 字 / 泼墨 / 墨点）。先用文楷把整字画在离屏画布上，再把每一个有墨的像素
   分给离它最近的那一笔（笔顺数据缩放到文楷字形上之后的行笔中线），并记下它在这一笔里走到百分之几。
   写字时，某一笔进行到 p，就显出这一笔里位置 ≤ p 的像素——笔锋顺着行笔方向往前走。
   所有像素都来自文楷本身，所以写完就是完整的文楷字，不缺笔、不重影。
   泼墨：落笔前先在字的位置溅开一团墨（沿笔画分布的墨团 + 四周甩出的墨点），
   笔锋前面带一层模糊的湿墨（同一份笔画、超前一点），字写完墨晕散去，只留干净的字。

   流畅度（低端手机也不掉帧）：
   · 准备工作拆开做：开播时只排版、排时间（很轻）；每个字的像素归属和泼墨图放进队列，
     每帧最多做 6 ms，轮到哪个字写了还没算好才当场补算；
   · 等页面主程序初始化完、帧率稳住再落笔（最多等 1.5 秒），写字不和页面的长任务抢主线程；
   · 每帧只把这一帧动到的那几笔所在的矩形写回画布；湿墨层用半分辨率（本来就是模糊的）；
   · 泼墨、墨点的模糊直接画进位图，动画只动 transform / opacity，交给显卡；
   · 结束后清空画布、释放内存。 */
var FONT='"LXGW WenKai"',WEIGHT='500';
var BASE=880;     /* 字形在 1000×1000（1em）方框里的基线 */
var PAD=0.12;     /* 字画布四周各留 0.12em，装下伸出方框的笔画 */
var SPAD=0.5;     /* 泼墨画布四周各留 0.5em，装下飞溅的墨点 */
var SOFT=0.09;    /* 笔锋前沿的柔边宽度（占一笔长度的比例） */
var LEAD=0.36;    /* 湿墨层比笔锋超前多少（占一笔长度的比例） */
var WR=2;         /* 湿墨层分辨率缩小倍数 */
var COVER=50;     /* 离行笔中线 50/1000 em 以内，算在这一笔的笔身里 */
var chars=[];     /* 每个字的画布、笔画与像素数据 */
var plan=[];      /* 每一笔：{ci, k, a, b} 从 a 写到 b（相对 t0 的毫秒） */
var marks=[];     /* 到点加 class：泼墨溅开、写完、标点落下、整句写完 */
var queue=[];     /* 待准备的字 */

function fitTo(m,b){
  /* 文楷字形的墨迹范围（1000px 字号下，相对基线原点） → 笔顺数据的缩放平移 */
  var x0=-m.actualBoundingBoxLeft,x1=m.actualBoundingBoxRight,
      y0=BASE-m.actualBoundingBoxAscent,y1=BASE+m.actualBoundingBoxDescent;
  var sx=(x1-x0)/(b[2]-b[0]),sy=(y1-y0)/(b[3]-b[1]);
  return [sx,sy,x0-b[0]*sx,y0-b[1]*sy];
}
function canvas(cls,w,cssW){
  var c=document.createElement('canvas');
  c.width=c.height=w; c.className=cls;
  c.style.width=c.style.height=cssW+'px';
  return c;
}
function rnd(seed){ return function(){ seed=(seed+0x6D2B79F5)|0; var t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

/* 轻：建画布、排版、算行笔中线（像素坐标）与每一笔的长度 */
function setup(c,d,fs,dpr,meas,rgb,seed){
  var box=1+2*PAD,S=Math.ceil(fs*box*dpr),k=S/(box*1000),off=PAD*1000;
  var f=fitTo(meas,d.b),lines=[];
  for(var s=0;s<d.m.length;s++){
    var pts=[],cum=[0],L=0;
    for(var j=0;j<d.m[s].length;j++){
      var q=d.m[s][j];
      pts.push([(q[0]*f[0]+f[2]+off)*k,(q[1]*f[1]+f[3]+off)*k]);
      if(j){ L+=Math.sqrt(Math.pow(pts[j][0]-pts[j-1][0],2)+Math.pow(pts[j][1]-pts[j-1][1],2)); cum.push(L); }
    }
    lines.push({pts:pts,cum:cum,L:L||1,len:(L||1)/k});
  }
  var Sw=Math.ceil(S/WR),SS=Math.ceil(fs*(1+2*SPAD)*dpr);
  return {c:c,S:S,Sw:Sw,SS:SS,k:k,off:off,fs:fs,dpr:dpr,rgb:rgb,seed:seed,lines:lines,ready:false,
    cv:canvas('bi-glyph',S,S/dpr),wash:canvas('bi-wash',Sw,S/dpr),
    spl:canvas('bi-splash',SS,SS/dpr),drp:canvas('bi-drops',SS,SS/dpr)};
}

/* 重：像素归属 + 泼墨图。放进队列分帧做 */
function prep(ch){
  if(ch.ready) return;
  var S=ch.S,k=ch.k,lines=ch.lines,nS=lines.length;
  var src=document.createElement('canvas'); src.width=src.height=S;
  var sg=src.getContext('2d',{willReadFrequently:true});
  sg.font=WEIGHT+' '+(1000*k)+'px '+FONT;
  sg.fillStyle='#000';
  sg.fillText(ch.c,ch.off*k,(BASE+ch.off)*k);
  var A=sg.getImageData(0,0,S,S).data;
  /* 线段压成扁平数组：起点、方向、1/长度²、在整笔里的起止位置、属于第几笔 */
  var nSeg=0,i,j,s;
  for(s=0;s<nS;s++) nSeg+=Math.max(1,lines[s].pts.length-1);
  var SG=new Float64Array(nSeg*7),SI=new Int16Array(nSeg),n=0;
  for(s=0;s<nS;s++){
    var P=lines[s].pts,C=lines[s].cum,L=lines[s].L;
    if(P.length===1){ SG.set([P[0][0],P[0][1],0,0,0,0,0],n*7); SI[n++]=s; continue; }
    for(j=1;j<P.length;j++){
      var vx=P[j][0]-P[j-1][0],vy=P[j][1]-P[j-1][1],vv=vx*vx+vy*vy;
      SG.set([P[j-1][0],P[j-1][1],vx,vy,vv?1/vv:0,C[j-1]/L,(C[j]-C[j-1])/L],n*7); SI[n++]=s;
    }
  }
  var cover2=Math.pow(COVER*k,2),dist=new Float64Array(nS),pos=new Float64Array(nS);
  var bP=[],bT=[],bA=[],bW=[];
  for(s=0;s<nS;s++){ bP.push([]); bT.push([]); bA.push([]); bW.push([]); }
  var Sw=ch.Sw;
  for(var y=0;y<S;y++) for(var x=0;x<S;x++){
    i=y*S+x;
    var a=A[i*4+3];
    if(a<6) continue;
    var px=x+.5,py=y+.5;
    for(s=0;s<nS;s++) dist[s]=1e18;
    for(n=0;n<nSeg;n++){
      var o=n*7,ax=SG[o],ay=SG[o+1],ux=SG[o+2],uy=SG[o+3],u=((px-ax)*ux+(py-ay)*uy)*SG[o+4];
      u=u<0?0:u>1?1:u;
      var ex=ax+u*ux-px,ey=ay+u*uy-py,d2=ex*ex+ey*ey;
      s=SI[n];
      if(d2<dist[s]){ dist[s]=d2; pos[s]=SG[o+5]+u*SG[o+6]; }
    }
    /* 交叉、相接处同时落在几笔的笔身里 → 归给先写的那一笔（否则先写的那笔上会出现空洞）；
       谁也没盖住 → 最近的那一笔 */
    var bs=-1,dm=1e18;
    for(s=0;s<nS;s++){ if(dist[s]<=cover2){ bs=s; break; } if(dist[s]<dm){ dm=dist[s]; } }
    if(bs<0) for(s=0;s<nS;s++) if(dist[s]===dm){ bs=s; break; }
    bP[bs].push(i); bT[bs].push(pos[bs]); bA[bs].push(a);
    bW[bs].push(((y/WR)|0)*Sw+((x/WR)|0));
  }
  ch.strokes=[];
  for(s=0;s<nS;s++){
    var px_=new Int32Array(bP[s]),x0=S,y0=S,x1=0,y1=0;
    for(j=0;j<px_.length;j++){ var xx=px_[j]%S,yy=(px_[j]/S)|0; if(xx<x0)x0=xx; if(xx>x1)x1=xx; if(yy<y0)y0=yy; if(yy>y1)y1=yy; }
    ch.strokes.push({px:px_,t:new Float32Array(bT[s]),A:new Uint8Array(bA[s]),w:new Int32Array(bW[s]),
      box:px_.length?[x0,y0,x1+1,y1+1]:[0,0,0,0]});
  }
  /* 两层画布的像素缓冲：颜色先填好，之后只改透明度 */
  var rgb=ch.rgb;
  function buf(cv,w){
    var g=cv.getContext('2d'),im=g.createImageData(w,w),D=im.data;
    for(var q=0;q<w*w;q++){ D[q*4]=rgb[0]; D[q*4+1]=rgb[1]; D[q*4+2]=rgb[2]; }
    return {g:g,im:im};
  }
  ch.ink=buf(ch.cv,S); ch.wet=buf(ch.wash,Sw);
  splash(ch);
  ch.ready=true;
}

/* 泼墨图：沿每一笔放几团不规则墨团（模糊直接画进位图），再往四周甩墨点。只画一次 */
function splash(ch){
  var SS=ch.SS,sk=SS/((1+2*SPAD)*1000),u=sk/ch.k,sh=(SPAD-PAD)*1000*ch.k;
  var R=rnd(ch.seed),rgb=ch.rgb,col='rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',';
  var g=ch.spl.getContext('2d'),FAR=SS*4;
  /* 画在画布外面，只让阴影落进来：等于一个带模糊的墨团（Safari 也支持，比 CSS 模糊省） */
  g.shadowOffsetX=FAR; g.shadowBlur=ch.fs*.11*ch.dpr; g.fillStyle='#000';
  function blot(x,y,r,a){
    var n=16,ph=R()*6.28,w1=.18+R()*.14,w2=.08+R()*.08;
    for(var layer=0;layer<3;layer++){
      var rr=r*(1-layer*.28);
      g.shadowColor=col+(a*(.55+layer*.25))+')';
      g.beginPath();
      for(var i=0;i<=n;i++){
        var t=i/n*Math.PI*2,q=rr*(1+w1*Math.sin(3*t+ph)+w2*Math.sin(7*t+ph*2));
        var px=x+Math.cos(t)*q-FAR,py=y+Math.sin(t)*q;
        if(i) g.lineTo(px,py); else g.moveTo(px,py);
      }
      g.closePath(); g.fill();
    }
  }
  var lines=ch.lines;
  for(var s=0;s<lines.length;s++){
    var P=lines[s].pts,L=lines[s].L,cum=lines[s].cum,n=Math.max(1,Math.round(L/(240*ch.k)));
    for(var i=0;i<=n;i++){
      var want=L*i/n,j=1;
      while(j<P.length-1&&cum[j]<want) j++;
      var a=P[j-1]||P[0],b=P[j]||P[0],c0=cum[j-1]||0,c1=cum[j]||1;
      var f=P.length>1?Math.min(1,Math.max(0,(want-c0)/((c1-c0)||1))):0;
      blot((a[0]+(b[0]-a[0])*f+sh)*u+(R()-.5)*50*sk,(a[1]+(b[1]-a[1])*f+sh)*u+(R()-.5)*50*sk,(110+R()*60)*sk,.2+R()*.1);
    }
  }
  /* 墨点单独一层、保持清晰：离字心 340–720，大小不一；一部分甩出一道细尾，指向字心 */
  g=ch.drp.getContext('2d');
  var cx=SS/2,cy=SS/2,drops=14+Math.floor(R()*8);
  for(i=0;i<drops;i++){
    var ang=R()*Math.PI*2,dd=(340+R()*380)*sk,rr=(8+R()*R()*36)*sk;
    var dx=cx+Math.cos(ang)*dd,dy=cy+Math.sin(ang)*dd;
    g.fillStyle=col+(.75+R()*.25)+')';
    g.beginPath(); g.arc(dx,dy,rr,0,Math.PI*2); g.fill();
    if(R()<.45){
      var tl=rr*(3+R()*4);
      g.strokeStyle=col+'.5)'; g.lineWidth=rr*.55; g.lineCap='round';
      g.beginPath(); g.moveTo(dx,dy); g.lineTo(dx-Math.cos(ang)*tl,dy-Math.sin(ang)*tl); g.stroke();
    }
    if(R()<.35){ g.beginPath(); g.arc(dx+Math.cos(ang)*rr*2.4,dy+Math.sin(ang)*rr*2.4,rr*.4,0,Math.PI*2); g.fill(); }
  }
}
function pump(){
  var t=performance.now();
  while(queue.length&&performance.now()-t<6) prep(queue.shift());
  if(queue.length&&state===0) requestAnimationFrame(pump);
}

/* 某一笔走到 p：改这一笔像素的透明度，并记下这一帧要写回的矩形 */
function paint(ch,k,p){
  var s=ch.strokes[k],D=ch.ink.im.data,W=ch.wet.im.data,q=p*(1+SOFT),w=p*(1+SOFT+LEAD)+(p>0?LEAD*.25:0);
  var P=s.px,T=s.t,AA=s.A,WI=s.w,ws=SOFT*2.5;
  for(var n=0;n<P.length;n++){
    var v=(q-T[n])/SOFT; v=v<0?0:v>1?1:v;
    var z=(w-T[n])/ws; z=z<0?0:z>1?1:z;
    D[P[n]*4+3]=AA[n]*v;
    W[WI[n]*4+3]=AA[n]*z;
  }
  var b=s.box,d=ch.dirty;
  if(!d) ch.dirty=[b[0],b[1],b[2],b[3]];
  else{ if(b[0]<d[0])d[0]=b[0]; if(b[1]<d[1])d[1]=b[1]; if(b[2]>d[2])d[2]=b[2]; if(b[3]>d[3])d[3]=b[3]; }
}
function flush(ch){
  var d=ch.dirty; ch.dirty=null;
  if(!d||d[2]<=d[0]||d[3]<=d[1]) return;
  ch.ink.g.putImageData(ch.ink.im,0,0,d[0],d[1],d[2]-d[0],d[3]-d[1]);
  var x0=Math.max(0,((d[0]/WR)|0)-1),y0=Math.max(0,((d[1]/WR)|0)-1),
      x1=Math.min(ch.Sw,Math.ceil(d[2]/WR)+1),y1=Math.min(ch.Sw,Math.ceil(d[3]/WR)+1);
  ch.wet.g.putImageData(ch.wet.im,0,0,x0,y0,x1-x0,y1-y0);
}

/* 开播后：排版、建画布、把准备工作排进队列（都很轻） */
var items=[];
function layout(){
  var cs=getComputedStyle(title),fs=parseFloat(cs.fontSize)||40;
  var dpr=Math.min(window.devicePixelRatio||1,3);
  var rgb=(cs.color.match(/\d+(\.\d+)?/g)||[31,27,51]).map(Number);
  var mc=document.createElement('canvas').getContext('2d');
  mc.font=WEIGHT+' 1000px '+FONT;
  var spansEl=title.querySelectorAll('span'),probes=[],i;
  /* 一次排版读出所有字的基线（先全部插入探针，再一起读，只触发一次布局） */
  for(i=0;i<spansEl.length;i++){ var pr=document.createElement('i'); pr.className='bi-probe'; spansEl[i].appendChild(pr); probes.push(pr); }
  var bases=[];
  for(i=0;i<spansEl.length;i++) bases.push(probes[i].getBoundingClientRect().top-spansEl[i].getBoundingClientRect().top);
  for(i=0;i<spansEl.length;i++) spansEl[i].removeChild(probes[i]);
  for(i=0;i<spansEl.length;i++){
    var sp=spansEl[i],c=sp.textContent,d=STROKES[c];
    if(!d){ items.push({sp:sp}); continue; }
    var meas=mc.measureText(c);
    if(!(meas.actualBoundingBoxRight>0)) return false;
    var ch=setup(c,d,fs,dpr,meas,rgb,i*977+13);
    var top=bases[i]-(BASE/1000+PAD)*fs;
    ch.cv.style.left=ch.wash.style.left=(-PAD*fs)+'px';
    ch.cv.style.top=ch.wash.style.top=top+'px';
    ch.spl.style.left=ch.drp.style.left=(-SPAD*fs)+'px';
    ch.spl.style.top=ch.drp.style.top=(top-(SPAD-PAD)*fs)+'px';
    sp.appendChild(ch.spl); sp.appendChild(ch.drp); sp.appendChild(ch.wash); sp.appendChild(ch.cv);
    chars.push(ch); queue.push(ch);
    items.push({sp:sp,ci:chars.length-1});
  }
  return true;
}
/* 排时间：字与字错开 STAG 起笔、前后接着写（连写）；每个字在 CH 内写完，按笔画长短分配 */
function schedule(startAt){
  var STAG=ms(130),CH=ms(470),PS=ms(6),MIN=ms(22),end=0;
  for(var i=0;i<items.length;i++){
    var it=items[i],t=startAt+i*STAG;
    if(it.ci==null){ marks.push({el:it.sp,at:t+ms(160),cls:'bi-on'}); continue; }
    var ln=chars[it.ci].lines,Lc=0,k;
    for(k=0;k<ln.length;k++) Lc+=ln[k].len;
    var u=Math.max(0,(CH-ln.length*(MIN+PS)))/Lc;
    marks.push({el:it.sp,at:t-ms(60),cls:'bi-on',ci:it.ci});   /* 泼墨先溅开 */
    for(k=0;k<ln.length;k++){
      var dur=MIN+ln[k].len*u;
      plan.push({ci:it.ci,k:k,a:t,b:t+dur});
      t+=dur+PS;
    }
    marks.push({el:it.sp,at:t,cls:'bi-done'});                  /* 写完：湿墨、泼墨散去 */
    if(t>end) end=t;
  }
  plan.sort(function(x,y){ return x.a-y.a; });
  marks.sort(function(x,y){ return x.at-y.at; });
  marks.push({el:loader,at:end+ms(80),cls:'bi-written'});
  return end;
}
function ease(p){ return p<=0?0:p>=1?1:.5-.5*Math.cos(Math.PI*p); }   /* 起笔慢、行笔快、收笔慢 */
var pi=0,mi=0,vt=-1,lastNow=0;
function tick(now){
  if(state===2) return;
  /* 虚拟时钟：主线程偶尔卡一下时，每帧最多只往前走 34 ms——动画原地稍等再接着写，不会一下跳过好几笔 */
  if(vt<0) vt=now-t0; else vt+=Math.min(now-lastNow,34);
  lastNow=now;
  var e=vt,i;
  while(mi<marks.length&&marks[mi].at<=e){
    var mk=marks[mi++];
    if(mk.ci!=null) prep(chars[mk.ci]);            /* 万一还没算好，当场补上 */
    mk.el.classList.add(mk.cls);
    if(mk.el===loader&&mk.cls==='bi-written') setDrawEnd(now-t0+ms(300));   /* 真写完了才开始计揭幕 */
  }
  for(i=pi;i<plan.length;i++){
    var s=plan[i];
    if(s.a>e) break;
    if(s.fin) continue;
    var ch=chars[s.ci];
    prep(ch);
    var p=ease((e-s.a)/(s.b-s.a));
    paint(ch,s.k,p);
    if(p>=1) s.fin=1;
  }
  while(pi<plan.length&&plan[pi].fin) pi++;
  for(i=0;i<chars.length;i++) if(chars[i].dirty) flush(chars[i]);
  if(mi<marks.length||pi<plan.length) requestAnimationFrame(tick);
}

/* 等页面主程序初始化完、帧率稳住（连续 3 帧间隔 < 22 ms）再落笔；最多等 1.5 秒 */
function whenCalm(cb){
  var deadline=0,last=0,good=0;
  function f(t){
    if(state!==0) return;
    if(last&&t-last<22) good++; else good=0;
    last=t;
    if(good>=3||performance.now()>deadline) cb(); else requestAnimationFrame(f);
  }
  function arm(){ deadline=performance.now()+1500; requestAnimationFrame(f); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',arm); else arm();
}

/* 标识、细线照常先出场；字体到了、页面也稳了就落笔。字体等太久（或条件不够）就退回墨晕凝字 */
var mode='';
function play(){
  void loader.offsetWidth;
  requestAnimationFrame(function(){
    t0=performance.now();
    loader.classList.add('bi-play');
    if(mode) go(mode);
  });
}
function go(m){
  if(state!==0) return;
  if(!t0){ mode=m; return; }        /* 还没开播，开播时再落笔 */
  if(go.done) return;
  go.done=1;
  var ok=false;
  if(m==='write'){ try{ ok=layout(); }catch(e){ ok=false; } }
  if(!ok){
    loader.classList.add('bi-plain');     /* 墨晕凝字的延时从这一刻算起 */
    setDrawEnd(performance.now()-t0+ms(2500));
    return;
  }
  requestAnimationFrame(pump);            /* 边等边准备 */
  whenCalm(function(){
    if(state!==0) return;
    var now=performance.now()-t0,end;
    try{ end=schedule(Math.max(WRITE_AT,now+ms(40))); }catch(e){ end=0; }
    if(!end){ loader.classList.add('bi-plain'); setDrawEnd(now+ms(2500)); return; }
    loader.classList.add('bi-write');
    requestAnimationFrame(tick);              /* 揭幕时间在整句写完（bi-written）时再定 */
  });
}
var canWrite=!!(STROKES&&document.fonts&&document.fonts.load&&document.createElement('canvas').getContext&&window.Int32Array);
if(canWrite){
  var giveUp=setTimeout(function(){ go('plain'); },1600);
  document.fonts.load(WEIGHT+' 40px '+FONT,'让故事在此发生').then(function(list){
    clearTimeout(giveUp);
    go(list&&list.length?'write':'plain');
  },function(){ clearTimeout(giveUp); go('plain'); });
}else go('plain');
play();

/* 6. 揭幕：开屏的字原地淡去，卷首那句原地显现，谁都不挪位置 */
function inkIn(tgt,delay){
  /* 把卷首标题临时拆成一字一 span，逐字由淡到浓；结束后还原成原来的 HTML */
  var save=tgt.innerHTML,n=0,step=ms(40);
  function wrap(node){
    var kids=[].slice.call(node.childNodes);
    for(var i=0;i<kids.length;i++){
      var k=kids[i];
      if(k.nodeType===3){
        var frag=document.createDocumentFragment(),s=k.nodeValue;
        for(var j=0;j<s.length;j++){
          if(/\s/.test(s[j])){ frag.appendChild(document.createTextNode(s[j])); continue; }
          var sp=document.createElement('span');
          sp.className='bi-in';
          sp.style.animationDelay=(delay+(n++)*step)+'ms';
          sp.textContent=s[j];
          frag.appendChild(sp);
        }
        node.replaceChild(frag,k);
      }else if(k.nodeType===1&&k.tagName!=='BR'){
        if(k.children.length) wrap(k);
        else{ k.classList.add('bi-in-el'); k.style.animationDelay=(delay+(n++)*step)+'ms'; }
      }
    }
  }
  wrap(tgt);
  var total=delay+n*step+ms(700);
  setTimeout(function(){ if(tgt.querySelector('.bi-in,.bi-in-el')) tgt.innerHTML=save; },total+60);
  return total;
}
function crossfade(){
  var tgt=document.querySelector('#chat .empty .em-t');
  if(!tgt) return 0;
  var B=tgt.getBoundingClientRect();
  if(!B.width||!B.height||B.bottom<0||B.top>window.innerHeight) return 0;
  /* ① 开屏的字在纸面上逐字淡去（不位移，只是墨色褪掉、微微晕开） */
  var chs=title.querySelectorAll('span');
  for(var i=0;i<chs.length;i++) chs[i].style.transitionDelay=ms(i*25)+'ms';
  loader.classList.add('bi-out');
  /* ② 字淡得差不多了，纸面变透明、主界面进场 */
  var AT=ms(340);
  setTimeout(function(){ loader.classList.add('bi-clear'); fire(revealCbs); },AT);
  /* ③ 卷首那句在自己的位置由淡到浓显现 */
  return Math.max(inkIn(tgt,AT+ms(180)),AT+ms(800));
}
function fire(list){ while(list.length){ try{ list.shift()(); }catch(e){} } }
function reveal(fast){
  if(state!==0) return;
  state=1;
  var end;
  if(fast){ loader.classList.add('bi-leave-fast'); end=300; fire(revealCbs); }
  else{
    var f=0;
    try{ f=crossfade(); }catch(e){ f=0; }
    if(!f){ fire(revealCbs); loader.classList.add('bi-leave'); end=ms(1100); } else end=f;
  }
  setTimeout(function(){
    state=2; loader.classList.add('done'); fire(doneCbs);
    /* 清空画布、释放内存（开屏不会再出现） */
    setTimeout(function(){ loader.innerHTML=''; chars=[]; plan=[]; marks=[]; queue=[]; },60);
  },end);
}

/* 7. 跳过：点任意处、Esc / Enter / 空格；切到后台直接进 */
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

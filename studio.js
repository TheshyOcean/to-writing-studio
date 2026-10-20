/* ==========================================================================
   studio.js · V2.5.0 电脑版「书斋」界面增强（只在 desktop.html 加载）
   - 左栏：正在写的作品卡 / 导航（中文 + 拉丁名）/ 工具行（昼夜、模型标识）/ 落款
   - 纸面页眉：作品与章节、灵光小签、常用按钮
   - 右侧页边：今日落笔、上下文、本章伏笔、出场人物
   - 温度胶囊：史诗题词显影版
   - 灵光模式（TWSLux）：整页紫→金；请求换深度思考模型、放宽输出、带上全部设定与更多前文
   - 夜读配色：墨夜 / 青金 / 烛照 / 堇夜
   原有的对话、书稿、设定、伏笔逻辑全部不改，只调用它们暴露的接口。
   ========================================================================== */
(function(){
'use strict';
var root=document.documentElement;
if(root.dataset.shell!=='desktop') return;
var api=window.__ENDF__;
if(!api) return;
var S=api.S;
var VERSION='Preview V2.5.2';
function $(id){ return document.getElementById(id); }
function store(k,v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v); }catch(e){ return null; } }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function D(){ return window.TWS&&window.TWS.data; }
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function roman(n){ var r='',m=[[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]; n=Math.max(1,Math.min(39,n|0)); m.forEach(function(p){ while(n>=p[0]){ r+=p[1]; n-=p[0]; } }); return r; }
var CN='零一二三四五六七八九十';
function cnNum(n){ if(n<=10) return CN[n]; if(n<20) return '十'+(n%10?CN[n%10]:''); if(n<100) return CN[Math.floor(n/10)]+'十'+(n%10?CN[n%10]:''); return String(n); }
function icon(p,w){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(w||1.6)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'; }

var LOGO='<svg viewBox="0 0 42 42" aria-hidden="true"><defs><linearGradient id="stLg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--ac)"/><stop offset="1" style="stop-color:var(--ac2)"/></linearGradient></defs><rect width="42" height="42" rx="13" fill="url(#stLg)"/><path d="M8.5 15.6C13.5 13.2 22 11.6 31.5 11.9c1.1.05 1.3 1.4.2 1.6-8.2.8-16.2 1.9-22.3 3.7-1.2.4-1.8-1.1-.9-1.6z" fill="#fff"/><path d="M19.6 14.6c-.4 5-.7 10.4-.3 15.6.1 1.4 1.3 2 2.3 1" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="27.4" cy="26.6" rx="4.3" ry="4.6" transform="rotate(-18 27.4 26.6)" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="33.6" cy="8.6" r="1.6" fill="#fff" opacity=".85"/></svg>';
/* 统一的模型标识：一架小星盘（原创） */
var MARK='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.1" opacity=".35"/><g class="orb"><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-28 12 12)" stroke="currentColor" stroke-width="1.2"/><circle cx="20.6" cy="7.6" r="1.5" fill="currentColor"/></g><path class="star" d="M12 6.6c.5 3 1.9 4.4 4.9 5.4-3 1-4.4 2.4-4.9 5.4-.5-3-1.9-4.4-4.9-5.4 3-1 4.4-2.4 4.9-5.4z" fill="currentColor"/></svg>';

/* ============================================================
   服务商识别
   ============================================================ */
var PV=[
  {re:/deepseek/i,name:'DeepSeek',ds:true},
  {re:/openai|gpt|\bo[134]\b|chatgpt/i,name:'OpenAI'},
  {re:/glm|zhipu|bigmodel|chatglm/i,name:'智谱 GLM'},
  {re:/qwen|dashscope|tongyi|aliyun/i,name:'通义千问'},
  {re:/kimi|moonshot/i,name:'Kimi'},
  {re:/claude|anthropic/i,name:'Claude'},
  {re:/gemini|generativelanguage/i,name:'Gemini'},
  {re:/doubao|volces/i,name:'豆包'},
  {re:/ernie|wenxin|qianfan/i,name:'文心'},
  {re:/hunyuan/i,name:'混元'}];
function provider(){
  var s=(S.provider||'')+' '+(S.baseUrl||'')+' '+(S.model||'');
  for(var i=0;i<PV.length;i++) if(PV[i].re.test(s)) return PV[i];
  return {name:S.provider||'自定义'};
}

/* ============================================================
   灵光模式（TWSLux）
   ============================================================ */
var LUX_DS_MODEL='deepseek-v4-pro';      /* DeepSeek 官方文档当前列出的旗舰模型 */
var LUX_MAX_TOKENS=32768;
var lux=store('tws_lux')==='1';
function luxModelLabel(){
  var p=provider();
  if(!lux) return S.model||'';
  return p.ds?LUX_DS_MODEL+' · 深思':(S.model||'')+' · 灵光';
}
function extraContext(){
  var d=D(); if(!d) return '';
  var DD=d.D, pid=DD.activeProject; if(!pid) return '';
  var out=[];
  /* 全部设定（勾选的已在正常提示里，这里补上其余的） */
  var rest=d.listCards(pid).filter(function(c){ return !c.on; });
  if(rest.length){
    out.push('【其余设定（灵光模式：全部带上）】\n'+rest.map(function(c){
      var a=c.attrs||{},parts=[];
      if(c.body) parts.push(c.body);
      Object.keys(a).forEach(function(k){ if(a[k]) parts.push(k+'：'+a[k]); });
      return '- '+c.name+'（'+(d.CARD_KINDS[c.kind]||'设定')+'）：'+(parts.join('，')||'（无描述）');
    }).join('\n'));
  }
  /* 未回收的伏笔 */
  var open=d.listThreads(pid).filter(function(t){ return t.status!=='done'; });
  if(open.length) out.push('【尚未回收的伏笔】\n'+open.map(function(t){ return '- '+t.name+(t.note?'：'+t.note:''); }).join('\n'));
  /* 当前章正文与上一章结尾 */
  var chs=allChapters(pid), cur=DD.activeChapter, ci=-1;
  chs.forEach(function(c,i){ if(c.id===cur) ci=i; });
  if(ci>0&&chs[ci-1].content){ out.push('【上一章「'+chs[ci-1].title+'」结尾】\n'+String(chs[ci-1].content).slice(-1800)); }
  if(ci>=0&&chs[ci].content){ out.push('【当前章「'+chs[ci].title+'」已写正文（较长时只取最近部分）】\n'+String(chs[ci].content).slice(-8000)); }
  if(!out.length) return '';
  return '\n\n'+out.join('\n\n')+'\n\n（灵光模式已开启：请充分利用以上设定、伏笔与前文，先深入构思再动笔，篇幅可以更长、更完整。）';
}
function allChapters(pid){
  var d=D(); if(!d) return [];
  var r=[]; d.listVolumes(pid).forEach(function(v){ r=r.concat(d.listChapters(v.id)); });
  return r;
}
function patchBody(body){
  var p=provider();
  if(p.ds){
    if(lux){
      body.model=LUX_DS_MODEL;
      body.thinking={type:'enabled'};
      body.max_tokens=Math.max(body.max_tokens||0,LUX_MAX_TOKENS);
    }else if(/^deepseek-(flash|v4)/i.test(body.model||'')){
      body.thinking={type:'disabled'};      /* 新模型默认会思考；日常模式关掉，快、省、温度也生效 */
    }
  }
  return body;
}
window.TWSLux={
  on:function(){ return lux; },
  extra:function(){ return lux?extraContext():''; },
  patch:patchBody
};

/* ============================================================
   左栏
   ============================================================ */
var LAT={'v-chat':'Colloquium','studioHistory':'Archivum','v-book':'Codex','v-lore':'Thesaurus','v-threads':'Vestigia','__soon':'Collegium','v-cfg':'Officina'};
var LABEL={'v-chat':'创作对话','studioHistory':'对话档案','v-book':'书稿','v-lore':'设定库','v-threads':'伏笔与时间线','__soon':'协作室','v-cfg':'系统配置'};
var built=false, opusMode=store('tws_opus_mode')||'book';
function buildRail(){
  var rail=document.querySelector('.rail');
  if(!rail||built||!$('railBook')) return false;
  built=true;
  rail.querySelectorAll('.rail-btn').forEach(function(b){
    var k=b.id==='studioHistory'?'studioHistory':b.dataset.go;
    var sp=b.querySelector('span'); if(sp&&LABEL[k]) sp.textContent=LABEL[k];
    if(LAT[k]&&!b.querySelector('em')){ var em=document.createElement('em'); em.textContent=LAT[k]; b.appendChild(em); }
  });
  var opus=document.createElement('div');
  opus.className='st-opus';
  opus.innerHTML='<div class="st-sh st-osw" id="stOpusSh" role="tablist" aria-label="左栏顶部显示"><button type="button" role="tab" data-m="book">正在写 <i>Opus</i></button><button type="button" role="tab" data-m="quote">今日一句 <i>Sententia</i></button></div>'+
    '<button type="button" class="st-book" id="stBook" title="打开书稿"><b id="stBookName"></b><span class="m" id="stBookCh"></span><span class="st-bar"><i id="stBookBar" style="width:0"></i></span><span class="m" id="stBookMeta" style="font-size:12px"></span></button>'+
    '<div class="st-quote" id="stQuote"><p class="q" id="stQ"></p><p class="tr" id="stQTr"></p><p class="src" id="stQSrc"></p><button type="button" class="st-qnew" id="stQNew">开始第一部作品 →</button></div>';
  rail.insertBefore(opus,rail.firstChild);
  $('stBook').addEventListener('click',function(){ window.showView&&window.showView('v-book'); });
  $('stQNew').addEventListener('click',function(){
    var st=curState();
    if(st.book){ opusMode='book'; store('tws_opus_mode','book'); refreshAll(); }
    else window.showView&&window.showView('v-book');
  });
  opus.querySelectorAll('.st-osw button').forEach(function(b){ b.addEventListener('click',function(e){
    e.stopPropagation(); opusMode=b.dataset.m; store('tws_opus_mode',b.dataset.m); refreshAll();
  }); });
  var fresh=$('studioNew'), firstNav=rail.querySelector('.rail-btn');
  if(fresh&&firstNav) rail.insertBefore(fresh,firstNav);
  /* 工具行：昼夜切换 + 模型 */
  var foot=document.createElement('div'); foot.className='st-foot';
  var th=$('btnTheme'); if(th) foot.appendChild(th);
  var mdl=document.createElement('button'); mdl.type='button'; mdl.className='st-model'; mdl.id='stModel'; mdl.title='切换模型';
  mdl.innerHTML='<span class="pv" id="stPv" role="img">'+MARK+'</span><span class="nm" id="stModelName"></span>';
  mdl.addEventListener('click',function(){ api.openModelPicker&&api.openModelPicker(); });
  foot.appendChild(mdl);
  rail.appendChild(foot);
  var col=document.createElement('div'); col.className='st-colophon';
  col.innerHTML=LOGO+'<b>写作工作台</b><span class="lat">To Writing Studio</span><span class="ver">'+VERSION+'</span>';
  rail.appendChild(col);
  setTimeout(function(){ window.dispatchEvent(new Event('resize')); },60);
  return true;
}
var lastPv='';
function paintModel(){
  var p=provider(), nm=$('stModelName'), pv=$('stPv');
  if(nm) nm.textContent=luxModelLabel();
  if(pv){
    pv.title=p.name; pv.setAttribute('aria-label','服务商：'+p.name);
    if(lastPv&&lastPv!==p.name&&!reduce){ pv.classList.remove('swap'); void pv.offsetWidth; pv.classList.add('swap'); }
    lastPv=p.name;
  }
}

/* ============================================================
   纸面页眉
   ============================================================ */
function buildHead(){
  var stage=$('stage'); if(!stage||$('stHead')) return;
  var h=document.createElement('header'); h.className='st-head'; h.id='stHead';
  h.innerHTML='<span class="st-crumb"><span class="bk" id="stCrumbBook"></span><span class="sl" id="stCrumbSl">/</span><b id="stCrumbT">创作对话</b></span>'+
    '<button type="button" class="st-lux" id="stLuxChip" title="关闭灵光模式">✦ 灵光 <span class="lat">Lux</span></button>'+
    '<span class="sp"></span><span class="st-tools" id="stTools"></span>';
  stage.insertBefore(h,stage.firstChild);
  var tools=$('stTools');
  ['twsChapterChip','btnMore','studioFocus','btnDrawer'].forEach(function(id){ var e=$(id); if(e) tools.appendChild(e); });
  var mc=$('modelChip'); if(mc) mc.style.display='none';
  $('stLuxChip').addEventListener('click',function(){ setLux(false,this); });
}
function curState(){
  var d=D(); var r={book:'',chapter:null,vi:0,ci:0,pid:null};
  if(!d) return r;
  var DD=d.D, pid=DD.activeProject; r.pid=pid;
  var p=pid&&d.getProject(pid); if(!p) return r;
  r.book=p.name;
  var vols=d.listVolumes(pid);
  vols.forEach(function(v,vi){ d.listChapters(v.id).forEach(function(c,ci){ if(c.id===DD.activeChapter){ r.chapter=c; r.vi=vi+1; r.ci=ci+1; } }); });
  r.words=d.projectWords(pid); r.count=allChapters(pid).length;
  return r;
}
function refreshHead(){
  var st=curState(), t=$('chatTitle');
  var ttl=st.chapter?('第'+cnNum(st.ci)+'章 · '+st.chapter.title):(t?t.textContent:'创作对话');
  if($('stCrumbBook')){ $('stCrumbBook').textContent=st.book?'《'+st.book+'》':''; $('stCrumbSl').style.display=st.book?'':'none'; $('stCrumbT').textContent=ttl; }
  var op=document.querySelector('.st-opus');
  if(op){
    var mode=(!st.book||opusMode==='quote')?'quote':'book';
    op.classList.toggle('noopus',mode==='quote');
    op.querySelectorAll('.st-osw button').forEach(function(b){ var on=b.dataset.m===mode; b.classList.toggle('on',on); b.setAttribute('aria-selected',String(on)); b.disabled=(b.dataset.m==='book'&&!st.book); });
    $('stQNew').textContent=st.book?'回到《'+st.book+'》 →':'开始第一部作品 →';
    if(!st.book&&!op.dataset.q){ var q=todayQuote(); op.dataset.q='1'; $('stQ').textContent=q[0]; $('stQTr').textContent=q[1]; $('stQTr').style.display=q[1]?'':'none'; $('stQSrc').textContent='— '+q[2]; $('stQ').classList.toggle('la',/^[A-Za-z]/.test(q[0])); }
  }
  if($('stBookName')){
    $('stBookName').textContent=st.book?'《'+st.book+'》':'';
    $('stBookCh').textContent=st.chapter?('第'+cnNum(st.ci)+'章 · '+st.chapter.title):(st.book?'还没有选中章节':'在书稿里新建一部作品');
    var pos=st.chapter&&st.count?Math.round(st.ci/st.count*100):0;
    $('stBookBar').style.width=pos+'%';
    $('stBookMeta').textContent=st.book?('全书 '+(st.words||0).toLocaleString('zh-CN')+' 字 · '+(st.count||0)+' 章'):'';
  }
  return st;
}

/* 今日一句：没有作品时，左栏顶上换成一句古今中外谈写作的话（均为公版古籍与拉丁格言），每天换一句 */
var QUOTES=[
 ['读书破万卷，下笔如有神。','','杜甫《奉赠韦左丞丈二十二韵》'],
 ['Nulla dies sine linea.','无一日不落笔。','老普林尼《博物志》记画家阿佩莱斯'],
 ['文章千古事，得失寸心知。','','杜甫《偶题》'],
 ['Verba volant, scripta manent.','言语飞逝，文字长存。','拉丁谚语'],
 ['为人性僻耽佳句，语不惊人死不休。','','杜甫《江上值水如海势聊短述》'],
 ['Ars longa, vita brevis.','技艺长久，人生短暂。','希波克拉底语，塞涅卡拉丁译'],
 ['文章本天成，妙手偶得之。','','陆游《文章》'],
 ['Festina lente.','从容地快。','奥古斯都格言'],
 ['看似寻常最奇崛，成如容易却艰辛。','','王安石《题张司业诗》'],
 ['Carpe diem.','把握今日。','贺拉斯《颂歌》'],
 ['吟安一个字，捻断数茎须。','','卢延让《苦吟》'],
 ['Dum spiro, spero.','一息尚存，希望不灭。','拉丁格言'],
 ['不积跬步，无以至千里。','','《荀子·劝学》'],
 ['Gutta cavat lapidem.','滴水穿石。','奥维德《黑海书简》'],
 ['两句三年得，一吟双泪流。','','贾岛《题诗后》'],
 ['Audentes fortuna iuvat.','命运眷顾勇者。','维吉尔《埃涅阿斯纪》'],
 ['笔落惊风雨，诗成泣鬼神。','','杜甫《寄李十二白二十韵》'],
 ['Per aspera ad astra.','循此苦旅，以达天际。','拉丁格言']];
function todayQuote(){
  var d=new Date(), start=new Date(d.getFullYear(),0,0), day=Math.floor((d-start)/864e5);
  return QUOTES[day%QUOTES.length];
}

/* ============================================================
   对话区：章首标题 + 空白页文字
   ============================================================ */
function decorateChat(){
  var chat=$('chat'); if(!chat) return;
  var em=chat.querySelector('.empty');
  if(em){
    var t=em.querySelector('.em-t'), en=em.querySelector('.em-en');
    if(t&&t.innerHTML.indexOf('。')<0){ t.innerHTML='让故事，<br>在此发生<span class="studio-period">。</span>'; }
    if(en&&en.textContent!=='Incipit fabula') en.textContent='Incipit fabula';
    var old=chat.querySelector('.st-chhead'); if(old) old.remove();
    return;
  }
  if(!chat.querySelector('.msg')) return;
  var st=curState(), t2=$('chatTitle');
  var eye=st.chapter?('卷'+cnNum(st.vi)+' · 第'+cnNum(st.ci)+'章'):'创作对话';
  var lat=st.chapter?('Caput '+roman(st.ci)):'Colloquium';
  var h1=st.chapter?st.chapter.title:(t2?t2.textContent:'新建对话');
  var hd=chat.querySelector('.st-chhead');
  if(!hd){ hd=document.createElement('div'); hd.className='st-chhead'; chat.insertBefore(hd,chat.firstChild); hd.dataset.k=''; }
  var k=eye+'|'+lat+'|'+h1;
  if(hd.dataset.k!==k){ hd.dataset.k=k; hd.innerHTML='<div class="eye">'+esc(eye)+' <span class="lat">'+esc(lat)+'</span></div><h1>'+esc(h1)+'</h1><div class="st-rule"></div>'; }
}

/* ============================================================
   右侧页边
   ============================================================ */
function buildMargin(){
  var vp=document.querySelector('.viewport'); if(!vp||$('stMargin')) return;
  var m=document.createElement('aside'); m.className='st-margin'; m.id='stMargin'; m.setAttribute('aria-label','页边');
  m.innerHTML=
    '<div class="st-mcard"><div class="st-mh">今日落笔 <span class="lat">Hodie</span><button type="button" id="stGoalBtn">目标</button></div>'+
      '<div class="st-big"><b id="stToday">0</b><span id="stGoal">/ 2,000 字</span></div>'+
      '<div class="st-bar" style="height:6px;border-radius:3px"><i id="stTodayBar" style="width:0"></i></div><span class="st-note" id="stTodayNote"></span></div>'+
    '<div class="st-mcard"><div class="st-mh">上下文 <span class="lat">Memoria</span></div>'+
      '<div class="st-ring"><svg width="66" height="66" viewBox="0 0 66 66" role="img" aria-label="上下文用量"><circle class="bgc" cx="33" cy="33" r="27" fill="none" stroke-width="6"/><circle class="fg" id="stRingFg" cx="33" cy="33" r="27" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="169.6" stroke-dashoffset="169.6" transform="rotate(-90 33 33)"/></svg>'+
      '<div style="display:flex;flex-direction:column;gap:4px"><b id="stCtxPct">0%</b><span class="st-note" id="stCtxTok"></span></div></div></div>'+
    '<div class="st-mcard"><div class="st-mh">本书伏笔 <span class="lat">Vestigia</span><button type="button" data-go="v-threads">全部</button></div><div id="stThreads" style="display:flex;flex-direction:column;gap:10px"></div></div>'+
    '<div style="display:flex;flex-direction:column;gap:10px"><div class="st-mh" style="padding:0 4px">出场人物 <span class="lat">Personae</span><button type="button" data-go="v-lore">设定库</button></div><div class="st-people" id="stPeople"></div></div>';
  vp.appendChild(m);
  m.querySelectorAll('[data-go]').forEach(function(b){ b.addEventListener('click',function(){ window.showView&&window.showView(b.dataset.go); }); });
  $('stGoalBtn').addEventListener('click',function(){ var c=$('twsGoalChip'); window.showView&&window.showView('v-book'); if(c) setTimeout(function(){ c.click(); },350); });
}
function fmtK(n){ return n>=1000?(n/1000).toFixed(n>=10000?0:1)+'K':String(n); }
function refreshMargin(st){
  var d=D(); if(!$('stMargin')) return;
  var today=d?d.todayWords():0, goal=(d&&d.D.goal)||2000;
  $('stToday').textContent=today.toLocaleString('en-US');
  $('stGoal').textContent='/ '+goal.toLocaleString('en-US')+' 字';
  $('stTodayBar').style.width=Math.min(100,today/goal*100)+'%';
  $('stTodayNote').textContent=today>=goal?'今天的目标已完成':'再写 '+(goal-today).toLocaleString('en-US')+' 字完成今天的目标';
  var limit=S.limit||128000, used=S.used||0;
  if(lux){ var ex=extraContext(); used+=Math.round(ex.length*0.8); }
  var pct=Math.min(100,Math.round(used/limit*100));
  $('stCtxPct').textContent=pct+'%';
  $('stCtxTok').textContent=fmtK(used)+' / '+fmtK(limit)+(lux?' · 含灵光':'');
  $('stRingFg').setAttribute('stroke-dashoffset',(169.6*(1-pct/100)).toFixed(1));
  var th=$('stThreads'), pp=$('stPeople');
  if(!d||!st.pid){ th.innerHTML='<span class="st-empty">建好作品后，埋下的伏笔会列在这里。</span>'; pp.innerHTML='<span class="st-empty">设定库里的人物会出现在这里。</span>'; return; }
  var ts=d.listThreads(st.pid).slice().sort(function(a,b){ return (a.status==='done')-(b.status==='done'); }).slice(0,4);
  th.innerHTML=ts.length?ts.map(function(t){ var done=t.status==='done'; return '<div class="st-thr'+(done?' done':'')+'"><i></i><span class="t">'+esc(t.name)+'</span><em>'+(done?'已回收':'待回收')+'</em></div>'; }).join(''):'<span class="st-empty">还没有记下伏笔。</span>';
  var ps=d.listCards(st.pid,'character').slice(0,8);
  pp.innerHTML=ps.length?ps.map(function(c){ return '<span>'+esc(c.name)+'</span>'; }).join(''):'<span class="st-empty">设定库里还没有人物。</span>';
}

/* ============================================================
   温度胶囊
   ============================================================ */
var LV=[
 {max:.3,name:'严谨',lat:'Severitas',hold:3600,d:'用词保守，紧扣设定与前文，几乎不自由发挥。适合润色、改错、定稿前收口。',w:[['z','天地玄黄，宇宙洪荒'],['l','In principio erat Verbum'],['z','关关雎鸠，在河之洲'],['l','Arma virumque cano']]},
 {max:.7,name:'稳妥',lat:'Prudentia',hold:3200,d:'在合理范围内变化，优先保证情节连贯。日常续写最安全的选择。',w:[['z','路漫漫其修远兮'],['l','In nova fert animus mutatas dicere formas'],['z','蒹葭苍苍，白露为霜'],['g','Ἄνδρα μοι ἔννεπε, Μοῦσα']]},
 {max:1.1,name:'均衡',lat:'Aequitas',hold:2800,d:'措辞与思路都有一定新鲜感，多数场景的默认值。',w:[['z','夸父与日逐走'],['l','Audentes fortuna iuvat'],['z','精卫衔微木，将以填沧海'],['g','Μῆνιν ἄειδε θεὰ Πηληϊάδεω Ἀχιλῆος']]},
 {max:1.5,name:'放飞',lat:'Libertas',hold:2400,d:'用词跳跃，容易冒出意外的好句子，但也更容易跑偏。',w:[['z','北冥有鱼，其名为鲲'],['l','Sic itur ad astra'],['z','抟扶摇而上者九万里'],['l','Per aspera ad astra']]},
 {max:2.01,name:'狂野',lat:'Furor',hold:2000,d:'高度随机，适合头脑风暴找灵感，不建议直接定稿。',w:[['z','刑天舞干戚，猛志固常在'],['l','Flectere si nequeo superos, Acheronta movebo'],['z','羿上射十日而下杀猰貐'],['g','Πάντα ῥεῖ']]}];
function curTemp(){ var v=typeof S.temperature==='number'?S.temperature:0.8; return Math.max(0,Math.min(2,v)); }
function lvOf(v){ for(var i=0;i<LV.length;i++) if(v<=LV[i].max) return i; return 4; }
var tp,cap,fill,ln,txt,thumb,range,descEl,pill;
var cur=-1,idx=0,timer=null,pct=40,PADL=16,PADR=48,scrollAnim=null,descT=null;
function buildTemp(){
  var wrap=document.querySelector('.composer .input-wrap'); if(!wrap||$('stTpill')) return;
  var send=wrap.querySelector('.send');
  pill=document.createElement('button'); pill.type='button'; pill.className='st-tpill'; pill.id='stTpill';
  pill.setAttribute('aria-haspopup','dialog'); pill.setAttribute('aria-expanded','false'); pill.title='温度 · 决定 AI 写得多保守或多放飞';
  pill.innerHTML='<span class="T">T</span><span class="nm" id="stPillName"></span><span class="v" id="stPillVal"></span>';
  wrap.insertBefore(pill,send);
  tp=document.createElement('div'); tp.className='st-tp'; tp.id='stTp'; tp.setAttribute('role','dialog'); tp.setAttribute('aria-label','温度调节');
  tp.innerHTML=
    '<div class="top"><div class="nmx"><span class="lat" id="stTLat"></span><b id="stTName"></b></div><span class="val" id="stTVal"></span>'+
      '<button type="button" class="st-bulb" id="stBulb" aria-pressed="false" aria-label="灵光模式" title="灵光模式"><span class="halo"></span>'+
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><line class="ray" x1="12" y1="0.5" x2="12" y2="2.5"/><line class="ray" x1="3.5" y1="4" x2="5" y2="5.5"/><line class="ray" x1="20.5" y1="4" x2="19" y2="5.5"/><line class="ray" x1="0.8" y1="11" x2="2.8" y2="11"/><line class="ray" x1="23.2" y1="11" x2="21.2" y2="11"/><path class="glass" d="M12 4.5a6 6 0 0 0-3.6 10.8c.7.55 1.1 1.3 1.1 2.1V18h5v-.6c0-.8.4-1.55 1.1-2.1A6 6 0 0 0 12 4.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10.4 13.2l1-1.4 1.2 1.4 1-1.4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.8 20.2h4.4M10.5 22.2h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>'+
      '<div class="st-btip" id="stBtip" role="status" aria-live="polite"><i aria-hidden="true">✦</i>Token 与上下文用量显著增加<span class="lat">Lux</span></div></div>'+
    '<div class="st-cap" id="stCap"><div class="st-mhint"><span class="s" aria-hidden="true">✦</span>创新性大幅提升<span class="lat">Ingenium</span></div>'+
      '<div class="clip"><div class="fill" id="stFill"><div class="ln" id="stLn" aria-hidden="true"><div class="txt" id="stTxt"></div></div></div><div class="sheen"></div></div>'+
      '<div class="thumb" id="stThumb"></div><label for="stRange" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">温度</label>'+
      '<input type="range" id="stRange" min="0" max="2" step="0.1"></div>'+
    '<div class="st-ticks" id="stTicks">'+LV.map(function(l,i){ return '<button type="button" data-v="'+[0.2,0.5,0.8,1.3,2][i]+'"><small>'+['I','II','III','IV','V'][i]+'</small><span>'+l.name+'</span></button>'; }).join('')+'</div>'+
    '<div class="st-desc" id="stDesc"></div>'+
    '<div class="st-tfoot"><span class="lat">Scribere est vivere</span><button type="button" id="stTReset">恢复默认 0.8</button></div>';
  document.body.appendChild(tp);
  cap=$('stCap'); fill=$('stFill'); ln=$('stLn'); txt=$('stTxt'); thumb=$('stThumb'); range=$('stRange'); descEl=$('stDesc');
  range.addEventListener('input',function(){ stopScroll(); paintT(); applyTemp(+range.value); });
  tp.querySelectorAll('#stTicks button').forEach(function(b){ b.addEventListener('click',function(){ range.value=b.dataset.v; stopScroll(); paintT(); applyTemp(+range.value); }); });
  $('stTReset').addEventListener('click',function(){ range.value=0.8; stopScroll(); paintT(); applyTemp(0.8); });
  pill.addEventListener('click',function(e){ e.stopPropagation(); tp.classList.contains('open')?closeTp():openTp(); });
  tp.addEventListener('click',function(e){ e.stopPropagation(); });
  document.addEventListener('click',function(){ if(tp.classList.contains('open')) closeTp(); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeTp(); });
  window.addEventListener('resize',function(){ if(tp.classList.contains('open')) placeTp(); });
  $('stBulb').addEventListener('click',function(){ setLux(!lux,this); });
  var tr=$('tempRange'); if(tr) tr.addEventListener('change',paintPill);
  paintPill();
}
function applyTemp(v){
  v=Math.round(v*10)/10; S.temperature=v; try{ api.save&&api.save(); }catch(e){}
  var tr=$('tempRange'),tv=$('tempVal'); if(tr) tr.value=String(v); if(tv) tv.textContent=v.toFixed(1);
  paintPill();
}
function paintPill(){ var v=curTemp(); if($('stPillName')){ $('stPillName').textContent=LV[lvOf(v)].name; $('stPillVal').textContent=v.toFixed(1); } }
function placeTp(){
  var r=pill.getBoundingClientRect(), w=tp.offsetWidth||372;
  var left=Math.max(12,Math.min(r.right-w+40,window.innerWidth-w-12));
  tp.style.left=left+'px'; tp.style.bottom=(window.innerHeight-r.top+14)+'px';
  tp.style.transformOrigin=Math.max(10,Math.min(95,(r.left+r.width/2-left)/w*100))+'% 100%';
}
function openTp(){ range.value=curTemp(); placeTp(); tp.classList.add('open'); pill.setAttribute('aria-expanded','true'); cur=-1; paintT(); }
function closeTp(){ if(!tp) return; tp.classList.remove('open'); pill&&pill.setAttribute('aria-expanded','false'); clearTimeout(timer); stopScroll(); }
function esc1(c){ return c==='<'?'&lt;':c==='&'?'&amp;':c; }
function room(){ return cap.clientWidth*pct/100-PADL-PADR; }
function place(){
  if(scrollAnim) return;
  var r=room(),tw=txt.scrollWidth,fit=tw<=r;
  ln.classList.toggle('fit',fit);
  txt.style.transform='translate('+(fit?PADL+(r-tw)/2:PADL).toFixed(1)+'px,-50%)';
}
function stopScroll(){ if(scrollAnim){ scrollAnim.cancel(); scrollAnim=null; } }
function show(){
  if(cur<0||!tp.classList.contains('open')) return;
  stopScroll();
  var p=LV[cur].w[idx%LV[cur].w.length],chars=Array.from(p[1]),step=Math.min(55,900/chars.length),h='';
  chars.forEach(function(c,k){ h+='<span class="'+p[0]+'" style="transition-delay:'+Math.round(k*step)+'ms">'+esc1(c)+'</span>'; });
  txt.className='txt'; txt.innerHTML=h; place(); void txt.offsetWidth; txt.classList.add('in');
  var revealMs=chars.length*step+700, hold=LV[cur].hold;
  clearTimeout(timer);
  timer=setTimeout(function(){
    var over=txt.scrollWidth-room();
    if(over>4&&txt.animate&&!reduce){
      var dur=Math.max(1600,over*22);
      scrollAnim=txt.animate([{transform:'translate('+PADL+'px,-50%)'},{transform:'translate('+(PADL-over).toFixed(1)+'px,-50%)'}],{duration:dur,easing:'cubic-bezier(.45,0,.25,1)',fill:'forwards',delay:400});
      ln.classList.remove('fit');
      timer=setTimeout(fadeNext,400+dur+hold*.7);
    }else timer=setTimeout(fadeNext,hold);
  },revealMs);
}
function fadeNext(){ txt.classList.add('out'); timer=setTimeout(function(){ idx++; show(); },560); }
function setDesc(d,now){ clearTimeout(descT); if(now){ descEl.textContent=d; descEl.style.opacity=1; return; } descEl.style.opacity=0; descT=setTimeout(function(){ descEl.textContent=d; descEl.style.opacity=1; },260); }
function paintT(){
  var v=+range.value,i=lvOf(v),max=v>=2; pct=Math.max(v/2*100,14);
  tp.classList.toggle('max',max);
  fill.style.width=pct+'%'; thumb.style.left='calc('+pct+'% - 38px)';
  $('stTVal').textContent=v.toFixed(1);
  if(!scrollAnim) place();
  if(i!==cur){
    var first=cur<0; cur=i; idx=0; setDesc(LV[i].d,first);
    $('stTName').textContent=LV[i].name; $('stTLat').textContent=LV[i].lat;
    tp.querySelectorAll('#stTicks button').forEach(function(b,k){ b.classList.toggle('on',k===i); });
    if(!first&&!reduce) [$('stTName'),$('stTLat')].forEach(function(e,k){ e.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:450,delay:k*60,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'}); });
    clearTimeout(timer); stopScroll();
    if(first){ show(); return; }
    txt.classList.add('out'); timer=setTimeout(show,520);
  }
}
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(function(){ if(tp&&tp.classList.contains('open')) place(); });

/* ============================================================
   灵光开关
   ============================================================ */
var wave=null,tipT=null;
function setLux(on,from){
  lux=!!on; store('tws_lux',lux?'1':'0');
  if(from&&!reduce){
    if(!wave){ wave=document.createElement('div'); wave.className='st-wave'; document.body.appendChild(wave); }
    var r=from.getBoundingClientRect();
    wave.style.left=(r.left+r.width/2)+'px'; wave.style.top=(r.top+r.height/2)+'px';
    wave.style.background=lux?'radial-gradient(circle,rgba(255,226,150,0) 40%,rgba(255,214,120,.42) 62%,rgba(255,214,120,0) 72%)':'radial-gradient(circle,rgba(160,150,240,0) 40%,rgba(140,128,240,.32) 62%,rgba(140,128,240,0) 72%)';
    wave.classList.remove('go'); void wave.offsetWidth; wave.classList.add('go');
  }
  root.classList.toggle('lux',lux);
  var b=$('stBulb'); if(b) b.setAttribute('aria-pressed',String(lux));
  var cfgB=$('stLuxCfg'); if(cfgB) cfgB.textContent=lux?'关闭':'开启';
  clearTimeout(tipT);
  var tip=$('stBtip');
  if(tip){ if(lux&&from){ tip.classList.add('on'); tipT=setTimeout(function(){ tip.classList.remove('on'); },3000); } else tip.classList.remove('on'); }
  paintModel(); refreshAll();
}

/* ============================================================
   配置页：夜读配色 + 灵光；各区块拉丁眉题
   ============================================================ */
var NIGHTS=[['ink','墨夜','Atramentum','#1b1a1f','#9a90dc'],['lapis','青金','Lapis','#141a2c','#8f9cff'],['candle','烛照','Lucerna','#1f1a15','#a99af0'],['violet','堇夜','Viola','#1a1724','#8a7ff2']];
function applyNight(n){ if(n==='violet') root.removeAttribute('data-night'); else root.dataset.night=n; store('tws_night',n);
  document.querySelectorAll('#stNight button').forEach(function(b){ b.classList.toggle('on',b.dataset.n===n); }); }
function buildCfg(){
  var body=document.querySelector('#v-cfg .cfg-body'); if(!body||$('stNight')) return;
  var sec=document.createElement('div'); sec.className='cfg-sec';
  sec.innerHTML='<div class="cfg-label"><span class="sq"></span>夜读配色 <span class="lat" style="margin-left:6px;color:var(--mut)">Nox</span></div>'+
    '<div class="st-nseg" id="stNight">'+NIGHTS.map(function(n){ return '<button type="button" data-n="'+n[0]+'"><i style="background:linear-gradient(135deg,'+n[3]+' 55%,'+n[4]+' 55%)"></i>'+n[1]+' <small>'+n[2]+'</small></button>'; }).join('')+'</div>'+
    '<div class="st-luxrow"><div class="k"><b>自动识别 <span class="lat" style="font-size:15px;color:var(--mut)">Inventio</span></b><span>AI 每写完一段，自动找出新人物 / 地点 / 名词、时间线事件和可能的伏笔，勾选后一键写入。每次会额外用少量 Token。</span></div><button type="button" class="mini-btn" id="stAutoCfg">'+(autoLore?'关闭':'开启')+'</button></div>'+
    '<div class="st-luxrow"><div class="k"><b>灵光模式 <span class="lat" style="font-size:15px;color:var(--mut)">Lux</span></b><span>换用深度思考模型 · 单次输出更长 · 带上全部设定、伏笔与更多前文。会明显多用 Token。</span></div><button type="button" class="mini-btn" id="stLuxCfg">'+(lux?'关闭':'开启')+'</button></div>';
  body.insertBefore(sec,body.firstChild);
  sec.querySelectorAll('#stNight button').forEach(function(b){ b.addEventListener('click',function(){
    applyNight(b.dataset.n);
    if(root.dataset.theme!=='dark'){ var d=document.querySelector('#themeSeg button[data-t="dark"]'); if(d) d.click(); }
  }); });
  $('stLuxCfg').addEventListener('click',function(){ setLux(!lux,this); });
  $('stAutoCfg').addEventListener('click',function(){ autoLore=!autoLore; store('tws_autolore',autoLore?'1':'0'); this.textContent=autoLore?'关闭':'开启'; toastMsg(autoLore?'已开启自动识别':'已关闭自动识别'); });
  applyNight(store('tws_night')||'ink');
}
function eyebrows(){
  var map={'v-book':'Codex','v-lore':'Thesaurus','v-threads':'Vestigia','v-cfg':'Officina'};
  Object.keys(map).forEach(function(id){
    var m=document.querySelector('#'+id+' .sec-meta'); if(!m||m.querySelector('.st-eye')) return;
    var s=document.createElement('span'); s.className='st-eye'; s.textContent=map[id]; m.insertBefore(s,m.firstChild);
  });
}

/* ============================================================
   自动识别：AI 每写完一段，找出新人物 / 地点 / 名词、时间线事件、可能的伏笔
   结果挂在那条消息下面，勾选后一键写入；不确认就什么都不会写。
   ============================================================ */
var KIND={character:'人物',place:'地点',term:'名词',relation:'关系'};
var autoLore=store('tws_autolore')!=='0';
var scanning=false, loadKeys=null;
function curConv(){ return (S.convs||[]).filter(function(c){ return c.id===S.activeId; })[0]||null; }
function norm(s){ return String(s||'').replace(/\s+/g,'').toLowerCase(); }
function knownNames(pid){
  var d=D(), set={};
  d.listCards(pid).forEach(function(c){ set[norm(c.name)]=1; (c.aliases||[]).forEach(function(a){ set[norm(a)]=1; }); });
  return set;
}
function scanPrompt(pid){
  var d=D();
  var cards=d.listCards(pid).map(function(c){ return c.name; }).slice(0,80);
  var ths=d.listThreads(pid).map(function(t){ return t.name; }).slice(0,40);
  return '你是小说编辑助手。读下面这段刚写出来的小说文字，找出值得归档的三类信息：\n'+
    '1. 新出现、且有名字的人物（也包括有名字的地点、专有名词、人物关系）；\n'+
    '2. 有明确时间感的事件（三年前 / 第二天清晨 / 入夜后……谁做了什么）；\n'+
    '3. 可能是伏笔的地方：埋下但没解释的线索、悬念、反常细节。\n\n'+
    '已经记录过的设定（不要重复）：'+(cards.join('、')||'无')+'\n'+
    '已经记录过的伏笔（不要重复）：'+(ths.join('、')||'无')+'\n\n'+
    '只输出一个 tws 代码块，每行一条 JSON，不要任何解释：\n'+
    '```tws\n'+
    '{"op":"add_lore","kind":"character","name":"名字","body":"一句话描述（外貌 / 身份 / 性格，取自原文）"}\n'+
    '{"op":"add_event","when":"第二天清晨","who":"沈未晞","what":"在栈桥收到那封信"}\n'+
    '{"op":"add_thread","name":"线索名","note":"埋了什么、可能怎么回收"}\n'+
    '```\n'+
    '规则：只取原文确实写到的，不要编造；kind 只能是 character / place / term / relation；'+
    '没名字的路人不算；伏笔只取真正留了悬念的；总共最多 6 条，宁少勿滥；什么都没有就输出空的 tws 代码块。';
}
function scanRequest(text,pid){
  var p=provider(), body={
    model:p.ds?'deepseek-flash':S.model,
    messages:[{role:'system',content:scanPrompt(pid)},{role:'user',content:String(text).slice(-5000)}],
    temperature:0.2, stream:false, max_tokens:900
  };
  if(p.ds) body.thinking={type:'disabled'};
  return fetch(String(S.baseUrl||'https://api.deepseek.com/v1').replace(/\/+$/,'')+'/chat/completions',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+S.apiKey},body:JSON.stringify(body)
  }).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(j){ return (j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content)||''; });
}
function cleanOps(ops,pid){
  var d=D(), names=knownNames(pid), ths={}, seen={};
  d.listThreads(pid).forEach(function(t){ ths[norm(t.name)]=1; });
  return ops.filter(function(o){
    if(!o||['add_lore','add_event','add_thread'].indexOf(o.op)<0) return false;
    if(o.op==='add_lore'){ var n=norm(o.name); if(!n||names[n]||seen[n]) return false; seen[n]=1; if(!KIND[o.kind]) o.kind='character'; }
    if(o.op==='add_thread'){ var t=norm(o.name); if(!t||ths[t]||seen['t'+t]) return false; seen['t'+t]=1; }
    if(o.op==='add_event'&&!o.what) return false;
    return true;
  }).slice(0,6);
}
function maybeScan(){
  if(!autoLore||scanning||!S.apiKey||S.gen) return;
  var d=D(); if(!d) return;
  var pid=d.D.activeProject; if(!pid) return;
  var c=curConv(); if(!c||!c.msgs.length) return;
  var i=c.msgs.length-1, m=c.msgs[i];
  if(!m||m.r!=='ai'||m.stream||m.lx||!m.c) return;
  if(loadKeys&&loadKeys[c.id+':'+i]===m.c) return;      /* 打开页面前就有的旧回复不扫 */
  if(m.c.replace(/\s/g,'').length<120) return;
  if(/```tws/.test(m.c)) return;                          /* AI 自己已经提议整理了 */
  scanning=true; m.lx={st:'scan'}; paintScans();
  scanRequest(m.c,pid).then(function(txt){
    var ops=cleanOps((window.TWS.ops.parse(txt).ops)||[],pid);
    m.lx=ops.length?{st:'pending',ops:ops}:{st:'none'};
  }).catch(function(e){ m.lx={st:'none',err:String(e&&e.message||e)}; })
    .then(function(){ scanning=false; try{ api.save(); }catch(e){} paintScans(); });
}
function opLine(o,k){
  var tag,txt;
  if(o.op==='add_lore'){ tag=KIND[o.kind]||'设定'; txt='<b>'+esc(o.name)+'</b>'+(o.body?'<span>'+esc(String(o.body).slice(0,60))+'</span>':''); }
  else if(o.op==='add_event'){ tag='时间线'; txt='<b>'+esc(o.when||'某时')+'</b><span>'+esc((o.who?o.who+' · ':'')+o.what)+'</span>'; }
  else { tag='伏笔'; txt='<b>'+esc(o.name)+'</b>'+(o.note?'<span>'+esc(String(o.note).slice(0,60))+'</span>':''); }
  return '<label class="st-scan-l"><input type="checkbox" data-k="'+k+'" checked><i class="tg tg-'+o.op+'">'+tag+'</i><span class="tx">'+txt+'</span></label>';
}
function paintScans(){
  var chat=$('chat'), c=curConv(); if(!chat||!c) return;
  chat.querySelectorAll('.msg.ai[data-i]').forEach(function(el){
    var i=+el.getAttribute('data-i'), m=c.msgs[i], bub=el.querySelector('.bub'); if(!bub) return;
    var box=bub.querySelector('.st-scan'), lx=m&&m.lx, key=lx?(lx.st+(lx.ops?lx.ops.length:'')):'';
    if(!lx||lx.st==='none'||lx.st==='dismissed'){ if(box) box.remove(); return; }
    if(box&&box.dataset.key===key) return;
    if(!box){ box=document.createElement('div'); box.className='st-scan'; bub.appendChild(box); }
    box.dataset.key=key;
    if(lx.st==='scan'){ box.innerHTML='<div class="st-scan-h busy">✦ 正在识别人物、事件与伏笔 <span class="lat">Inventio</span></div>'; return; }
    if(lx.st==='done'){ box.innerHTML='<div class="st-scan-h ok">✦ 已写入：'+esc(lx.summary||'')+'</div>'; return; }
    box.innerHTML='<div class="st-scan-h">✦ 发现 '+lx.ops.length+' 条可以归档的内容 <span class="lat">Inventio</span></div>'+
      '<div class="st-scan-b">'+lx.ops.map(opLine).join('')+'</div>'+
      '<div class="st-scan-f"><button type="button" class="mini-btn st-scan-ok">写入所选</button><button type="button" class="mini-btn st-scan-no">忽略</button></div>';
    box.querySelector('.st-scan-ok').addEventListener('click',function(e){
      e.stopPropagation();
      var sel=[]; box.querySelectorAll('input[data-k]').forEach(function(x){ if(x.checked) sel.push(lx.ops[+x.dataset.k]); });
      if(!sel.length){ toastMsg('先勾选要写入的条目'); return; }
      var r=window.TWS.runOps?window.TWS.runOps(sel):{done:[]};
      m.lx={st:'done',summary:(r.done||[]).join('、')}; try{ api.save(); }catch(err){}
      toastMsg('已写入：'+(r.done||[]).join('、')); paintScans(); refreshAll();
    });
    box.querySelector('.st-scan-no').addEventListener('click',function(e){ e.stopPropagation(); m.lx={st:'dismissed'}; try{ api.save(); }catch(err){} paintScans(); });
  });
}
function toastMsg(t){
  if(typeof window.toast==='function'){ window.toast(t); return; }
  var w=$('toastWrap'); if(!w) return; var el=document.createElement('div'); el.className='toast'; el.textContent=t; w.appendChild(el); setTimeout(function(){ el.remove(); },2600);
}
function snapshotLoad(){
  loadKeys={};
  (S.convs||[]).forEach(function(c){ (c.msgs||[]).forEach(function(m,i){ loadKeys[c.id+':'+i]=m.c; }); });
}

/* ============================================================
   刷新与启动
   ============================================================ */
var rq=0;
function refreshAll(){ if(rq) return; rq=requestAnimationFrame(function(){ rq=0; var st=refreshHead(); decorateChat(); refreshMargin(st); paintModel(); paintScans(); maybeScan(); }); }
function boot(){
  if(!buildRail()){ if((boot.n=(boot.n||0)+1)<40){ setTimeout(boot,50); } return; }
  snapshotLoad();
  buildHead(); buildMargin(); buildTemp(); buildCfg(); eyebrows();
  root.classList.toggle('lux',lux);
  var chat=$('chat');
  if(chat) new MutationObserver(refreshAll).observe(chat,{childList:true});
  var mc=$('modelChip'); if(mc) new MutationObserver(paintModel).observe(mc,{childList:true,characterData:true,subtree:true});
  var ct=$('chatTitle'); if(ct) new MutationObserver(refreshAll).observe(ct,{childList:true,characterData:true,subtree:true});
  document.addEventListener('click',function(){ setTimeout(refreshAll,120); },true);
  setInterval(refreshAll,4000);
  refreshAll();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(boot,0); });
else setTimeout(boot,0);
})();

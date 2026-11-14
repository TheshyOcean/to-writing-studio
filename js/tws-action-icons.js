/* 小操作图标：保留按钮原有文字节点与事件，只改变呈现方式。 */
(function () {
  'use strict';
  var paths = {
    add:'<path d="M12 5v14M5 12h14"/>',
    addfile:'<path d="M13.5 3.5H6.7A1.7 1.7 0 0 0 5 5.2v13.6a1.7 1.7 0 0 0 1.7 1.7h10.6a1.7 1.7 0 0 0 1.7-1.7V9z"/><path d="M13 3.5v5.8h6M9 15h6M12 12v6"/>',
    extract:'<path d="M4 4h10l4 4v3M14 4v4h4M7 9h4M7 12h4M7 15h3"/><path d="M17 13v7m-3-3 3 3 3-3"/>',
    thread:'<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v10h10"/>',
    timeline:'<path d="M5 5v14M5 8h4M5 16h4M15 5v14"/><circle cx="15" cy="8" r="2"/><circle cx="15" cy="16" r="2"/>',
    person:'<circle cx="12" cy="8" r="3.2"/><path d="M5.2 20c.5-4 3.1-6 6.8-6s6.3 2 6.8 6"/>',
    place:'<path d="M19 10c0 5-7 10.8-7 10.8S5 15 5 10a7 7 0 1 1 14 0z"/><circle cx="12" cy="10" r="2.2"/>',
    term:'<path d="M5 5h14v14H5zM8 9h8M8 12h8M8 15h5"/>',
    relation:'<circle cx="6" cy="8" r="2.5"/><circle cx="18" cy="16" r="2.5"/><path d="M8.1 9.3l7.8 5.4M7 17l2-2m6-6 2-2"/>',
    search:'<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4.3 4.3"/>',
    download:'<path d="M12 3v12m-4-4 4 4 4-4M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>',
    upload:'<path d="M12 16V4m-4 4 4-4 4 4M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>',
    save:'<path d="M5 4h12l2 2v14H5zM8 4v5h8V4M8 20v-7h8v7"/>',
    edit:'<path d="m4 20 4.2-.8L19 8.4 15.6 5 4.8 15.8zM13.8 6.8l3.4 3.4"/>',
    close:'<path d="M5 5l14 14M19 5 5 19"/>',
    check:'<path d="m5 12 4.2 4.2L19 6.5"/>',
    trash:'<path d="M4.5 7h15M9 7V4h6v3M7 7l.8 12h8.4L17 7M10 11v5M14 11v5"/>',
    refresh:'<path d="M19 8a7.5 7.5 0 0 0-13-2L4 8m0-4v4h4M5 16a7.5 7.5 0 0 0 13 2l2-2m0 4v-4h-4"/>',
    more:'<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
    view:'<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.5"/>',
    copy:'<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M15 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
    play:'<path d="m8 5 11 7-11 7z"/>', pause:'<path d="M8 5v14M16 5v14"/>',
    back:'<path d="M19 12H5m6-6-6 6 6 6"/>',
    undo:'<path d="M8 7 4 11l4 4M4 11h9a6 6 0 0 1 6 6v2"/>',
    folder:'<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    moon:'<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1 .8-1.7 1.3-1.7 2.7M12 17h.01"/>',
    magic:'<path d="m5 19 9-9M13 5l.8 2.2L16 8l-2.2.8L13 11l-.8-2.2L10 8l2.2-.8zM18 12l.5 1.5L20 14l-1.5.5L18 16l-.5-1.5L16 14l1.5-.5z"/>',
    plot:'<path d="M4 19V5M4 19h16M6 16l4-5 3 2 5-7"/><circle cx="18" cy="6" r="1"/>',
    film:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4M10 9l5 3-5 3z"/>',
    library:'<path d="M4 5h5v14H4zM10 4h5v15h-5zM16 6l3-1 3 13-3 1z"/>',
    template:'<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    on:'<circle cx="12" cy="12" r="8"/><path d="m8 12 2.5 2.5L16.5 9"/>', off:'<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>'
  };
  var labels = {
    '＋卷':'add','新建卡片':'add','新建角色':'add','新建一张':'add','新建作品':'add','新建第一卷':'add','新建章节':'addfile','记一条':'add',
    '从本章提取':'extract','提取':'extract','开始提取':'extract','联网搜索':'search','搜索':'search',
    '导出':'download','导入':'upload','备份':'download','恢复':'upload','保存':'save','确认写入':'check','确定':'check','确认':'check','完成':'check',
    '编辑':'edit','修改':'edit','输入':'edit','取消':'close','关闭':'close','删除':'trash','移除':'trash','移除图片':'trash',
    '刷新模型':'refresh','刷新':'refresh','拉取':'refresh','重试':'refresh','重新生成':'refresh','从头':'refresh','按情节图重新生成':'refresh',
    '设置':'settings','切换':'settings','改地址':'edit','测试':'check','查看':'view','复制':'copy','播放':'play','暂停':'pause',
    '生成关系图':'magic','✦ 生成关系图':'magic','✦ 生成情节图':'magic','✦ 生成形象':'magic','✦ AI 补全人设':'magic',
    '返回':'back','返回 ESC':'back','开启':'on','登录':'person','查看摘要':'library','看看效果':'view','指令':'term','模板':'template','+ 新建智能体':'add','+ 添加技能':'add','启用':'on','使用中':'on','ON':'on','OFF':'off','开始润色':'magic','开始构思':'magic','保存批注':'save','撤销':'undo','继续自动备份':'refresh','现在备份一次':'download','现在备份':'download','先备份现在的':'download','写入所选':'check','忽略':'close','重生成':'refresh','仍然定稿':'check','好，加进去':'check','先不用':'close','把标点修正写回正文':'check','存档':'save','读档':'upload','AI 扩写':'magic','直接用':'check','回到戏里':'back','回到书桌':'back','在设定库里管理':'library','去书稿新建':'addfile','用它生成情节图':'plot','生成全部缺少的':'magic','选择文件夹':'folder','换个文件夹':'folder','停用':'off','彻底删除':'trash','清空回收站':'trash','进本章草稿':'addfile','存为备用素材':'save','只更新设定':'library','查看摘要':'library','润色':'magic','扩写':'add','缩写':'off','换个说法':'refresh','替换选中':'check','替换全文':'check','追加到末尾':'add'
  };
  var ids = {twsBtnNewCard:'add',twsBtnExtract:'extract',twsBtnNewThread:'add',dfNewChar:'person',btnMore:'more',twsChapterChip:'library',btnCfgBack:'back',twsBtnPrompts:'term',twsBtnTpl:'template',btnNewAgent:'add',btnNewSkill:'add'};
  var kind = {character:'person',person:'person',location:'place',place:'place',term:'term',concept:'term',item:'term',relation:'relation',thread:'thread',timeline:'timeline',char:'person',chars:'person',rel:'relation',plot:'plot',film:'film',template:'template',tpl:'template',lore:'library',world:'library'};
  var selector='#btnMore,#twsChapterChip,button.mini-btn,button.tws-btn,button.btn.ghost,button.tws-tpl-btn,.tws-ai-bar button,.tws-sel-bar button,.df-bar button,.br-seg button,#themeSeg button,#stNight button,button[data-pact=addvol],#twsLoreTabs [data-kind],#twsThreadTabs [data-tab],#dfTabs [data-t]';
  function convert(el) {
    if (el.classList.contains('tws-ib') || el.classList.contains('tws-head-goal')) return;
    if (el.closest('#stNight')) { var name=Array.from(el.childNodes).filter(function(n){return n.nodeType===3;}).map(function(n){return n.nodeValue;}).join('').trim(); if(name){el.setAttribute('aria-label',name);el.title=name;} el.classList.add('tws-theme-icon'); return; }
    var old=el.querySelector(':scope > svg.tws-action-glyph');
    var text=Array.from(el.childNodes).filter(function(n){return n.nodeType===3;}).map(function(n){return n.nodeValue;}).join('').trim();
    var attr=el.dataset.kind||el.dataset.tab||el.dataset.t;
    var key=ids[el.id]||kind[attr]||labels[text];
    if(el.closest('#brMode')) key={auto:'magic',semi:'plot',ask:'help',off:'off'}[el.dataset.m]||key;
    if(el.closest('#themeSeg')) key={dark:'moon',light:'sun',auto:'settings'}[el.dataset.t]||key;
    if (!key || !paths[key]) { if(old)old.remove(); el.classList.remove('tws-action-icon'); return; }
    /* Only simple controls and the known tabs; never turn cards, menus or rich labels into icons. */
    if (!attr && Array.from(el.children).some(function(c){return c!==old;})) return;
    var label=text || el.getAttribute('aria-label') || '';
    var row=el.closest('.row'), rowTitle=row && row.querySelector('.row-ttl');
    if(rowTitle && /^(查看|设置|切换|保存|ON|OFF)$/.test(label)) label=rowTitle.textContent.trim()+' · '+label;
    if (label) { if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label); if(!el.title || el.dataset.actionTitle === '1') { el.title=label; el.dataset.actionTitle='1'; } }
    if (!old || old.getAttribute('data-icon')!==key) {
      if(old) old.remove();
      var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','tws-action-glyph');svg.setAttribute('data-icon',key);svg.innerHTML=paths[key];el.appendChild(svg);
    }
    el.classList.add('tws-action-icon');
  }
  var pending=false;
  function scan() { pending=false;document.querySelectorAll(selector).forEach(convert); }
  function schedule() { if(!pending){pending=true;requestAnimationFrame(scan);} }
  function start() { scan();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true}); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

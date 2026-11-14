/* 入戏 / 塔罗的纸面过场。只动 transform / opacity，不调用 AI。 */
(function () {
  'use strict';
  var T=window.TWS=window.TWS||{}, active=null;
  var maskIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 7.5C5.5 5.6 8.6 6.6 12 9c3.4-2.4 6.5-3.4 9.5-1.5l-1.2 5.8c-1.4 3.2-4.5 3.4-6.7.8L12 12.5l-1.6 1.6c-2.2 2.6-5.3 2.4-6.7-.8z"/><path d="M5.8 10.1q2-.8 3.5 1.3M18.2 10.1q-2-.8-3.5 1.3"/></svg>';
  var cardIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="m12 8 3 4-3 4-3-4zM9 5.5h6M9 18.5h6"/></svg>';
  function maskArt(){
    return '<svg class="en-mask-art en-duet" viewBox="0 0 300 235" fill="none" aria-hidden="true"><defs>' +
      '<linearGradient id="enBlue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a5d3dc"/><stop offset="1" stop-color="#659bb5"/></linearGradient>' +
      '<linearGradient id="enAmber" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f3d79a"/><stop offset="1" stop-color="#d9aa58"/></linearGradient></defs>' +
      '<g transform="translate(30 24) rotate(-17 60 75)"><g class="en-half en-half-left en-mask-blue">' +
      '<path class="en-surface" style="fill:url(#enBlue)" d="M9 18Q60 2 111 18L106 81C103 113 85 138 60 148C35 138 17 113 14 81Z"/>' +
      '<path class="en-draw en-rim" d="M15 23Q60 10 105 23"/>' +
      '<path class="en-draw en-eye" d="M28 58Q37 49 47 56M74 56Q84 49 93 58"/>' +
      '<path class="en-draw en-brow" d="M25 44Q37 34 50 42M71 42Q84 34 96 44"/>' +
      '<path class="en-mouth" d="M33 87Q60 102 87 87Q81 117 60 120Q39 117 33 87Z"/>' +
      '<path class="en-draw en-nose" d="M60 58 55 78 63 80"/>' +
      '<path class="en-shine" d="M22 71Q24 106 44 123"/></g></g>' +
      '<g transform="translate(137 62) rotate(15 60 75)"><g class="en-half en-half-right en-mask-gold">' +
      '<path class="en-surface" style="fill:url(#enAmber)" d="M9 18Q60 2 111 18L106 81C103 113 85 138 60 148C35 138 17 113 14 81Z"/>' +
      '<path class="en-draw en-rim" d="M15 23Q60 10 105 23"/>' +
      '<path class="en-draw en-eye" d="M27 60Q37 68 47 61M74 61Q84 68 94 60"/>' +
      '<path class="en-draw en-brow" d="M25 48Q38 49 48 39M73 39Q84 49 97 48"/>' +
      '<path class="en-draw en-mouth-line" d="M38 108Q60 91 83 108"/>' +
      '<path class="en-draw en-nose" d="M60 61 55 81 63 83"/>' +
      '<path class="en-shine" d="M22 71Q24 106 44 123"/></g></g></svg>';
  }
  function play(kind,next) {
    if(kind !== 'persona'){next();return;}
    if(active)return;
    if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches||!Element.prototype.animate){next();return;}
    var previous=document.activeElement,layer=document.createElement('div'),animations=[],timer,revealTimer,finished=false,revealed=false;
    layer.className='en-portal en-persona';layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label','入戏：走入故事');
    layer.innerHTML='<div class="en-panel en-panel-left" aria-hidden="true"></div><div class="en-panel en-panel-right" aria-hidden="true"></div><div class="en-seam" aria-hidden="true"></div><div class="en-composition"><div class="en-overline">TO WRITING STUDIO <span> / </span> PERSONA</div><div class="en-object">'+maskArt()+'</div><div class="en-caption"><em>Persona</em><span>借一个身份，走进故事。</span></div></div><button type="button" class="en-skip">跳过 <span>Esc</span></button>';
    document.body.appendChild(layer);document.documentElement.classList.add('en-running');
    var states=Array.from(document.body.children).filter(function(el){return el!==layer&&el.tagName!=='SCRIPT'&&el.tagName!=='STYLE';}).map(function(el){var old=el.inert;el.inert=true;return [el,old];});
    function reveal(){if(revealed)return;revealed=true;next();}
    function finish(){if(finished)return;finished=true;clearTimeout(timer);clearTimeout(revealTimer);animations.forEach(function(a){a.cancel();});layer.remove();document.documentElement.classList.remove('en-running');states.forEach(function(x){x[0].inert=x[1];});document.removeEventListener('keydown',key,true);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('resize',finish);active=null;if(!revealed&&previous&&previous.isConnected)previous.focus({preventScroll:true});reveal();var focus=document.querySelector('#pzStage.on button:not([hidden])');if(focus)focus.focus({preventScroll:true});}
    function key(e){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish();}else if(e.key==='Tab'){e.preventDefault();layer.querySelector('button').focus();}}
    function hidden(){if(document.hidden)finish();}
    document.addEventListener('keydown',key,true);document.addEventListener('visibilitychange',hidden);window.addEventListener('resize',finish);
    layer.addEventListener('click',finish);layer.querySelector('button').focus({preventScroll:true});active=finish;
    function animate(el,frames,opt){var a=el.animate(frames,opt);animations.push(a);return a;}
    animate(layer,[{opacity:0},{opacity:1}],{duration:160,fill:'both'});
    ['left','right'].forEach(function(side){var sign=side==='left'?-1:1;
      animate(layer.querySelector('.en-half-'+side),[{opacity:0,transform:'translate('+sign*65+'px,24px) rotate('+sign*12+'deg) scale(.85)'},{opacity:1,transform:'translate(0,0) rotate(0deg) scale(1)'}],{duration:720,delay:side==='left'?50:130,fill:'both',easing:'cubic-bezier(.16,1,.3,1)'});
      animate(layer.querySelector('.en-panel-'+side),[{transform:'translateX(0)'},{transform:'translateX('+sign*101+'%)'}],{duration:800,delay:950,fill:'both',easing:'cubic-bezier(.76,0,.24,1)'});
    });
    layer.querySelectorAll('.en-draw').forEach(function(path,i){var length=path.getTotalLength();path.style.strokeDasharray=length;
      animate(path,[{strokeDashoffset:length},{strokeDashoffset:0}],{duration:650,delay:80+i*35,fill:'both',easing:'cubic-bezier(.22,.61,.36,1)'});
    });
    animate(layer.querySelector('.en-object'),[{transform:'perspective(900px) rotateY(-12deg) translateY(10px) scale(.9)',opacity:1},{transform:'perspective(900px) rotateY(0deg) translateY(0) scale(1)',opacity:1,offset:.58},{transform:'perspective(900px) rotateY(0deg) translateY(0) scale(1.5)',opacity:0}],{duration:1240,fill:'both',easing:'cubic-bezier(.22,.61,.36,1)'});
    animate(layer.querySelector('.en-caption'),[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)',offset:.3},{opacity:1,offset:.68},{opacity:0,transform:'translateY(-8px)'}],{duration:1100,delay:110,fill:'both'});
    animate(layer.querySelector('.en-overline'),[{opacity:0},{opacity:.65,offset:.3},{opacity:.65,offset:.7},{opacity:0}],{duration:1150,fill:'both'});
    animate(layer.querySelector('.en-seam'),[{opacity:0,transform:'scaleY(.1)'},{opacity:.5,transform:'scaleY(1)',offset:.55},{opacity:0}],{duration:1200,fill:'both'});
    animate(layer.querySelector('.en-skip'),[{opacity:0},{opacity:1,offset:.3},{opacity:1,offset:.8},{opacity:0}],{duration:1700,fill:'both'});
    revealTimer=setTimeout(reveal,910);timer=setTimeout(finish,1780);
  }
  /* 动画用抽牌台里原来的七张牌。落定后同一组节点继续洗牌、翻牌。 */
  function tarot(g,next) {
    if(active)return;
    if(document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches || !Element.prototype.animate){next();return;}
    var stage=g.querySelector('.tr-stage'), cards=Array.from(stage.querySelectorAll('.tr-in'));
    var anims=[],timer,done=false,skip=document.createElement('button');
    skip.type='button';skip.className='tr-enter-skip';skip.textContent='跳过动画';skip.setAttribute('aria-label','跳过发牌动画');
    var go=g.querySelector('#trGo');go.disabled=true;
    g.classList.add('tr-arriving','on');stage.appendChild(skip);
    function finish(proceed) {
      if(done)return;done=true;clearTimeout(timer);observer.disconnect();
      anims.forEach(function(a){a.cancel();});skip.remove();g.classList.remove('tr-arriving');go.disabled=false;
      document.removeEventListener('keydown',key,true);window.removeEventListener('resize',resized);active=null;
      if(proceed && !g.hidden && g.classList.contains('on')) next();
    }
    function key(e){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(true);}}
    function resized(){finish(true);}
    skip.addEventListener('click',function(e){e.stopPropagation();finish(true);});
    document.addEventListener('keydown',key,true);window.addEventListener('resize',resized);
    var observer=new MutationObserver(function(){if(g.hidden||!g.classList.contains('on'))finish(false);});
    observer.observe(g,{attributes:true,attributeFilter:['hidden','class']});
    active=function(){finish(true);};
    anims.push(g.animate([{opacity:0},{opacity:1}],{duration:280,easing:'ease-out',fill:'both'}));
    // Read the final layout once; animate each card's inner surface to preserve the existing pose rules.
    var rects=cards.map(function(card){return card.getBoundingClientRect();});
    cards.forEach(function(card,i){
      var r=rects[i],spread=i-(cards.length-1)/2;
      var x=spread*Math.min(70,innerWidth/9), y=Math.min(innerHeight*.24,190),scale=innerWidth<600?1.15:1.7;
      var startX=spread*Math.min(130,innerWidth/6), startY=innerHeight-r.top+100;
      anims.push(card.animate([
        {opacity:0,transform:'translate('+startX+'px,'+startY+'px) rotate('+spread*12+'deg) scale(.65)'},
        {opacity:1,transform:'translate('+x+'px,'+(-y*.25)+'px) rotate('+spread*10+'deg) scale('+scale+')',offset:.48},
        {opacity:1,transform:'translate(0,0) rotate(0deg) scale(1)'}
      ],{duration:1100,delay:i*60,fill:'both',easing:'cubic-bezier(.22,.68,.25,1)'}));
    });
    timer=setTimeout(function(){finish(true);},1100+(cards.length-1)*60+30);
  }
  T.entrance={play:play,tarot:tarot,skip:function(){if(active)active();},maskIcon:maskIcon,cardIcon:cardIcon};
})();

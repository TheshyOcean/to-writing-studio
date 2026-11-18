const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const dir=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(dir,'studio.js'),'utf8');
const css=fs.readFileSync(path.join(dir,'studio.css'),'utf8');

function session(){
  let now=0,seq=0;
  let view='v-chat',hasEditor=true;
  const events={},jobs=new Map();
  const classes=new Set(['ink-enabled','ink-panel-collapsed']);
  const root={classList:{contains:n=>classes.has(n),toggle(n,on){on?classes.add(n):classes.delete(n);}}};
  const margin={setAttribute(){},inert:true,contains:()=>false};
  const pulseClasses=new Set();
  const attrs={};
  const pulse={setAttribute(n,v){attrs[n]=v;},getAttribute:n=>attrs[n],classList:{
    add:n=>pulseClasses.add(n),remove:n=>pulseClasses.delete(n),toggle(n,on){on?pulseClasses.add(n):pulseClasses.delete(n);}
  }};
  Object.defineProperty(pulse,'docked',{get:()=>pulseClasses.has('ink-at-composer')});
  const composer={appendChild(p){p.parentNode=composer;}},viewport={appendChild(p){p.parentNode=viewport;}};
  let chapter={appendChild(p){p.parentNode=chapter;els.stInkPulse=p;}};
  const els={stMargin:margin,stInkPulse:pulse,stWritingTime:{textContent:''},stIdleTime:{textContent:''}};
  const document={hidden:false,addEventListener(n,f){events[n]=f;},querySelector(selector){if(selector==='#v-chat .composer')return composer;if(selector==='#v-book .tws-ch-head')return chapter;if(selector==='.viewport')return viewport;if(selector==='.view.active'&&view)return {id:view,querySelector:()=>hasEditor?{}:null};return null;},querySelectorAll:()=>[]};
  const timeout=(f,dt,repeat)=>{const id=++seq;jobs.set(id,{f,due:now+dt,repeat});return id;};
  const ctx={root,document,performance:{now:()=>now},$:id=>els[id],MutationObserver:class{observe(){}},
    setInterval:(f,dt)=>timeout(f,dt,dt),setTimeout:(f,dt)=>timeout(f,dt,0),clearTimeout:id=>jobs.delete(id)};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('var INK_ACTIVITY_WINDOW_MS='),source.indexOf('function fmtK(')),ctx);
  ctx.inkPulseNode=pulse;
  ctx.setInkPanel(false);
  ctx.initWritingClock();
  function advance(dt){const end=now+dt;while(true){let entry=[...jobs].filter(([,j])=>j.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!entry)break;let [id,j]=entry;now=j.due;if(j.repeat)j.due+=j.repeat;else jobs.delete(id);j.f();}now=end;ctx.accountWritingTime(now);}
  function input(id='input',kind='input',fields={}){events[kind]({type:kind,target:{matches:q=>q.split(',').includes('#'+id)},...fields});}
  function setView(id,editor=true){view=id;hasEditor=editor;ctx.syncInkContext();}
  function redrawChapter(){delete els.stInkPulse;chapter={appendChild(p){p.parentNode=chapter;els.stInkPulse=p;}};ctx.syncInkContext();return chapter;}
  return {ctx,document,els,classes,advance,input,events,setView,composer,viewport,redrawChapter,pulseClasses,get chapter(){return chapter;}};
}

test('typing and pausing keep the margin in the state the writer chose',()=>{
  const s=session();s.advance(5000);assert.equal(s.ctx.writingClock.writing,0);
  s.input();assert.ok(s.classes.has('ink-panel-collapsed'));assert.equal(s.els.stMargin.inert,true);
  s.advance(2000);assert.ok(s.classes.has('ink-panel-collapsed'));
  s.ctx.setInkPanel(true);
  s.input();assert.equal(s.els.stMargin.inert,false);
  s.advance(2000);assert.equal(s.els.stMargin.inert,false);
  s.events.keydown({key:'Escape'});
  s.advance(2000);assert.equal(s.els.stMargin.inert,true);
});
test('session time is accounted for independently of the margin',()=>{
  const s=session();s.input();
  s.advance(1200);assert.equal(s.els.stWritingTime.textContent,'00:01');
  s.advance(1000);assert.equal(s.els.stMargin.inert,true);
  assert.equal(s.ctx.writingClock.writing,1800);assert.equal(s.ctx.writingClock.idle,400);
  s.advance(1000);assert.equal(s.ctx.writingClock.idle,1400);
});
test('Chinese IME brightens the ink mark only once text is committed',()=>{
  const s=session();s.setView('v-book');s.input('twsContent','input',{isComposing:true});
  assert.equal(s.pulseClasses.has('ink-writing'),false);
  s.input('twsContent','compositionend',{data:'字'});
  assert.equal(s.pulseClasses.has('ink-writing'),true);
  s.advance(1000);assert.equal(s.ctx.writingClock.writing,1000);
  assert.equal(s.els.stMargin.inert,true);
});
test('unrelated settings fields never start a writing session',()=>{
  const s=session();s.input('mName');s.advance(6000);
  assert.equal(s.ctx.writingClock.started,false);assert.equal(s.ctx.writingClock.writing,0);assert.equal(s.ctx.writingClock.idle,0);
});
test('the ink mark settles to a static state after a short pause',()=>{
  const s=session();s.input();s.advance(150);s.input();
  s.advance(120);assert.equal(s.pulseClasses.has('ink-writing'),true);
  s.advance(150);assert.equal(s.pulseClasses.has('ink-writing'),false);
});
test('time in a background tab is excluded',()=>{
  const s=session();s.input();s.advance(500);
  s.document.hidden=true;s.events.visibilitychange();s.advance(10000);
  assert.equal(s.ctx.writingClock.writing,500);assert.equal(s.ctx.writingClock.idle,0);
  s.document.hidden=false;s.events.visibilitychange();s.advance(1000);
  assert.equal(s.ctx.writingClock.idle,1000);
});
test('leaving a writing view closes the margin without reopening on return',()=>{
  const s=session();s.ctx.setInkPanel(true);s.input();s.advance(500);s.setView('v-cfg');
  assert.ok(!s.classes.has('ink-context-active'));assert.equal(s.els.stMargin.inert,true);
  s.advance(5000);assert.equal(s.ctx.writingClock.writing,500);assert.equal(s.ctx.writingClock.idle,0);
  assert.ok(s.classes.has('ink-panel-collapsed'));
  s.setView('v-chat');assert.ok(s.classes.has('ink-context-active'));assert.equal(s.els.stMargin.inert,true);
});
test('definition, lore, timeline and empty book views cannot awaken the companion',()=>{
  const s=session();
  for(const id of ['v-def','v-lore','v-threads','v-cfg']){
    s.setView(id);s.input();assert.ok(!s.classes.has('ink-context-active'));assert.equal(s.ctx.writingClock.started,false);
  }
  s.setView('v-book',false);s.input('twsContent');assert.ok(!s.classes.has('ink-context-active'));
  s.setView('v-book',true);s.input('twsContent');assert.ok(s.classes.has('ink-context-active'));assert.ok(s.classes.has('ink-panel-collapsed'));
});
test('chat companion follows the composer and detaches when leaving the chat',()=>{
  const s=session();assert.equal(s.els.stInkPulse.parentNode,s.composer);assert.equal(s.els.stInkPulse.docked,true);
  s.setView('v-book');assert.equal(s.els.stInkPulse.parentNode,s.chapter);assert.equal(s.els.stInkPulse.docked,false);
  s.setView('v-chat');assert.equal(s.els.stInkPulse.parentNode,s.composer);assert.equal(s.els.stInkPulse.docked,true);
});
test('chapter redraws retain the same companion instead of destroying or duplicating it',()=>{
  const s=session();s.setView('v-book');const pulse=s.els.stInkPulse;
  const newHeader=s.redrawChapter();assert.equal(s.els.stInkPulse,pulse);assert.equal(pulse.parentNode,newHeader);
  s.input('twsContent');assert.ok(s.classes.has('ink-panel-collapsed'));
});
test('moving the chapter into fullscreen focus keeps writing time active',()=>{
  const s=session();s.classes.add('tws-focus');s.els.twsContent={};s.setView('v-book',false);
  s.input('twsContent');s.advance(1000);assert.equal(s.ctx.writingClock.writing,1000);
});
test('the ink mark has no looping animation and honors reduced motion',()=>{
  const ink=css.slice(css.indexOf('/* 页边由用户开关'),css.indexOf('.st-thr{'));
  assert.doesNotMatch(ink,/animation:[^;]*infinite/);
  assert.match(ink,/@media\(prefers-reduced-motion:no-preference\)/);
});

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
  const classes=new Set(['ink-enabled']);
  const root={classList:{contains:n=>classes.has(n),toggle(n,on){on?classes.add(n):classes.delete(n);}}};
  let rate=1;
  const margin={setAttribute(){},inert:false};
  const pulseClasses=new Set();
  const pulse={setAttribute(){},classList:{toggle(n,on){on?pulseClasses.add(n):pulseClasses.delete(n);}},querySelectorAll:()=>[{getAnimations:()=>[{updatePlaybackRate:r=>{rate=r;}}]}]};
  Object.defineProperty(pulse,'docked',{get:()=>pulseClasses.has('ink-at-composer')});
  const composer={appendChild(p){p.parentNode=composer;}},viewport={appendChild(p){p.parentNode=viewport;}};
  let chapter={appendChild(p){p.parentNode=chapter;els.stInkPulse=p;}};
  const els={stMargin:margin,stInkPulse:pulse,stWritingTime:{textContent:''},stIdleTime:{textContent:''}};
  const document={hidden:false,addEventListener(n,f){events[n]=f;},querySelector(selector){if(selector==='#v-chat .composer')return composer;if(selector==='#v-book .tws-ch-head')return chapter;if(selector==='.viewport')return viewport;return view?{id:view,querySelector:()=>hasEditor?{}:null}:null;},querySelectorAll:()=>[]};
  const timeout=(f,dt,repeat)=>{const id=++seq;jobs.set(id,{f,due:now+dt,repeat});return id;};
  const ctx={root,document,performance:{now:()=>now},$:id=>els[id],MutationObserver:class{observe(){}},
    setInterval:(f,dt)=>timeout(f,dt,dt),setTimeout:(f,dt)=>timeout(f,dt,0),clearTimeout:id=>jobs.delete(id)};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('var INK_IDLE_MS='),source.indexOf('function fmtK(')),ctx);
  ctx.initWritingClock();
  ctx.inkPulseNode=pulse;
  function advance(dt){const end=now+dt;while(true){let entry=[...jobs].filter(([,j])=>j.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!entry)break;let [id,j]=entry;now=j.due;if(j.repeat)j.due+=j.repeat;else jobs.delete(id);j.f();}now=end;ctx.accountWritingTime(now);}
  function input(id='input',kind='input'){events[kind]({target:{matches:q=>q.split(',').includes('#'+id)}});}
  function setView(id,editor=true){view=id;hasEditor=editor;ctx.syncInkContext();}
  function redrawChapter(){delete els.stInkPulse;chapter={appendChild(p){p.parentNode=chapter;els.stInkPulse=p;}};ctx.syncInkContext();return chapter;}
  return {ctx,document,els,classes,advance,input,events,setView,composer,viewport,redrawChapter,get chapter(){return chapter;},get rate(){return rate;}};
}

test('typing collapses the full margin; stopping restores it with elapsed-time accounting',()=>{
  const s=session();s.advance(5000);assert.equal(s.ctx.writingClock.writing,0);
  s.input();assert.ok(s.classes.has('ink-panel-collapsed'));assert.equal(s.els.stMargin.inert,true);
  s.advance(1200);assert.equal(s.els.stWritingTime.textContent,'00:01');
  s.advance(1000);assert.ok(!s.classes.has('ink-panel-collapsed'));assert.equal(s.els.stMargin.inert,false);
  assert.equal(s.ctx.writingClock.writing,1800);assert.equal(s.ctx.writingClock.idle,400);
  s.advance(1000);assert.equal(s.ctx.writingClock.idle,1400);
});
test('late-created chapter editors and Chinese IME keep the session active',()=>{
  const s=session();s.setView('v-book');s.input('twsContent');s.advance(1000);s.input('twsContent','compositionupdate');
  s.advance(1000);assert.ok(s.classes.has('ink-panel-collapsed'));
  assert.equal(s.ctx.writingClock.writing,2000);
  s.advance(900);assert.ok(!s.classes.has('ink-panel-collapsed'));
  s.input('twsContent');assert.ok(s.classes.has('ink-panel-collapsed'));
});
test('unrelated settings fields never start a writing session',()=>{
  const s=session();s.input('mName');s.advance(6000);
  assert.equal(s.ctx.writingClock.started,false);assert.equal(s.ctx.writingClock.writing,0);assert.equal(s.ctx.writingClock.idle,0);
});
test('fast typing changes playback rate without restarting or enlarging the animation',()=>{
  const s=session();s.input();const slow=s.rate;
  for(let i=0;i<8;i++){s.advance(90);s.input();}
  assert.ok(s.rate>slow);assert.ok(s.rate<=3.2);
  s.advance(1800);assert.equal(s.rate,1);
});
test('time in a background tab is excluded',()=>{
  const s=session();s.input();s.advance(500);
  s.document.hidden=true;s.events.visibilitychange();s.advance(10000);
  assert.equal(s.ctx.writingClock.writing,500);assert.equal(s.ctx.writingClock.idle,0);
  s.document.hidden=false;s.events.visibilitychange();s.advance(1000);
  assert.equal(s.ctx.writingClock.idle,1000);
});
test('leaving a writing view hides the companion and cancels the pending reveal',()=>{
  const s=session();s.input();s.advance(500);s.setView('v-cfg');
  assert.ok(!s.classes.has('ink-context-active'));assert.equal(s.els.stMargin.inert,true);
  s.advance(5000);assert.equal(s.ctx.writingClock.writing,500);assert.equal(s.ctx.writingClock.idle,0);
  assert.ok(s.classes.has('ink-panel-collapsed'));
  s.setView('v-chat');assert.ok(s.classes.has('ink-context-active'));assert.equal(s.els.stMargin.inert,false);
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
test('rhythm keyframes cannot collide with the theme transition that scales to 80x',()=>{
  const ink=css.slice(css.indexOf('/* 墨韵:'),css.indexOf('.st-thr{'));
  assert.doesNotMatch(ink,/animation:stWave\b/);
  for(const name of ['twsInkRhythmBars','twsInkRhythmBreath']){
    assert.equal((css.match(new RegExp('@keyframes '+name+'\\b','g'))||[]).length,1);
  }
  assert.match(ink,/overflow:hidden!important;contain:paint/);
  assert.match(ink,/@keyframes twsInkRhythmBars\{0%,100%\{transform:scaleY\(\.65\)\}50%\{transform:scaleY\(1\.35\)\}\}/);
});

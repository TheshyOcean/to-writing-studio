const {test} = require('node:test');
const assert = require('node:assert/strict');
const {makeAnchor,locateAnchor} = require('../../js/tws-desk.js');
test('inserting an opening before the quoted sentence relocates the exact selection',()=>{
  const text='他沿着石阶走近。门后传来了三声轻叩。他停住了脚步。';
  const start=text.indexOf('门后');const anchor=makeAnchor(text,start,start+'门后传来了三声轻叩。'.length);
  assert.deepEqual(locateAnchor('【新加的引子】\n'+text,anchor),{status:'found',start:start+'【新加的引子】\n'.length,end:start+'【新加的引子】\n'.length+anchor.quote.length});
});
test('removed or rewritten quotation remains orphaned, never selects approximate text',()=>{
 const a=makeAnchor('雨已经停了。她推开门。',0,6);
 assert.equal(locateAnchor('风已经停了。她推开门。',a).status,'missing');
});
test('repeated quotation resolves only through surrounding text',()=>{
 const text='村口的那棵老树下，他说：好。随后向北走了。\n夜深的客栈楼上，她说：好。随后关上门。';
 const p=text.lastIndexOf('好。'), a=makeAnchor(text,p,p+2);
 const changed='新加一段开场。\n'+text;
 assert.equal(locateAnchor(changed,a).start,changed.lastIndexOf('好。'));
});
test('duplicated whole passage cannot be decided by its old offset',()=>{
 const passage='在灯光照不见的地方，甲说：等我。乙点点头转身消失在楼梯尽头。';
 const p=passage.indexOf('等我。'), a=makeAnchor(passage,p,p+3);
 assert.equal(locateAnchor(passage+'\n'+passage,a).status,'ambiguous');
});
test('bare external quote with multiple matches is ambiguous',()=>{
 assert.equal(locateAnchor('你好。你好。',{quote:'你好。',start:0}).status,'ambiguous');
});
test('chapter-level notes have no artificial selection',()=>{
 assert.deepEqual(locateAnchor('一段正文',{quote:''}),{status:'chapter',start:0,end:0});
});
test('Unicode selections preserve DOM UTF-16 coordinates',()=>{
 const text='她看着🌙说：今晚走。', p=text.indexOf('🌙'), a=makeAnchor(text,p,p+2);
 assert.deepEqual(locateAnchor('序。'+text,a),{status:'found',start:p+2,end:p+4});
});
test('exact quote at start still relocates after edits when unique',()=>{
 const a=makeAnchor('先敲门。再进屋。',0,4);
 assert.equal(locateAnchor('开场。先敲门。再进屋。',a).start,3);
});

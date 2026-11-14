const {test}=require('node:test');
const assert=require('node:assert/strict');
const {diff,compose,canApply}=require('../../js/tws-revision.js');
const cases=[['','新内容'],['删除全部',''],['一模一样','一模一样'],['她看见月亮。风吹过窗台。','她望见明月。雨落在窗台。'],['你好你好你好。','你好，再见你好。'],['🪶 她说：好。\n','🎭 她说：走吧。\n'],['长段落。'.repeat(1500),'新段落。'.repeat(1500)]];
for(const [before,after]of cases)test('接受／保留可还原两端：'+before.slice(0,12),()=>{const parts=diff(before,after);assert.equal(compose(parts),after);parts.forEach(p=>p.accepted=false);assert.equal(compose(parts),before);});
test('一处拒绝，一处采纳，不改动中间原文',()=>{const parts=diff('甲。中间这一大段原文保持原样。乙。','丙。中间这一大段原文保持原样。丁。');const changes=parts.filter(p=>p.kind==='change');assert.equal(changes.length,2);changes[0].accepted=false;assert.equal(compose(parts),'甲。中间这一大段原文保持原样。丁。');});
test('拒绝章节、作品或正文已经变化的写回',()=>{const a={chapterId:'c',projectId:'p',content:'稿'};assert.equal(canApply(a,{...a}),true);for(const patch of[{chapterId:'other'},{projectId:'other'},{content:'新稿'}])assert.equal(canApply(a,{...a,...patch}),false);});

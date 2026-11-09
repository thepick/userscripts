const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./filter-backup-harness.cjs');
function field(){return {value:'',disabled:false,selectionStart:0,selectionEnd:0,scrollTop:0,events:{},addEventListener(n,fn){this.events[n]=fn;},focus(){},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}};}
for(const platform of ['bluesky','reddit']){
 test(platform+': paged editor preserves all raw text and edits across navigation',()=>{
  const c=load(platform),e=field(),prev=field(),next=field(),label={},bar={},m=c.editor(e,prev,next,label,bar);
  const lines=Array.from({length:100000},(_,i)=>i===5000?'  ไทย İ 😀  ':'word'+i),text=lines.join('\n')+'\n';
  m.setText(text);assert.equal(m.getText(),text);assert(e.value.split('\n').length<=1000);assert.equal(bar.hidden,false);
  e.value='changed\n'+e.value;e.events.input({});next.events.click();e.value='second-page\n'+e.value;e.events.input({});prev.events.click();assert(e.value.startsWith('changed'));assert(m.getText().includes('second-page'));assert(m.getText().endsWith('word99999\n'));
  m.setText('short\n\ntext\n');assert.equal(m.getText(),'short\n\ntext\n');assert.equal(bar.hidden,true);
 });
 test(platform+': full-list search reaches last page, wraps, and retains edits',()=>{
  const c=load(platform),e=field(),prev=field(),next=field(),m=c.editor(e,prev,next,{},{});
  m.setText(Array.from({length:100000},(_,i)=>'word'+i).join('\n'));m.findNext('word99999');assert.equal(e.value.slice(e.selectionStart,e.selectionEnd),'word99999');
  e.value=e.value.replace('word99999','lastedit');m.findNext('word0');assert.equal(e.value.slice(e.selectionStart,e.selectionEnd),'word0');assert(m.getText().endsWith('lastedit'));
 });
 test(platform+': Unicode case expansion preserves search selection',()=>{
  const c=load(platform),e=field(),m=c.editor(e,field(),field(),{},{});
  m.setText('İ\nword');m.findNext('word');assert.equal(e.value.slice(e.selectionStart,e.selectionEnd),'word');
 });
 test(platform+': long entries and large pastes stay bounded without data loss',()=>{
  const c=load(platform),e=field(),m=c.editor(e,field(),field(),{},{}),text=Array.from({length:800},(_,i)=>String(i).padStart(4,'0')+'x'.repeat(9996)).join('\n');
  m.setText(text);assert(e.value.length<=65536);assert.equal(m.getText(),text);
  m.setText('');e.value=text;e.selectionStart=e.selectionEnd=50000;e.events.input({});assert(e.value.length<=65536);assert.equal(m.getText(),text);assert.equal(e.selectionEnd,50000);
 });
}

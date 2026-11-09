const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./filter-backup-harness.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
const ai={enabled:true,mode:'hide',scope:'all',analyzeImages:true,topics:['Keep science; hide sports'],budget:.2,requestLimit:100};
const backup=(shared={blocklist:[' DOG ','dog','','ไทย'],allowlist:['SCIENCE']},platforms={})=>({format:'unified-content-filter-backup',version:1,shared,platforms});
for(const platform of ['bluesky','reddit']) {
 test(platform+': partial platform sections retain known omitted preferences',()=>{
  const api=load(platform);assert.equal(typeof api.merge,'function');
  assert.deepEqual(plain(api.merge({bluesky:{autoWhitelistEnabled:true,altTextEnforcementEnabled:false},reddit:{ai}},{bluesky:{ai:Object.assign({},ai,{scope:'news'})}})),{bluesky:{autoWhitelistEnabled:true,altTextEnforcementEnabled:false,ai:Object.assign({},ai,{scope:'news'})},reddit:{ai}});
 });
 test(platform+': corrupt retained metadata does not discard valid saved filters',async()=>{
  const settings=platform==='bluesky'?{filteredTerms:['keep-me'],manualWhitelistTerms:[],autoWhitelistEnabled:false,altTextEnforcementEnabled:false,backupPlatforms:{bad:1}}:{version:1,revision:'test',blocklist:['keep-me'],whitelist:[],backupPlatforms:{bad:1}};
  const api=load(platform,platform==='bluesky'?{bcmSettingsV1:JSON.stringify({version:1,settings})}:{rafaiSettingsV1:settings});
  const read=await api.read(),value=platform==='bluesky'?read.value:read;
  assert.deepEqual(plain(value[platform==='bluesky'?'filteredTerms':'blocklist']),['keep-me']);
  assert.deepEqual(plain(value.backupPlatforms),{});
 });
 test(platform+': restored lists also enforce the combined byte cap',async()=>{
  const entries=Array.from({length:500},(_,i)=>String(i)+'x'.repeat(9000));
  const settings=platform==='bluesky'?{filteredTerms:entries,manualWhitelistTerms:entries,autoWhitelistEnabled:false,altTextEnforcementEnabled:false}:{version:1,revision:'test',blocklist:entries,whitelist:entries};
  const api=load(platform,platform==='bluesky'?{bcmSettingsV1:JSON.stringify({version:1,settings})}:{rafaiSettingsV1:settings});
  const read=await api.read(),value=platform==='bluesky'?read.value:read;
  assert.equal(value[platform==='bluesky'?'filteredTerms':'blocklist'].length,0);
 });
 test(platform+': unified shared lists preserve order and platform settings',()=>{
  const api=load(platform); assert.equal(typeof api.parse,'function');
  const result=api.parse(JSON.stringify(backup(undefined,{bluesky:{autoWhitelistEnabled:true,ai:Object.assign({},ai,{scope:'news'})},reddit:{ai}})));
  assert.deepEqual(plain(result.shared),{blocklist:['dog','ไทย'],allowlist:['science']});
  assert.equal(result.platforms.bluesky.ai.scope,'news'); assert.equal(result.platforms.reddit.ai.enabled,true);
 });
 test(platform+': legacy formats map lists and only declared options',()=>{
  const api=load(platform);
  for(const format of ['reddit-advanced-content-filter-settings','reddit-advanced-content-filter-ai-settings']) {
   const result=api.parse(JSON.stringify({format,version:1,blocklist:['cat'],whitelist:['dog'],ai}));
   assert.deepEqual(plain(result.shared),{blocklist:['cat'],allowlist:['dog']}); assert.deepEqual(plain(result.platforms),{reddit:{ai}});
  }
  const b=api.parse(JSON.stringify({format:'bluesky-content-manager-settings',version:1,settings:{filteredTerms:['cat'],manualWhitelistTerms:[],autoWhitelistEnabled:false,altTextEnforcementEnabled:true}}));
  assert.deepEqual(plain(b.platforms),{bluesky:{autoWhitelistEnabled:false,altTextEnforcementEnabled:true}});
 });
 test(platform+': rejects malformed, future, partial, secret and dangerous settings',()=>{
  const api=load(platform);
  assert.throws(()=>api.parse('{'),/JSON/);
  for(const value of [null,[],{},Object.assign(backup(),{version:2}),backup({blocklist:['cat'],allowlist:[3]}),backup(undefined,{reddit:{ai:Object.assign({},ai,{scope:'news'})}}),backup(undefined,{bluesky:{autoWhitelistEnabled:'false'}}),backup(undefined,{reddit:{apiKey:'DO-NOT-EXPORT'}}),JSON.parse('{"format":"unified-content-filter-backup","version":1,"shared":{"blocklist":[],"allowlist":[]},"platforms":{"__proto__":{}}}')]) assert.throws(()=>api.parse(JSON.stringify(value)));
 });
 test(platform+': round trip preserves both platforms and excludes runtime data',()=>{
  const api=load(platform),b=api.parse(JSON.stringify(backup(undefined,{bluesky:{autoWhitelistEnabled:true},reddit:{ai}})));
  const out=api.create(b.shared,b.platforms);
  assert.equal(out.format,'unified-content-filter-backup');assert.equal(out.version,1);
  assert.deepEqual(plain(api.parse(JSON.stringify(out)).platforms),plain(b.platforms));
 });
 test(platform+': count, entry, combined UTF-8 and file byte limits',()=>{
  const api=load(platform),list=Array.from({length:100000},(_,i)=>'term'+i);
  assert.equal(api.shared(list,list).blocklist.length,100000);
  assert.throws(()=>api.shared(list.concat('extra'),[]),/100,000/);
  assert.equal(api.shared(['x'.repeat(10000)],[]).blocklist[0].length,10000);
  assert.throws(()=>api.shared(['x'.repeat(10001)],[]),/10,000/);
  assert.throws(()=>api.shared(['two\nentries'],[]),/line/);
  assert.throws(()=>api.shared(['two\rentries'],[]),/line/);
  assert.throws(()=>api.shared(Array.from({length:900},(_,i)=>'ก'.repeat(4000)+i),[]),/8 MiB/);
  assert.throws(()=>api.parse(' '.repeat(10*1024*1024+1)),/10 MiB/);
  assert.throws(()=>api.parse('ก'.repeat(4*1024*1024)),/10 MiB/);
 });
 test(platform+': exact byte boundaries are inclusive and exports remain importable',()=>{
  const api=load(platform),entries=Array.from({length:838},(_,i)=>String(i).padStart(4,'0')+'x'.repeat(9996));
  entries.push('z'.repeat(8*1024*1024-Buffer.byteLength(entries.join('\n'))-1));
  assert.equal(Buffer.byteLength(entries.join('\n')),8*1024*1024);
  assert.equal(api.shared(entries,[]).blocklist.length,839);
  entries[838]+='z';assert.throws(()=>api.shared(entries,[]),/8 MiB/);
  const json=JSON.stringify(backup());assert.doesNotThrow(()=>api.parse(json+' '.repeat(10*1024*1024-Buffer.byteLength(json))));
  const shared=api.shared(Array.from({length:800},(_,i)=>String(i)+'\u0000'.repeat(9990)),[]);
  assert.throws(()=>api.create(shared,{}),/10 MiB/);
 });
}

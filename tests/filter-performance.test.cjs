const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./filter-backup-harness.cjs');
for(const platform of ['bluesky','reddit']) test(platform+': large unrelated lists do not scan every regular expression per post',()=>{
 const api=load(platform),terms=Array.from({length:10000},(_,i)=>'keyword'+i);
 const rules=api.compile(terms);api.match('A neutral science headline',rules);
 const start=performance.now();for(let i=0;i<10;i++)assert.equal(api.match('A neutral science headline',rules),null);
 assert.ok((performance.now()-start)/10<50,'Warm per-post matching exceeded the 50 ms regression guard');
});

const {load}=require('./filter-backup-harness.cjs');
const {performance}=require('node:perf_hooks');
const results=[];
for(const platform of ['bluesky','reddit']) for(const count of [1000,10000,50000,100000]) {
 const api=load(platform),terms=Array.from({length:count},(_,i)=>i%4===0?'long phrase number '+i:i%4===1?'café'+i:i%4===2?'ข่าว'+i:'term'+i);
 const text=JSON.stringify({format:'unified-content-filter-backup',version:1,shared:{blocklist:terms,allowlist:terms.map(t=>'allow '+t)},platforms:{}});
 let t=performance.now();const parsed=api.parse(text);const importMs=performance.now()-t;
 t=performance.now();const rules=api.compile(parsed.shared.blocklist);const compileMs=performance.now()-t;
 t=performance.now();api.match('A neutral science headline with no keyword match',rules);const firstPostMs=performance.now()-t;
 t=performance.now();for(let i=0;i<20;i++)api.match('A neutral science headline with no keyword match',rules);const postMs=(performance.now()-t)/20;
 t=performance.now();api.match('A term without its numbered suffix; café and ข่าว; long phrase number absent',rules);const sharedPrefixMs=performance.now()-t;
 t=performance.now();const match=api.match(terms[count-1],rules);const lateMatchMs=performance.now()-t;if(!match)throw Error('Late matching entry was lost');
 const row={platform,count,importMs,compileMs,firstPostMs,postMs,sharedPrefixMs,lateMatchMs,heapMiB:process.memoryUsage().heapUsed/1048576};results.push(row);console.log(JSON.stringify(row));
}

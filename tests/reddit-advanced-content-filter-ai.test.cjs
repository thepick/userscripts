const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
function load(){
 let source=fs.readFileSync(path.join(__dirname,'../reddit-advanced-content-filter-ai.user.js'),'utf8');
 const exports='Object.assign(globalThis,{normalizeList,compileRules,matchBlock,safePostURL,...(typeof validateConfig==="function"?{validateConfig}:{}),...(typeof getPostIdentity==="function"?{getPostIdentity}:{}),...(typeof validCacheEntries==="function"?{validCacheEntries}:{})});';
 if(source.includes('\n    main();'))source=source.replace('\n    main();','\n    '+exports);
 else source=source.replace('    try {\n        const [blocklist, whitelist]', '    '+exports+' return;\n    try {\n        const [blocklist, whitelist]');
 const values=new Map();const context={console,URL,TextEncoder,crypto:webcrypto,performance,Date,setTimeout:()=>1,clearTimeout(){},window:{},GM_getValue:(key,fallback)=>values.has(key)?values.get(key):fallback,GM_setValue:(key,value)=>values.set(key,value),GM_xmlhttpRequest:()=>{throw Error('Network requests disabled in tests')},location:{href:'https://www.reddit.com/',hostname:'www.reddit.com'},document:{createElement:()=>({dataset:{}}),head:{appendChild(){}},documentElement:{appendChild(){}}}};
 vm.createContext(context);vm.runInContext(source,context);return context;
}
test('regular plurals, Unicode boundaries, punctuation, and literal phrases stay compatible',()=>{
 const api=load(),match=(text,terms)=>api.matchBlock(text,api.compileRules(terms));
 assert.equal(match('cities',['city']),'cities');assert.equal(match('boxes',['box']),'boxes');assert.equal(match('C++'.toLowerCase(),['c++']),'c++');assert.equal(match('scat',['cat']),null);assert.equal(match('cater',['cat']),null);assert.equal(match('new yorker',['new york']),'new york');
});
test('lists validate, deduplicate, and reject corrupt values',()=>{
 const api=load();assert.deepEqual(Array.from(api.normalizeList([' DOG ','dog',''])),['dog']);assert.throws(()=>api.normalizeList({}));assert.throws(()=>api.normalizeList(['dog',17]));
});
test('existing long lists and literal phrases are not rejected by new size limits',()=>{
 const api=load();assert.equal(api.normalizeList(Array.from({length:50001},()=> 'dog')).length,1);assert.equal(api.normalizeList(['a'.repeat(6000)])[0].length,6000);
});
test('derived cache stays capped and excludes expired or future entries',()=>{
 const api=load(),hash='a'.repeat(64),now=Date.now();const entries=Array.from({length:5005},(_,i)=>[hash+':p'+i,{fingerprint:hash,source:'title',trigger:'word',at:now-1000}]);
 entries.push([hash+':expired',{fingerprint:hash,source:'title',trigger:'word',at:now-31*86400000}],[hash+':future',{fingerprint:hash,source:'title',trigger:'word',at:now+86400000}]);
 const retained=api.validCacheEntries({version:1,entries});assert.equal(retained.length,5000);assert.ok(retained.every(([key])=>!key.endsWith(':expired')&&!key.endsWith(':future')));
});
test('settings backups require two validated lists',()=>{
 const api=load();assert.equal(typeof api.validateConfig,'function');assert.deepEqual(Array.from(api.validateConfig({blocklist:[' City '],whitelist:[]}).blocklist),['city']);assert.throws(()=>api.validateConfig({blocklist:[],whitelist:{}}));
});
test('post identity prefers platform fullname over a cited body URL',()=>{
 const api=load();assert.equal(typeof api.getPostIdentity,'function');
 const post={id:'t3_actual',matches:()=>true,getAttribute:name=>name==='data-fullname'?'t3_actual':null,querySelector:()=>null,querySelectorAll:()=>[]};
 assert.equal(api.getPostIdentity(post).id,'actual');
});
test('unsafe history URLs remain rejected',()=>{
 const api=load();assert.equal(api.safePostURL('javascript:alert(1)'),'');assert.equal(api.safePostURL('https://example.com/comments/abc/'),'');assert.equal(api.safePostURL('https://evil:password@www.reddit.com/comments/abc/'),'');assert.ok(api.safePostURL('/r/news/comments/abc/title'));
});
test('derived cache rejects malformed and expired entries',()=>{
 const api=load();assert.equal(typeof api.validCacheEntries,'function');assert.equal(api.validCacheEntries({version:1,entries:[['bad',{}]]}).length,0);
});

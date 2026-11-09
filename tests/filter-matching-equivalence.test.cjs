const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./filter-backup-harness.cjs');
for(const platform of ['bluesky','reddit']) {
 const oracle=require('./fixtures/'+platform+'-matching-a993d30.cjs');
 test(platform+': candidate index preserves baseline matches and first-rule priority',()=>{
  const api=load(platform);
  const terms=['dog','city','box','by','c++','foo_bar','café','ข่าว','ος','σ','ſ','straße','new york','a  b','a\tb','\u200b','@alice.bsky.social','emoji 😀','a.b','x-y'];
  const texts=['dogs cities boxes','new_yorker','NEW—YORK','a\t b','a b',"ος'a",'foo_bar','Straße','STRASSE','Σ ς σ','caféine','café','x-y','x y','c++','cater','＠alice.bsky.social','emoji 😀','a.b'];
  for(const text of texts) for(const list of [terms,...terms.map(t=>[t]),terms.slice().reverse()]) assert.equal(api.match(text,api.compile(list)),oracle.match(text,oracle.compile(list)),JSON.stringify({text,list}));
 });
 test(platform+': Unicode case candidates never exclude baseline single-character matches',()=>{
  const api=load(platform);
  for(let code=1;code<65536;code++) {
   const term=String.fromCharCode(code);
   if(term.toUpperCase()===term.toLowerCase() || /[\uD800-\uDFFF]/.test(term))continue;
   const rules=api.compile([term]),old=oracle.compile([term]);
   for(const text of [term.toUpperCase(),term.toLowerCase(),term+"'a",'a '+term+'!']) assert.equal(api.match(text,rules),oracle.match(text,old),'U+'+code.toString(16)+' '+JSON.stringify(text));
  }
 });
}

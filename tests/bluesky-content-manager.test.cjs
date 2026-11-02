const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');

function load(values={}) {
  let source=fs.readFileSync(require('node:path').join(__dirname,'../bluesky-content-manager.user.js'),'utf8');
  source=source.replace(/\nmain\(\);\s*\n/, '\nObject.assign(globalThis, {termToRegex, regexMatchAny, initializeSettings, normalizeUsername, ...(typeof readSettings === "function" ? {readSettings} : {}), ...(typeof validateSettings === "function" ? {validateSettings} : {}), ...(typeof parsePostURL === "function" ? {parsePostURL} : {}), ...(typeof getActiveAccount === "function" ? {getActiveAccount} : {})});\n');
  const storage=new Map(Object.entries(values));
  const context={console,URL,TextEncoder,crypto:webcrypto,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},performance,location:{origin:'https://bsky.app',pathname:'/'},window:{location:{pathname:'/'},addEventListener(){},matchMedia:()=>({matches:false})},document:{body:{},documentElement:{},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}},localStorage:{getItem(){return null}},GM_addStyle(){},GM_getValue:(key,fallback)=>storage.has(key)?storage.get(key):fallback,GM_setValue:(key,value)=>storage.set(key,value),GM_registerMenuCommand:()=>1,GM_unregisterMenuCommand(){}};
  vm.createContext(context);vm.runInContext(source,context);return context;
}
test('matching preserves literal punctuation, suffixes, and phrase behavior',()=>{
  const api=load();
  assert.equal(api.regexMatchAny('C++',['c++']),'c++');
  assert.equal(api.regexMatchAny('dogmatic',['dog']),null);
  assert.equal(api.regexMatchAny('dogs',['dog']),'dog');
  assert.equal(api.regexMatchAny('cities',['city']),null);
  assert.equal(api.regexMatchAny('cater',['cat']),'cat');
  assert.equal(api.regexMatchAny('a new yorker',['new york']),'new york');
});
test('compiled matching rules are reused',()=>{
  const api=load();assert.equal(api.termToRegex('dog'),api.termToRegex('dog'));
});
test('post links use canonical own-post identity and reject other origins',()=>{
  const api=load();assert.equal(typeof api.parsePostURL,'function');
  assert.equal(api.parsePostURL('/profile/alice.bsky.social/post/abc?x=1').url,'https://bsky.app/profile/alice.bsky.social/post/abc');
  assert.equal(api.parsePostURL('https://example.com/profile/alice/post/abc'),null);
  assert.equal(api.parsePostURL('javascript:alert(1)'),null);
  assert.equal(api.parsePostURL('/profile/alice/post/abc/extra'),null);
});
test('settings validate types and normalize without interpreting markup',()=>{
  const api=load();assert.equal(typeof api.validateSettings,'function');
  const actual=api.validateSettings({filteredTerms:[' DOG ','dog','<b>'],manualWhitelistTerms:[' @Alice.Bsky.Social '],autoWhitelistEnabled:false,altTextEnforcementEnabled:true});
  assert.deepEqual(Array.from(actual.filteredTerms),['dog','<b>']);
  assert.deepEqual(Array.from(actual.manualWhitelistTerms),['@alice.bsky.social']);
  assert.throws(()=>api.validateSettings({filteredTerms:{},manualWhitelistTerms:[],autoWhitelistEnabled:false,altTextEnforcementEnabled:false}));
  assert.throws(()=>api.validateSettings({filteredTerms:[],manualWhitelistTerms:[],autoWhitelistEnabled:'false',altTextEnforcementEnabled:false}));
});
test('active account uses explicit currentAccount rather than the first saved account',()=>{
  const api=load();assert.equal(typeof api.getActiveAccount,'function');
  assert.equal(api.getActiveAccount({session:{accounts:[{did:'did:plc:first'}],currentAccount:{did:'did:plc:second'}}}),'did:plc:second');
  assert.equal(api.getActiveAccount({session:{accounts:[{did:'did:plc:first'}]}}),'');
});
test('a malformed snapshot field does not reset valid sibling fields',()=>{
  const api=load({bcmSettingsV1:JSON.stringify({version:1,settings:{filteredTerms:['keep-me'],manualWhitelistTerms:{},altTextEnforcementEnabled:true,autoWhitelistEnabled:false}})});
  const loaded=api.readSettings().value;assert.deepEqual(Array.from(loaded.filteredTerms),['keep-me']);assert.equal(loaded.altTextEnforcementEnabled,true);
});
test('a transient storage read failure retains the last valid settings',()=>{
  const api=load({bcmSettingsV1:JSON.stringify({version:1,settings:{filteredTerms:['keep-me'],manualWhitelistTerms:[],altTextEnforcementEnabled:true,autoWhitelistEnabled:false}})});
  api.initializeSettings();api.GM_getValue=()=>{throw Error('Temporary read failure')};
  assert.deepEqual(Array.from(api.readSettings().value.filteredTerms),['keep-me']);
});
test('a settings change invalidates in-flight fingerprint work before the new context hash is ready',async()=>{
  let source=fs.readFileSync(require('node:path').join(__dirname,'../bluesky-content-manager.user.js'),'utf8');
  const api=load(),deferred=[];api.crypto={subtle:{digest:()=>new Promise(resolve=>deferred.push(resolve))}};
  source=source.replace(/\nmain\(\);\s*\n/,`\nwindow.race=async()=>{
    const post={isConnected:true,classList:{toggle(){},remove(){}}};getPostContainer=()=>post;
    getPostData=()=>({identity:{url:'https://bsky.app/profile/alice/post/abc'},author:'@alice',text:'newword',general:'newword',names:'Alice',labels:'',images:[]});rescanPosts=()=>{};
    installSettings({filteredTerms:['oldword'],manualWhitelistTerms:[],autoWhitelistEnabled:false,altTextEnforcementEnabled:false});decisionContext='old-context';
    const pending=processPost(post);await Promise.resolve();installSettings({filteredTerms:['newword'],manualWhitelistTerms:[],autoWhitelistEnabled:false,altTextEnforcementEnabled:false});
    const rebuilding=rebuildContext();return {pending,rebuilding,cache:()=>blockedCache.size};
  };\n`);
  vm.runInContext(source,api);const work=await api.window.race();assert.equal(deferred.length,2);
  deferred[0](new Uint8Array(32).buffer);await work.pending;assert.equal(work.cache(),0,'Old context cached a new-settings decision');deferred[1](new Uint8Array(32).buffer);await work.rebuilding;
});

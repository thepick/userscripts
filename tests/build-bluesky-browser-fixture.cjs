const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../bluesky-content-manager.user.js'),'utf8');
const tests = fs.readFileSync(path.join(__dirname,'bluesky-content-manager.browser.js'),'utf8');
const expose = `
window.bcm = {processPost,observePosts,createConfigUI,showConfigUI,refreshEnvironment,flushPosts,flushDecisionCache,getPostData,getPostIdentity,regexMatchAny,autoWhitelistFollowedAccounts,
stats(){return {blocks:blockedPosts.size,cache:blockedCache.size,pending:pendingPosts.size,patterns:patterns.size,issues:[...issues.values()],followReady,followState,settings,context:decisionContext}},
async reset(values={},keepStorage=false){
 if(configDialog){const old=configDialog;await new Promise(resolve=>{old.addEventListener('close',resolve,{once:true});old.close()});}
 window.testObserver?.disconnect();clearTimeout(queueTimer);clearTimeout(cacheTimer);clearTimeout(menuTimer);queueTimer=cacheTimer=menuTimer=null;
 document.getElementById('posts').replaceChildren();blockedPosts.clear();blockedCache.clear();pendingCache.clear();pendingPosts.clear();processedPosts=new WeakMap();postRuns=new WeakMap();issues.clear();
 currentUserDid='';followAccount=null;followEnabled=null;followEpoch++;followReady=true;followState='disabled';followsUpdatedAt=followsStartedAt=0;lastSiteStorage=null;siteState={};lastPath='';settingsRaw=null;settingsLoaded=false;
 settings={filteredTerms:[],manualWhitelistTerms:[],autoWhitelistEnabled:false,altTextEnforcementEnabled:false,ai:validateAI()};
 resetAI();
 if(!keepStorage)window.testValues=new Map(Object.entries({filteredTerms:JSON.stringify(['forbidden']),...values}));
 initializeSettings();loadDecisionCache();await refreshEnvironment(true);window.decisions=0;
},start:main};
`;
const instrumented = source.replace(/^\s*main\(\);\s*$/m,expose).replace(/function decidePost\(post,\s*data\)\s*\{/, '$& window.decisions++;');
const mocks = `
window.testValues=new Map();window.testWrites=[];window.testRequests=[];window.testSite={colorMode:'light',session:{accounts:[]}};window.networkMode='success';window.testFollowPages=[];window.testFailKey='';window.testRemoteListeners=[];
Object.defineProperty(window,'localStorage',{value:{getItem:()=>JSON.stringify(window.testSite)}});
window.GM_getValue=(key,fallback)=>testValues.has(key)?testValues.get(key):fallback;
window.GM_setValue=(key,value)=>{if(key===testFailKey)throw Error('Simulated storage failure');testWrites.push(key);testValues.set(key,value)};
window.GM_addStyle=css=>{const style=document.createElement('style');style.textContent=css;document.head.append(style)};
window.GM_registerMenuCommand=(label,callback)=>{window.testMenu=callback;return 1};window.GM_unregisterMenuCommand=()=>{};
window.GM_addValueChangeListener=(key,callback)=>testRemoteListeners.push(callback);
window.confirm=()=>true;
window.GM_xmlhttpRequest=options=>{testRequests.push(options);if(networkMode==='hold')return;queueMicrotask(()=>{if(networkMode==='error')options.onerror();else options.onload({status:200,responseText:JSON.stringify(testFollowPages.shift()||{follows:[]})})})};
const actualURLCreate=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.testExportBlob=blob;return actualURLCreate(blob)};
const actualAnchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!this.download)actualAnchorClick.call(this)};
`;
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; connect-src \'self\'; img-src data:"><title>Bluesky Content Manager regression tests</title><style>body{font:16px system-ui,sans-serif;background:#eaf0f5;color:#172b3a;margin:24px}#posts article{border:1px solid #9eb3c5;padding:14px;margin:12px;max-width:600px}#results{white-space:pre-wrap}button{padding:10px}</style></head><body><h1>Content Manager regression checks</h1><p>Isolated fixture with dummy posts and local settings. No Bluesky credentials or external requests.</p><button id="open">Open settings preview</button><div id="results">Running…</div><main id="posts"></main><script>'+mocks+instrumented+tests+'</script></body></html>';
const destination=process.argv[2];
if(!destination)throw Error('Provide an output HTML path, for example: node tests/build-bluesky-browser-fixture.cjs browser-fixture.html');
fs.writeFileSync(destination,html);console.log(destination);

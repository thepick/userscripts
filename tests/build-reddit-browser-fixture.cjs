const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../reddit-advanced-content-filter.user.js'),'utf8');
const cases=fs.readFileSync(path.join(__dirname,'reddit-advanced-content-filter.browser.js'),'utf8');
const exposed=`
    const fixtureStyle=document.createElement('style');fixtureStyle.textContent=CSS;document.head.append(fixtureStyle);
    window.raf={processPost,queuePost,collectPosts,observePosts,showConfig,readConfiguration,refreshConfiguration,flushMemory,clearMemory,getPostIdentity,getPostLink,getPostText,setRules,start:main,
    stats(){return {blocks:blockedPosts.size,memory:remembered.size,pending:pendingMemory.size,issues:[...issues.values()],blocklist:blocklistArr,whitelist:whitelistArr,revision:settingsRevision,epoch:ruleEpoch}},
    async reset(values={},keep=false){
      if(dialogElement){const old=dialogElement;await new Promise(resolve=>{old.addEventListener('close',resolve,{once:true});old.close()});}
      window.testObserver?.disconnect();pendingPosts.clear();while(processing)await new Promise(resolve=>setTimeout(resolve,5));
      memoryGeneration++;clearTimeout(memoryTimer);clearTimeout(counterTimer);memoryTimer=counterTimer=null;await memoryWrites;
      document.getElementById('posts').replaceChildren();blockedPosts.clear();remembered.clear();pendingMemory.clear();issues.clear();postStates=new WeakMap();postChanges=new WeakMap();settingsRevision='';
      if(!keep)window.testValues=new Map(Object.entries({blocklist:['forbidden'],whitelist:[],...values}));
      blocklistArr=[];whitelistArr=[];await refreshConfiguration();await loadMemory();window.decisions=window.compilations=0;
    }};
`;
const instrumented=source.replace('\n    main();',exposed).replace('function filterDecision(title, content, subreddit) {','function filterDecision(title, content, subreddit) { window.decisions++;').replace('function compileRules(entries) {','function compileRules(entries) { window.compilations++;').replaceAll('new URL(value, location.href)',"new URL(value, 'https://www.reddit.com/')");
const mocks=`
window.testValues=new Map();window.testWrites=[];window.failRead='';window.failWrite='';window.holdRead='';window.holdWrite='';window.heldReads=[];window.heldWrites=[];window.remoteListeners=[];
window.GM={async getValue(key,fallback){if(key===failRead)throw Error('Simulated read failure');const value=structuredClone(testValues.has(key)?testValues.get(key):fallback);if(key===holdRead)await new Promise(resolve=>heldReads.push(resolve));return value},async setValue(key,value){if(key===failWrite)throw Error('Simulated write failure');if(key===holdWrite)await new Promise(resolve=>heldWrites.push(resolve));testWrites.push({key,value:structuredClone(value)});testValues.set(key,structuredClone(value))},async addValueChangeListener(key,callback){remoteListeners.push(callback)}};
window.GM_registerMenuCommand=(name,callback)=>{window.testMenu=callback;return 1};window.GM_unregisterMenuCommand=()=>{};
const createBlobURL=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.exportedBlob=blob;return createBlobURL(blob)};
const clickAnchor=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!this.download)clickAnchor.call(this)};
`;
if(!process.argv[2])throw Error('Provide an output HTML path.');
fs.writeFileSync(process.argv[2],'<!doctype html><html lang="en" class="theme-light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\';script-src \'unsafe-inline\';style-src \'unsafe-inline\';connect-src \'self\';img-src data:"><title>Reddit Filter regression checks</title><style>body{font:16px system-ui,sans-serif;background:#eef3f7;color:#172b3a;padding:20px}article,.thing{border:1px solid #9aafbe;padding:12px;margin:12px;max-width:650px}button{padding:10px}#results{white-space:pre-wrap}shreddit-post{display:block}</style></head><body><h1>Reddit Filter regression checks</h1><p>Isolated old/modern Reddit fixtures with dummy lists and stubbed userscript storage.</p><button id="open">Open settings preview</button><button id="dark">Open dark preview</button><button id="recovery">Open recovery preview</button><main id="posts"></main><pre id="results">Running…</pre><script>'+mocks+instrumented+cases+'</script></body></html>');
console.log(process.argv[2]);

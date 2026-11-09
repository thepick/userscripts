const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
function load(){
 const original=fs.readFileSync(path.join(__dirname,'../bluesky-content-manager.user.js'),'utf8'),values=new Map(),events=new Map();
 const expose=String.raw`Object.assign(globalThis,{regexMatchAny,termToRegex,getPostData,aiText,aiImages,aiImageURL,aiScope,aiValid,renderAI,resetAI,scheduleAI,drainAI,isAIVisible,watchAIPost,reserveAI,AI_PACING,readAIUsage,
 settingsValue:()=>settings,enableAltRule(){altTextEnforcementEnabled=true;},decidePost,
 keys:async function(data){settings.ai={...aiDefaults,enabled:true,scope:'all',topics:['Politics']};aiKey='dummy';currentUserDid='did:plc:test';aiText=()=> 'same bounded excerpt with enough text';aiImages=()=>[];aiScope=()=>true;aiAllowed=()=>false;aiEnvironment=()=> 'feed';aiValid=()=>true;watchAIPost=()=>{};isAIVisible=()=>false;keptAI=async()=>false;const inputs=[];digest=async value=>{inputs.push(value);return 'a'.repeat(64)};await scheduleAI({},data,decisionContext);return inputs;},
 rendering(){settings.ai={...aiDefaults,enabled:true,mode:'preview'};aiValid=()=>valid;getPostData=()=>({});recordBlockedPost=()=>{};scheduleMenu=()=>{};scheduleAILoadGuard=()=>{};updateAIStatus=()=>{};element=(tag,cls,text)=>makeElement(tag,text);enqueuePost=()=>{enqueued++};},
 validity(post,data,text){currentUserDid='did:plc:test';getActiveAccount=()=>currentUserDid;readSiteState=()=>({});aiEnvironment=()=> 'feed';aiScope=()=>true;getPostData=()=>data;aiText=()=>currentText;aiImages=()=>[];return {post,text,images:[],snapshot:JSON.stringify(data),generation:aiGeneration,context:decisionContext,environment:'feed'};},
 async startObservers(){initializeSettings=()=>{};loadDecisionCache=()=>{};loadAI=()=>{};observePosts=()=>{};refreshEnvironment=async()=>{};updateMenuCommand=()=>{};rescanPosts=()=>{for(const post of testPosts)watchAIPost(post)};await main();},
 setScope(value){settings.ai={...aiDefaults,scope:value};},queued:()=>[...aiJobs.values()].map(j=>j.post.id),
 async queueProbe(post){settings.ai={...aiDefaults,enabled:true,topics:['Politics']};aiBusy=true;aiKey='dummy';aiText=()=> 'An election headline long enough for checking';aiImages=()=>[];aiScope=()=>true;aiAllowed=()=>false;aiEnvironment=()=> 'feed';aiValid=()=>true;await scheduleAI(post,{identity:{url:'https://bsky.app/profile/test/post/abc'}},decisionContext);}
 });`;
 const c={console,URL,TextEncoder,crypto:webcrypto,performance,Date,innerHeight:1000,innerWidth:1200,NodeFilter:{SHOW_TEXT:4},setTimeout:()=>1,clearTimeout(){},setInterval(){},cancelAnimationFrame(){},GM_addStyle(){},GM_getValue:(k,d)=>values.has(k)?values.get(k):d,GM_setValue:(k,v)=>values.set(k,v),navigator:{locks:{request:async(_n,fn)=>fn()}},window:{addEventListener:(type,fn)=>events.set(type,fn)},document:{body:{},querySelector:()=>null,addEventListener(){},createTreeWalker:()=>({nextNode:()=>null})},location:{origin:'https://bsky.app',pathname:'/',search:''},sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null}};
 vm.createContext(c);vm.runInContext(original.replace(/\n\s*main\(\);\s*\n/,'\n'+expose+'\n'),c);return {c,values,events,original};
}
function node(tag='IMG',attrs={},extra={}){return {nodeType:1,tagName:tag,classList:{contains:()=>false},alt:attrs.alt||'',naturalWidth:640,naturalHeight:480,width:0,height:0,currentSrc:'',getAttribute:k=>attrs[k]??null,closest:()=>null,matches:()=>false,querySelector:()=>null,...extra};}
function post(nodes=[],text='A neutral article'){return {isConnected:true,cloneNode:()=>({textContent:text,querySelectorAll:()=>[]}),querySelectorAll(selector){if(selector==='img')return nodes.filter(n=>n.tagName==='IMG');if(selector==='video[poster]')return nodes.filter(n=>n.tagName==='VIDEO');return nodes;},querySelector:()=>null,matches:()=>false,getAttribute:()=>null};}
const imageURL='https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:test/photo@jpeg';
function card(top,id='card'){return {id,isConnected:true,getBoundingClientRect:()=>({top,bottom:top+200,left:0,right:300}),getClientRects:()=>[{}],closest:()=>null};}
test('AI edition shares Reddit word boundaries, regular plurals, punctuation and Unicode folding',()=>{
 const {c}=load();for(const [text,term,want]of [['ＴＲＵＭＰ','trump','trump'],['tr\u200bump','trump','trump'],['cities','city','city'],['cater','cat',null],['ward','war',null],['C++','c++','c++'],['school–shooting','school shooting','school shooting'],['school_shooting','school shooting','school shooting']])assert.equal(c.regexMatchAny(text,[term]),want,text);
});
test('article paths and preview titles become evidence without URL query or fragment data',()=>{
 const {c}=load(),link=node('A',{href:'https://example.org/politics/school-shooting?secret=token#private',title:'Election report'},{matches:s=>s==='a'});
 const p=post([link]);const text=c.aiText(p);assert.match(text,/politics/);assert.match(text,/school shooting/);assert.match(text,/Election report/);assert(!text.includes('token'));assert(!text.includes('private'));
 const data=c.getPostData(p);assert.match(data.labels,/school shooting/);
});
test('avatar and control metadata cannot become keyword evidence',()=>{
 const {c}=load(),avatar=node('IMG',{alt:'forbidden',src:'https://cdn.bsky.app/img/avatar/plain/test/avatar@jpeg'},{closest:()=>({})}),button=node('A',{title:'forbidden',href:'https://example.org/forbidden'},{closest:()=>({})});
 const data=c.getPostData(post([avatar,button]));assert(!data.images.some(i=>i.text.includes('forbidden')));assert(!data.labels.includes('forbidden'));
});
test('small article thumbnails and the largest permitted srcset are scanned once',()=>{
 const {c}=load(),small=node('IMG',{src:imageURL},{naturalWidth:140,naturalHeight:73});assert.equal(c.aiImages(post([small]),true).length,1);
 const fallback=node('IMG',{srcset:imageURL+' 200w, '+imageURL.replace('photo','large')+' 1200w'});assert.deepEqual(Array.from(c.aiImages(post([fallback]),true)),[imageURL.replace('photo','large')]);
 assert.equal(c.aiImages(post([fallback]),true,true).length,0);
});
test('missing-alt enforcement retains its own size threshold independently of AI eligibility',()=>{
 const {c}=load();c.enableAltRule();const image=node('IMG',{}, {naturalWidth:50,naturalHeight:200}),p=post([image]);
 const data=c.getPostData(p);assert.equal(data.images[0]?.required,true);assert.equal(c.decidePost(p,data)?.reason,'Alt-text enforcement');assert.equal(c.aiImages(p,true).length,0);
});
test('permitted video posters share the four-picture cap and excluded hosts stay excluded',()=>{
 const {c}=load(),poster=node('VIDEO',{poster:imageURL});assert.deepEqual(Array.from(c.aiImages(post([poster]),true)),[imageURL]);
 const images=Array.from({length:4},(_,i)=>node('IMG',{src:imageURL.replace('photo','image'+i)}));assert.equal(c.aiImages(post([...images,poster]),true).length,4);
 assert.equal(c.aiImageURL('https://evil.example/image.jpg'),'');assert.equal(c.aiImageURL(imageURL+'?secret=token'),'');
});
test('long post evidence retains its head and tail while legacy Keep text stays byte-compatible',()=>{
 const {c}=load(),p=post([],'H'.repeat(10000)+'M'.repeat(8000)+'TAIL-ELECTION');const text=c.aiText(p);
 assert(text.startsWith('H'.repeat(10000)));assert(text.endsWith('TAIL-ELECTION'));assert.equal(text.length,13000);assert.equal(c.aiText(p,true),'H'.repeat(10000));
});
test('full relevant content changes automatic and new Keep keys even outside the bounded excerpt',async()=>{
 const data={identity:{url:'https://bsky.app/profile/test/post/abc'},general:'first'};const a=await load().c.keys(data),b=await load().c.keys({...data,general:'changed'});
 assert.notEqual(a[0],b[0]);assert.notEqual(a[1],b[1]);assert.equal(a[2],b[2]);
});
test('async validity rejects changed AI evidence before provider submission',()=>{
 const {c}=load(),p=post(),data={};c.currentText='before';const job=c.validity(p,data,'before');assert.equal(c.aiValid(job),true);c.currentText='after';assert.equal(c.aiValid(job),false);
});
test('loaded offscreen posts queue before entering view and remain bounded',async()=>{
 const {c}=load(),p=card(1400,'ahead');assert.equal(c.isAIVisible(p),false);await c.queueProbe(p);assert.deepEqual(Array.from(c.queued()),['ahead']);assert.equal(c.isAIVisible(card(3000),2),false);assert.equal(c.isAIVisible(card(2999),2),true);
});
test('News scope, account routing and nonpublic-page exclusions remain platform-specific',()=>{
 const {c}=load();c.setScope('news');assert.equal(c.aiScope(),false);c.sessionStorage.getItem=()=> 'feedgen|at://did:plc:kkf4naxqmweop7dv4l2iqqf5/app.bsky.feed.generator/verified-news';assert.equal(c.aiScope(),true);
 for(const route of ['/messages','/settings','/search','/profile/test/post/abc']){c.location.pathname=route;assert.equal(c.aiScope(),false,route);}
 c.setScope('all');c.location.pathname='/profile/test';assert.equal(c.aiScope(),true);
});
test('a Keep stored by the previous image/text extraction still prevents an AI request',async()=>{
 const {c,values}=load();const legacy=require('node:crypto').createHash('sha256').update(JSON.stringify(['','https://bsky.app/profile/test/post/abc','An election headline long enough for checking'])).digest('hex');
 values.set('bcmaiKeepsV1',JSON.stringify([legacy]));await c.queueProbe(card(1400));assert.equal(c.queued().length,0);
});
test('Bluesky retains its single-origin budget rather than Reddit split accounting',async()=>{
 const {c,values}=load(),limits={budget:.01,requestLimit:2};await c.reserveAI(limits);values.delete(c.AI_PACING);await c.reserveAI(limits);values.delete(c.AI_PACING);await assert.rejects(c.reserveAI(limits),/Daily AI limit/);assert.equal(c.readAIUsage().requests,2);
});
test('preview Hide survives a rescan and stale preview actions cannot hide changed posts',()=>{
 const {c}=load();c.valid=true;c.enqueued=0;c.makeElement=(tag,text)=>({tag,text,dataset:{},children:[],setAttribute(){},append(...v){this.children.push(...v)},addEventListener(type,fn){this[type]=fn},remove(){this.isConnected=false}});
 c.rendering();const p=card(0),classes=new Set();p.classList={contains:v=>classes.has(v),add:v=>classes.add(v),remove:v=>classes.delete(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)};p.prepend=panel=>{panel.isConnected=true;p.panel=panel};
 const job={post:p,key:'key',keepKey:'keep',url:'url',topics:['Politics']},result={decision:'hide',evidence:'match'};c.renderAI(job,result);p.panel.children[1].click({preventDefault(){},stopPropagation(){}});c.resetAI();c.renderAI(job,result);assert(classes.has('bcm-ai-hidden'));
 c.resetAI();c.valid=true;c.renderAI({...job,key:'newkey',keepKey:'newkeep'},result);c.valid=false;p.panel.children[1].click({preventDefault(){},stopPropagation(){}});assert(!classes.has('bcm-ai-hidden'));assert.equal(c.enqueued,1);
});


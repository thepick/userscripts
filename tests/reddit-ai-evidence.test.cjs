const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
function load(){
 const source=fs.readFileSync(path.join(__dirname,'../reddit-advanced-content-filter-ai.user.js'),'utf8');
 const expose=`Object.assign(globalThis,{compileRules,matchBlock,getPostText,aiText,aiImages,aiImageURL,aiScope,safePostURL,setRules,ruleContextValue:()=>ruleContext,legacyKeepText:post=>aiText(post,true),
 async keyProbe(content){settings.ai={...aiDefaults,enabled:true,topics:['Sports']};aiKey='dummy';aiEligible=()=>true;aiAllowed=()=>false;aiText=()=> 'same excerpt with enough evidence';aiAccount=()=> 'alice';aiEnvironment=()=> 'feed';aiValid=()=>true;isAIVisible=()=>false;watchAIPost=()=>{};keptAI=async()=>false;const inputs=[];fingerprint=async input=>{inputs.push(input);return 'a'.repeat(64)};await scheduleAI({}, {title:'Title',content,subreddit:'news',identity:{id:'abc'},url:'https://www.reddit.com/comments/abc/'},ruleEpoch);return inputs;}});`;
 assert(source.includes('\n    main();'));
 const c={console,URL,TextEncoder,crypto:webcrypto,performance,Date,setTimeout:()=>1,clearTimeout(){},window:{},location:{href:'https://www.reddit.com/',hostname:'www.reddit.com',pathname:'/',protocol:'https:'},document:{querySelector:()=>null},GM_getValue:(_k,d)=>d,GM_setValue(){},navigator:{locks:{request:async(_n,fn)=>fn()}}};
 vm.createContext(c);vm.runInContext(source.replace('\n    main();',expose),c);return c;
}
function node(tagName,attributes={},extra={}){return {nodeType:1,tagName,className:'',childNodes:[],naturalWidth:640,naturalHeight:480,alt:attributes.alt||'',textContent:'',currentSrc:'',getAttribute:key=>attributes[key]??null,matches:()=>false,closest:()=>null,...extra};}
function post(nodes=[],text=''){return node('ARTICLE',{}, {matches:selector=>selector.startsWith('shreddit-post,'),querySelectorAll:selector=>selector==='img'?nodes.filter(n=>n.tagName==='IMG'):selector==='video[poster]'?nodes.filter(n=>n.tagName==='VIDEO'):nodes,querySelector:()=>null,childNodes:[{nodeType:3,data:text}]});}
test('compatibility folding catches fullwidth and invisible splits in both rules and text',()=>{
 const c=load(),match=(text,entry)=>c.matchBlock(text,c.compileRules([entry]));
 for(const text of ['ＴＲＵＭＰ','tr\u200bump','tr\u00adump'])assert.equal(match(text,'trump'),'trump');
 assert.equal(match('trump','Ｔｒｕｍｐ'),'trump');assert.equal(match('anything','\u200b'),null);assert.equal(match('any text','\u200b \u200b'),null);
 assert.equal(match('Тrump','trump'),null);
});
test('phrases accept whitespace and dash variants while keeping original substring matching',()=>{
 const c=load();for(const text of ['school-shooting','school    shooting','school\nshooting','school–shooting','school_shooting'])assert.equal(c.matchBlock(text,c.compileRules(['school shooting'])),'school shooting');
 assert.equal(c.matchBlock('new yorkshire',c.compileRules(['new york'])),'new york');
 assert.equal(c.matchBlock('schoolshooting',c.compileRules(['school shooting'])),null);
});
test('word forms and punctuation retain existing boundaries without new suffix matches',()=>{
 const c=load(),match=(text,entry)=>c.matchBlock(text,c.compileRules([entry]));
 for(const [entry,text]of [['car','card'],['war','ward'],['cat','cation'],['cat','cater']])assert.equal(match(text,entry),null);
 assert.equal(match('cities','city'),'cities');assert.equal(match('C++','c++'),'c++');
});
test('literal evidence includes relevant image alt and article title/path but excludes URL secrets',()=>{
 const c=load(),image=node('IMG',{alt:'School shooting'}),article=node('A',{title:'Article preview',href:'https://example.com/politics/school-shooting?token=secret#private'},{matches:()=>true});
 const text=c.getPostText(post([image,article],'A headline'));
 assert.match(text,/school shooting/);assert.match(text,/article preview/);assert.match(text,/politics/);assert(!text.includes('secret'));assert(!text.includes('private'));
 assert.equal(c.safePostURL('https://example.com/comments/abc/'),'');
});
test('interface and avatar attributes cannot block or whitelist a post',()=>{
 const c=load(),excluded=node('IMG',{alt:'forbidden'},{closest:()=>({})});assert(!c.getPostText(post([excluded],'Allowed story')).includes('forbidden'));
});
test('navigation-only title attributes cannot become whitelist or block evidence',()=>{
 const c=load(),navigation=node('A',{title:'Sports','data-click-id':'subreddit',href:'/r/news/'});
 assert(!c.getPostText(post([navigation],'A forbidden story')).includes('sports'));
});
test('external metadata article slug is evidence while Reddit identity remains separate',()=>{
 const c=load(),p=post();p.getAttribute=name=>name==='content-href'?'https://example.com/school-shooting':null;
 assert.match(c.getPostText(p),/school shooting/);assert.equal(c.safePostURL('https://example.com/school-shooting'),'');
});
test('article slug decoding does not fetch links or accept credentials and unsafe schemes',()=>{
 const c=load();assert.match(c.getPostText(post([node('A',{href:'https://example.com/school%20shooting'})])),/school shooting/);
 for(const href of ['javascript:forbidden','https://user:password@example.com/forbidden'])assert(!c.getPostText(post([node('A',{href})])).includes('forbidden'));
});
test('one selected image URL takes precedence over alternate sizes',()=>{
 const c=load(),image=node('IMG',{src:'https://i.redd.it/small.jpg',srcset:'https://i.redd.it/large.jpg 1200w'},{currentSrc:'https://i.redd.it/current.jpg'});
 assert.deepEqual(Array.from(c.aiImages(post([image]),true)),['https://i.redd.it/current.jpg']);
});
test('srcset fallback selects largest permitted size regardless of order',()=>{
 const c=load(),image=node('IMG',{srcset:'https://i.redd.it/large.jpg 1200w, https://i.redd.it/small.jpg 200w'});
 assert.deepEqual(Array.from(c.aiImages(post([image]),true)),['https://i.redd.it/large.jpg']);
 const density=node('IMG',{srcset:'https://i.redd.it/one.jpg 1x, https://i.redd.it/one-half.jpg 1.5x'});
 assert.deepEqual(Array.from(c.aiImages(post([density]),true)),['https://i.redd.it/one-half.jpg']);
});
test('posters share the strict four-image cap and host allowlist',()=>{
 const c=load(),nodes=Array.from({length:3},(_,i)=>node('IMG',{src:`https://i.redd.it/photo${i}.jpg`}));
 nodes.push(...Array.from({length:5},(_,i)=>node('VIDEO',{poster:`https://i.redd.it/poster${i}.jpg`})));
 const images=Array.from(c.aiImages(post(nodes),true));assert.equal(images.length,4);assert.equal(images[3],'https://i.redd.it/poster0.jpg');
 assert.deepEqual(Array.from(c.aiImages(post([node('VIDEO',{poster:'https://evil.test/photo.jpg'})]),true)),[]);
 assert.deepEqual(Array.from(c.aiImages(post(nodes),false)),[]);
});
test('previous image extraction remains available only for recognizing existing Keep choices',()=>{
 const c=load(),p=post([node('IMG',{srcset:'https://i.redd.it/new.jpg 1200w'}),node('VIDEO',{poster:'https://i.redd.it/poster.jpg'})]);
 assert.equal(c.aiImages(p,true).length,2);assert.deepEqual(Array.from(c.aiImages(p,true,true)),[]);
});
test('bounded AI text preserves the original head and adds long-post tail evidence',()=>{
 const c=load(),bodyText='x'.repeat(16000)+' TAIL EVIDENCE';
 const p=post([],bodyText);p.getAttribute=name=>name==='post-title'?'Headline':null;
 p.querySelectorAll=selector=>selector.includes('[slot="text-body"]')?[{parentElement:null,cloneNode:()=>({textContent:bodyText,querySelectorAll:()=>[]})}]:[];
 const text=c.aiText(p);assert(text.length<=13000);assert(text.includes('TAIL EVIDENCE'));assert(text.startsWith('Headline'));
 assert(text.includes('x'.repeat(9900)));
 assert.equal(c.legacyKeepText(p).length,10000);assert(!c.legacyKeepText(p).includes('TAIL EVIDENCE'));
});
test('unchanged photo Keep text remains byte-compatible with the previous release',()=>{
 const c=load(),img=node('IMG',{alt:'A cat sitting in a tree'}),p=post();p.tagName='SHREDDIT-POST';
 p.getAttribute=name=>name==='post-title'?'Autumn photo':name==='subreddit-prefixed-name'?'r/pics':null;
 p.querySelectorAll=selector=>selector.includes('img')?[img]:[];
 assert.equal(c.legacyKeepText(p),'Autumn photo\nSubreddit: r/pics\nA cat sitting in a tree');
});
test('full relevant content affects automatic and new Keep keys; old Keep lookup stays compatible',async()=>{
 const before=await load().keyProbe('unseen middle A'),after=await load().keyProbe('unseen middle B');
 assert.notEqual(before[0],after[0]);assert.notEqual(before[1],after[1]);assert.equal(before[2],after[2]);
});
test('matcher update invalidates old persistent literal decisions without altering lists',async()=>{
 const c=load(),old=createHash('sha256').update(JSON.stringify([1,['cat'],['dog']])).digest('hex');await c.setRules(['cat'],['dog']);assert.notEqual(c.ruleContextValue(),old);
});
test('feed-only AI scope and strict Reddit identity links remain intact',()=>{
 const c=load();for(const route of ['/search','/user/example','/r/news/comments/abc','/message/inbox']){c.location.pathname=route;assert.equal(c.aiScope(),false);}
 for(const route of ['/r/media','/r/chat','/r/news/top/']){c.location.pathname=route;assert.equal(c.aiScope(),true);}
 assert.equal(c.safePostURL('https://evil.test/comments/abc/'),'');
});

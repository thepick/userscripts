const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');

function card(top,id='post',extra={}){
  return {id,isConnected:true,getBoundingClientRect:()=>({top,bottom:top+200,left:0,right:300}),getClientRects:()=>[{}],closest:()=>null,...extra};
}
function load(){
  const source=fs.readFileSync(path.join(__dirname,'../reddit-advanced-content-filter-ai.user.js'),'utf8');
  const requests=[],observers=[],events=new Map();
  const c={console,URL,TextEncoder,crypto:webcrypto,performance,Date,ArrayBuffer,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),innerHeight:1000,innerWidth:1200,
    setTimeout:()=>1,clearTimeout(){},setInterval(){},location:{hostname:'www.reddit.com',pathname:'/',protocol:'https:'},
    document:{hidden:false,addEventListener(){},querySelector:()=>null},window:{addEventListener:(type,fn)=>events.set(type,fn)},
    GM:{},GM_getValue:(_key,fallback)=>fallback,GM_setValue(){},navigator:{locks:{request:async(_name,fn)=>fn()}},
    IntersectionObserver:class {constructor(callback,options){this.callback=callback;this.options=options;this.posts=[];observers.push(this);}observe(post){this.posts.push(post);}disconnect(){this.disconnected=true;}unobserve(){}},
    GM_xmlhttpRequest(options){
      if(options.method==='GET'){options.onload({status:200,finalUrl:options.url,responseHeaders:'Content-Type: image/jpeg',response:new Uint8Array([255,216,255,217]).buffer});return;}
      const payload=JSON.parse(options.data);requests.push(payload);
      if(payload.model==='google/gemini-2.5-flash-lite'){
        options.onload({status:200,responseText:JSON.stringify({model:payload.model,choices:[{finish_reason:'stop',message:{content:JSON.stringify({observations:[{image_index:0,description:'A public election campaign event',visible_text:'Election',public_figures:[],uncertain:false}]})}}],usage:{cost:0}})});return;
      }
      const answers=Object.fromEntries(payload.state.posts.map((_,i)=>['post_'+i,{type:'choice',choice:'keep',probabilities:{hide:0,keep:1,uncertain:0}}]));options.onload({status:200,responseText:JSON.stringify({model:'liquid/d1-ultra-20261015',answers,usage:{cost:0}})});
    }
  };
  const expose=`Object.assign(globalThis,{isAIVisible,watchAIPost,startAI,scheduleAI,drainAI,
    setup(){settings.ai={...aiDefaults,enabled:true,analyzeImages:true,topics:['US politics']};aiKey='dummy';dialogElement=null;aiBusy=true;
      aiEligible=()=>true;aiAllowed=()=>false;aiText=post=>'An election headline for '+post.id;aiImages=post=>post.image?['https://external-preview.redd.it/preview.jpg?width=140&height=73&auto=webp&s=test']:[];
      aiAccount=()=> 'test';aiEnvironment=()=> 'feed';aiValid=job=>job.post.isConnected;keptAI=async()=>false;
      readAIUsage=()=>({cost:0});reserveAI=async()=> '2026-11-05';settleAI=async()=>{};settleAIPacing=async()=>{};
      cacheAI=async()=>{};renderAI=()=>{};clearIssue=()=>{};clearAIPanel=()=>{};updateAIStatus=()=>{};},
    queued:()=>[...aiJobs.values()].map(job=>job.post.id),
    resume(){aiBusy=false;return drainAI();},
    setPaused(hidden,open){document.hidden=hidden;dialogElement={open};},
    reobserve(){collectPosts=()=>{for(const post of testPosts)watchAIPost(post);};startAI();},
    watchCount:()=>aiWatched.size});`;
  vm.createContext(c);vm.runInContext(source.replace('\n    main();',expose),c);c.setup();
  return {c,requests,observers,events};
}
async function queue(c,post){await c.scheduleAI(post,{title:'Election '+post.id,content:'Political news',subreddit:'news',identity:{id:post.id},url:'https://www.reddit.com/comments/'+post.id+'/'},1);}

test('loaded cards below the screen are queued before entering view',async()=>{
  const {c}=load(),post=card(1400,'ahead');
  assert.equal(c.isAIVisible(post),false);
  await queue(c,post);assert.deepEqual(Array.from(c.queued()),['ahead']);
});
test('lookahead stays bounded and excludes hidden or horizontally absent cards',()=>{
  const {c}=load();
  for(const [top,want]of [[-1201,false],[-1200,true],[2999,true],[3000,false]])assert.equal(c.isAIVisible(card(top),2),want,String(top));
  assert.equal(c.isAIVisible(card(1400,'hidden',{closest:()=>({})}),2),false);
  assert.equal(c.isAIVisible(card(1400,'empty',{getClientRects:()=>[]}),2),false);
  assert.equal(c.isAIVisible(card(1400,'side',{getBoundingClientRect:()=>({top:1400,bottom:1600,left:1300,right:1600})}),2),false);
});
test('offscreen text cards complete classification before the user scrolls',async()=>{
  const {c,requests}=load();await queue(c,card(1400,'ahead'));await c.resume();
  assert.equal(requests.length,1);assert.match(requests[0].state.posts[0].post,/ahead/);
});
test('offscreen thumbnails pass through Gemini and Liquid before entering view',async()=>{
  const {c,requests}=load();await queue(c,card(1400,'picture',{image:true}));await c.resume();
  assert.deepEqual(requests.map(r=>r.model),['google/gemini-2.5-flash-lite','~liquid/d1-ultra-latest']);
  assert.match(requests[1].state.posts[0].post,/public election campaign/);
});
test('disconnected lookahead cards cannot consume a provider request',async()=>{
  const {c,requests}=load(),post=card(1400,'removed');await queue(c,post);post.isConnected=false;await c.resume();assert.equal(requests.length,0);
});
test('visible cards take priority over previously queued lookahead cards',async()=>{
  const {c,requests}=load();for(const [top,id]of [[1500,'ahead1'],[1800,'ahead2'],[100,'visible1'],[400,'visible2']])await queue(c,card(top,id));
  await c.resume();assert.deepEqual(requests[0].state.posts.map(p=>p.post.split(' ').at(-1)),['visible1','visible2','ahead1']);
});
test('moving past the lookahead boundary prevents provider submission',async()=>{
  const {c,requests}=load(),post=card(1400,'away');await queue(c,post);
  post.getBoundingClientRect=()=>({top:5000,bottom:5200,left:0,right:300});await c.resume();assert.equal(requests.length,0);
});
test('offscreen checks pause in background tabs and while settings are open',async()=>{
  for(const [hidden,open]of [[true,false],[false,true]]){const {c,requests}=load();await queue(c,card(1400));c.setPaused(hidden,open);await c.resume();assert.equal(requests.length,0);}
});
test('observer covers the lookahead region and is renewed after resizing',()=>{
  const {c,observers,events}=load(),post=card(1400);c.watchAIPost(post);
  assert.equal(observers[0].options.rootMargin,'1000px 0px 2000px 0px');
  c.testPosts=[post];c.reobserve();c.innerHeight=600;events.get('resize')();
  assert.equal(observers[0].disconnected,true);assert.equal(observers.at(-1).options.rootMargin,'600px 0px 1200px 0px');assert.equal(c.watchCount(),1);
});

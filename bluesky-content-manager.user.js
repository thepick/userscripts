// ==UserScript==
// @name         Bluesky Content Manager
// @namespace    https://greasyfork.org/en/users/567951-stuart-saddler
// @version      3.6.0
// @description  Reliable Bluesky filtering with remembered blocks, whitelist overrides, alt-text enforcement, and searchable settings and history.
// @license      MIT
// @match        https://bsky.app/*
// @icon         https://i.ibb.co/YySpmDk/Bluesky-Content-Manager.png
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addValueChangeListener
// @connect      public.api.bsky.app
// @run-at       document-start
// @downloadURL https://update.greasyfork.org/scripts/518614/Bluesky%20Content%20Manager.user.js
// @updateURL https://update.greasyfork.org/scripts/518614/Bluesky%20Content%20Manager.meta.js
// ==/UserScript==
// Source: https://github.com/thepick/userscripts

(async function () {
'use strict';

/*** CONFIG & GLOBALS ***/
const SETTINGS_KEY = 'bcmSettingsV1', CACHE_KEY = 'bcmBlockedCacheV1';
const SETTING_LABELS = {filteredTerms:'blocklist',manualWhitelistTerms:'allowlist',autoWhitelistEnabled:'followed-account',altTextEnforcementEnabled:'alt-text'};
const CACHE_LIMIT = 5000, CACHE_AGE = 30 * 86400000, FOLLOW_AGE = 5 * 60000, PAGE_SIZE = 50;
const POST_SELECTOR = '[data-testid="post"], article, [data-testid^="feedItem-by-"], [data-testid="postThreadItem"]';
const QUOTE_SELECTOR = '[data-testid="quotePost"], [data-testid="quotePostEmbed"], [data-testid="quotedPost"]';
const POST_CANDIDATES = `${POST_SELECTOR}, div[role="link"]`;
let settings = {filteredTerms:[],manualWhitelistTerms:[],autoWhitelistEnabled:false,altTextEnforcementEnabled:false};
let filteredTerms = [], manualWhitelistTerms = [], autoWhitelistEnabled = false, altTextEnforcementEnabled = false;
let whitelistedUsers = new Set();
const patterns = new Map(), blockedPosts = new Map(), blockedCache = new Map(), pendingCache = new Map(), pendingPosts = new Set(), issues = new Map();
const nodeIds = new WeakMap();
let processedPosts = new WeakMap(), postRuns = new WeakMap(), nodeSequence = 0;
let menuCommandId = null, menuTimer = null, queueTimer = null, cacheTimer = null, flushing = false;
let decisionContext = '', contextInput = '', contextEpoch = 0, contextReady = Promise.resolve();
let currentUserDid = '', followAccount = null, followEnabled = null, followReady = true;
let followState = 'disabled', followEpoch = 0, followsUpdatedAt = 0, followsStartedAt = 0;
let siteState = {}, lastSiteStorage = null, lastPath = '', settingsRaw = null, settingsLoaded = false;
let configDialog = null, updateDialogStatus = () => {}, updateHistory = () => {};

/*** CSS ***/
GM_addStyle(`
.bcm-filtered{display:none!important}
.bcm-dialog{--bcm-bg:#fff;--bcm-fg:#172b3a;--bcm-muted:#4c6170;--bcm-field:#f4f7fa;--bcm-border:#718899;--bcm-accent:#0067b4;--bcm-on-accent:#fff;--bcm-danger:#a51d25;color-scheme:light;background:var(--bcm-bg);color:var(--bcm-fg);box-sizing:border-box;width:min(860px,calc(100% - 24px));max-width:none;max-height:calc(100dvh - 24px);padding:0;border:1px solid var(--bcm-border);border-radius:12px;box-shadow:0 16px 48px #0005;font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
.bcm-dialog[data-bcm-theme="dark"]{--bcm-bg:#15202b;--bcm-fg:#edf4f9;--bcm-muted:#b5c8d7;--bcm-field:#1e3040;--bcm-border:#61798b;--bcm-accent:#8acaff;--bcm-on-accent:#102536;--bcm-danger:#ffb0b5;color-scheme:dark}
.bcm-dialog::backdrop{background:#0009}.bcm-dialog *{box-sizing:border-box}
.bcm-shell{display:flex;flex-direction:column;max-height:calc(100dvh - 26px)}
.bcm-head,.bcm-actions{flex:none;padding:16px 22px}.bcm-head{border-bottom:1px solid var(--bcm-border);display:flex;align-items:center;justify-content:space-between;gap:16px}
.bcm-dialog h2{font-size:1.3rem;margin:0}.bcm-dialog h3{font-size:1.05rem;margin:0 0 10px}
.bcm-body{overflow:auto;padding:20px 22px;min-height:0;overscroll-behavior:contain}
.bcm-section + .bcm-section{margin-top:26px;padding-top:22px;border-top:1px solid var(--bcm-border)}
.bcm-editors{display:grid;grid-template-columns:1fr 1fr;gap:22px}.bcm-editor{min-width:0}
.bcm-dialog label{display:block;font-weight:600;margin-bottom:6px}
.bcm-dialog textarea,.bcm-dialog input[type="search"],.bcm-dialog input[type="text"]{display:block;width:100%;color:var(--bcm-fg);background:var(--bcm-field);border:1px solid var(--bcm-border);border-radius:6px;padding:10px;font:inherit;caret-color:var(--bcm-accent)}
.bcm-dialog textarea{min-height:220px;resize:vertical;line-height:1.5}
.bcm-dialog input::placeholder{color:var(--bcm-muted);opacity:1}
.bcm-dialog .bcm-help{font-size:.875rem;color:var(--bcm-muted);margin:6px 0 10px;overflow-wrap:anywhere}
.bcm-dialog button{min-height:40px;padding:8px 13px;border:1px solid var(--bcm-border);border-radius:6px;font:inherit;color:var(--bcm-fg);background:var(--bcm-field);cursor:pointer}
.bcm-dialog button:hover{border-color:var(--bcm-accent)}.bcm-dialog button:active{filter:brightness(.94)}.bcm-dialog button:disabled{opacity:.6;cursor:default}
.bcm-dialog button.bcm-primary{background:var(--bcm-accent);color:var(--bcm-on-accent);border-color:transparent;font-weight:600}
.bcm-dialog :focus-visible{outline:3px solid var(--bcm-accent);outline-offset:3px}.bcm-dialog ::selection{background:var(--bcm-accent);color:var(--bcm-on-accent)}
.bcm-dialog a{color:var(--bcm-accent);text-underline-offset:3px}
.bcm-row,.bcm-find,.bcm-actions,.bcm-pager{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.bcm-find{flex-wrap:nowrap;margin-top:10px}.bcm-find input{min-width:0}.bcm-find button{flex-shrink:0}
.bcm-options{display:grid;gap:12px}.bcm-options label{display:flex;align-items:flex-start;gap:10px;font-weight:400;margin:0}.bcm-options input{flex:none;width:18px;height:18px;margin:3px 0 0;accent-color:var(--bcm-accent)}
.bcm-status{margin:0;color:var(--bcm-muted);font-size:.875rem;white-space:pre-line;overflow-wrap:anywhere}.bcm-status[data-error="true"]{color:var(--bcm-danger)}
.bcm-actions{justify-content:flex-end;border-top:1px solid var(--bcm-border);background:var(--bcm-bg)}.bcm-actions .bcm-status{flex:1 1 180px;max-height:4.5em;overflow:auto}
.bcm-history{list-style:none;padding:0;margin:12px 0}.bcm-history li{border-bottom:1px solid var(--bcm-border);padding:12px 0;overflow-wrap:anywhere}.bcm-history p{margin:4px 0}.bcm-history .bcm-help{margin:4px 0}.bcm-pager{justify-content:space-between}
.bcm-notice{position:fixed;bottom:16px;right:16px;z-index:1000000;max-width:min(380px,calc(100% - 32px));padding:12px 16px;border:1px solid #8ba3b5;border-radius:8px;background:#172b3a;color:white;font:14px/1.4 system-ui,sans-serif;cursor:pointer}
@media(max-width:620px){.bcm-editors{grid-template-columns:1fr}.bcm-head,.bcm-actions{padding:12px 16px}.bcm-body{padding:16px}.bcm-dialog textarea{min-height:180px}}
`);

/*** SETTINGS & MATCHING ***/
function normalizeUsername(value){return value.toLowerCase().replace(/[\u200B-\u200F\u202A-\u202F]/g,'').trim();}
function normalizeTerms(values){
  if(!Array.isArray(values)||values.some(value=>typeof value!=='string'))throw new Error('Use a list of text entries.');
  if(values.length>50000||values.some(value=>value.length>5000))throw new Error('The list is too large. Use fewer or shorter entries.');
  return [...new Set(values.map(value=>value.trim().toLowerCase()).filter(Boolean))];
}
function validateSettings(value){
  if(!value||typeof value!=='object'||typeof value.autoWhitelistEnabled!=='boolean'||typeof value.altTextEnforcementEnabled!=='boolean')throw new Error('The settings file has invalid options.');
  return {filteredTerms:normalizeTerms(value.filteredTerms),manualWhitelistTerms:normalizeTerms(value.manualWhitelistTerms),autoWhitelistEnabled:value.autoWhitelistEnabled,altTextEnforcementEnabled:value.altTextEnforcementEnabled};
}
function reportIssue(key,message){issues.set(key,message);scheduleMenu();updateDialogStatus();}
function clearIssue(key){if(issues.delete(key))scheduleMenu();updateDialogStatus();}
function readStored(key,fallback){
  try{return GM_getValue(key,fallback);}catch(_){reportIssue(key,'Some saved data could not be read. Existing settings were kept; open settings and try again.');return fallback;}
}
function readSettings(){
  let raw;
  try{raw=GM_getValue(SETTINGS_KEY,null);}catch(_){reportIssue(SETTINGS_KEY,'Saved settings could not be read. The last valid settings were kept. Check userscript storage and try again.');return {value:settings,raw:settingsRaw};}
  if(raw!==null){
    try{
      const parsed=typeof raw==='string'?JSON.parse(raw):raw;if(parsed.version!==1||!parsed.settings||typeof parsed.settings!=='object')throw new Error();
      const value={...settings};
      for(const key of ['filteredTerms','manualWhitelistTerms','autoWhitelistEnabled','altTextEnforcementEnabled']){
        try{if(key.endsWith('Terms'))value[key]=normalizeTerms(parsed.settings[key]);else{if(typeof parsed.settings[key]!=='boolean')throw new Error();value[key]=parsed.settings[key];}}
        catch(_){reportIssue(key,`The saved ${SETTING_LABELS[key]} field is invalid. Other settings were recovered; its last valid value was kept. Export a backup before correcting it.`);}
      }
      return {value,raw};
    }
    catch(_){reportIssue('settings','Saved settings could not be read. Export a backup before saving.');if(settingsLoaded)return {value:settings,raw};}
  }
  const value={...settings};
  for(const key of ['filteredTerms','manualWhitelistTerms']){
    try{const stored=readStored(key,'[]');value[key]=normalizeTerms(typeof stored==='string'?JSON.parse(stored):stored);}
    catch(_){reportIssue(key,`The saved ${key==='filteredTerms'?'blocklist':'allowlist'} is invalid. Its original data has not been overwritten. Restore a backup or correct this list before saving.`);}
  }
  for(const key of ['autoWhitelistEnabled','altTextEnforcementEnabled']){
    const stored=readStored(key,false);if(typeof stored==='boolean')value[key]=stored;else reportIssue(key,`The saved ${SETTING_LABELS[key]} option is invalid. Its previous value was kept.`);
  }
  try{
    const stored=readStored('whitelistedUsers','[]');
    const legacy=normalizeTerms(typeof stored==='string'?JSON.parse(stored):stored).map(user=>user.startsWith('@')?user:'@'+user);
    value.manualWhitelistTerms=normalizeTerms(value.manualWhitelistTerms.concat(legacy));
  }catch(_){reportIssue('whitelistedUsers','Some legacy allowed accounts could not be read. Their original data has not been overwritten.');}
  return {value,raw};
}
function initializeSettings(){const loaded=readSettings();settingsRaw=loaded.raw;installSettings(loaded.value);settingsLoaded=true;}
function installSettings(value){
  settings=validateSettings(value);({filteredTerms,manualWhitelistTerms,autoWhitelistEnabled,altTextEnforcementEnabled}=settings);
  patterns.clear();for(const term of filteredTerms.concat(manualWhitelistTerms))termToRegex(term);
}
function escapeRegExp(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function cleanText(value){return value.normalize('NFKD').replace(/\s+/g,' ').toLowerCase().trim();}
function termToRegex(term){
  if(!term||typeof term!=='string')return null;
  if(!patterns.has(term)){
    const escaped=escapeRegExp(term);
    // Preserve the existing word suffixes and literal phrase matching.
    patterns.set(term,/^[a-z]+$/i.test(term)&&term.length>=3?new RegExp(`\\b${escaped}(?:s|es|ed|ing|er|ers)?\\b`,'i'):new RegExp(escaped,'i'));
  }
  return patterns.get(term);
}
function regexMatchAny(text,terms){
  if(!text||!terms.length)return null;const cleaned=cleanText(text);
  for(const term of terms){const re=termToRegex(term);if(re&&(re.test(text)||re.test(cleaned)))return term;}return null;
}
async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
function rebuildContext(){
  const value=JSON.stringify([1,settings,currentUserDid,autoWhitelistEnabled?followReady:true,autoWhitelistEnabled?[...whitelistedUsers].sort():[]]);
  if(value===contextInput)return contextReady;contextInput=value;const epoch=++contextEpoch;
  contextReady=digest(value).then(context=>{if(epoch!==contextEpoch)return;decisionContext=context;processedPosts=new WeakMap();rescanPosts();});return contextReady;
}

/*** POST IDENTITY & CONTENT ***/
function parsePostURL(href){
  try{
    const url=new URL(href,'https://bsky.app'),match=url.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)\/?$/);
    if(url.origin!=='https://bsky.app'||!match)return null;
    const author=decodeURIComponent(match[1]),record=decodeURIComponent(match[2]);
    if(!/^[a-zA-Z0-9._:~-]+$/.test(author)||!/^[a-zA-Z0-9._:~-]+$/.test(record))return null;
    return {url:`https://bsky.app/profile/${encodeURIComponent(author)}/post/${encodeURIComponent(record)}`,author:normalizeUsername('@'+author)};
  }catch(_){return null;}
}
function isPostContainer(node){
  if(!node?.matches||node.closest('[data-bcm-ui]')||node.closest(QUOTE_SELECTOR))return false;
  if(node.matches(POST_SELECTOR))return true;
  return node.matches('div[role="link"]')&&!node.parentElement?.closest(POST_SELECTOR)&&!!node.querySelector('[data-testid="postText"],a[href*="/post/"]');
}
function getPostContainer(node){
  let current=node?.nodeType===1?node:node?.parentElement;const quote=current?.closest(QUOTE_SELECTOR);if(quote)current=quote.parentElement;
  const explicit=current?.closest(POST_SELECTOR);if(explicit&&isPostContainer(explicit))return explicit;
  while(current&&current!==document.body){if(isPostContainer(current))return current;current=current.parentElement;}return null;
}
function ownElement(element,post){return !element.closest(QUOTE_SELECTOR)&&!element.closest('[data-testid="postText"]')&&element.closest(POST_SELECTOR)===(post.matches(POST_SELECTOR)?post:null);}
function getPostIdentity(post){
  for(const link of post.querySelectorAll('a[href*="/post/"]')){if(!ownElement(link,post))continue;const parsed=parsePostURL(link.getAttribute('href'));if(parsed)return parsed;}return null;
}
function extractAuthorHandle(post){
  const identity=getPostIdentity(post);if(identity)return identity.author;
  const testid=post.getAttribute('data-testid')||'',feedAuthor=testid.startsWith('feedItem-by-')?testid.slice('feedItem-by-'.length):'';
  if(/^[a-zA-Z0-9._:~-]+$/.test(feedAuthor))return normalizeUsername('@'+feedAuthor);
  const authors=new Set();
  for(const link of post.querySelectorAll('a[href*="/profile/"]')){
    if(!ownElement(link,post)||link.closest('[data-testid="postText"]'))continue;
    try{const url=new URL(link.getAttribute('href'),'https://bsky.app'),match=url.origin==='https://bsky.app'&&url.pathname.match(/^\/profile\/([^/]+)\/?$/);if(match)authors.add(normalizeUsername('@'+decodeURIComponent(match[1])));}catch(_){}
  }
  return authors.size===1?[...authors][0]:'';
}
function getAuthorIdentities(post,identity){
  const ids=new Set(identity?[identity.author]:[]);
  if(!identity){const author=extractAuthorHandle(post);return author?[author]:[];}
  if(identity&&!identity.author.startsWith('@did:'))return [...ids];
  const permalink=identity?[...post.querySelectorAll('a[href*="/post/"]')].find(link=>ownElement(link,post)&&parsePostURL(link.getAttribute('href'))?.url===identity.url):null;
  let scope=permalink?.parentElement||post;
  while(scope){
    const links=[...scope.querySelectorAll('a[href*="/profile/"]')].filter(link=>ownElement(link,post)&&!link.closest('[data-testid="postText"]')&&!parsePostURL(link.getAttribute('href')));
    if(links.length){
      // The timestamp's nearest profile row identifies the author, excluding repost headers and quotes.
      const profileURLs=new Set(links.map(link=>{try{return new URL(link.getAttribute('href'),'https://bsky.app').pathname;}catch(_){return '';}}));
      if(scope!==post||profileURLs.size===1){
        const link=links.at(-1);
        try{const url=new URL(link.getAttribute('href'),'https://bsky.app'),match=url.origin==='https://bsky.app'&&url.pathname.match(/^\/profile\/([^/]+)\/?$/);if(match)ids.add(normalizeUsername('@'+decodeURIComponent(match[1])));}catch(_){}
      }
      break;
    }
    if(scope===post)break;scope=scope.parentElement;
  }
  if(!ids.size){const author=extractAuthorHandle(post);if(author)ids.add(author);}return [...ids];
}
function shouldRequireAltText(img){
  const src=img.getAttribute('src')||'';if(src.includes('/avatar')||src.includes('/banner')||img.closest('[data-testid="avatar"]')||img.classList.contains('avatar'))return false;
  const width=img.naturalWidth||img.width||0,height=img.naturalHeight||img.height||0;
  return !(width>0&&height>0&&(width<=48||height<=48))&&img.getAttribute('aria-hidden')!=='true'&&img.getAttribute('role')!=='presentation';
}
function isControl(element){return !!element.closest('button,[role="button"],time');}
function getPostData(post){
  const identity=getPostIdentity(post),author=identity?.author||extractAuthorHandle(post),authorIds=getAuthorIdentities(post,identity);
  const texts=[...post.querySelectorAll('[data-testid="postText"]')].map(element=>element.textContent||'');
  const images=[...post.querySelectorAll('img')].map(img=>({text:img.alt||img.getAttribute('aria-label')||'',alt:img.alt||'',src:img.getAttribute('src')||'',required:shouldRequireAltText(img)}));
  const names=[...post.querySelectorAll('a[href*="/profile/"]')].filter(element=>!parsePostURL(element.getAttribute('href'))).map(element=>element.textContent||'').join(' ');
  const labels=[...post.querySelectorAll('[aria-label],[title]')].filter(element=>!isControl(element)&&!(element.matches('a')&&parsePostURL(element.getAttribute('href')))).map(element=>`${element.getAttribute('aria-label')||''} ${element.getAttribute('title')||''}`).join(' ');
  const parts=[],walker=document.createTreeWalker(post,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){const parent=node.parentElement;if(!parent||isControl(parent))continue;const link=parent.closest('a');if(link&&parsePostURL(link.getAttribute('href'))&&!link.querySelector('[data-testid="postText"]'))continue;parts.push(node.nodeValue);}
  return {identity,author,authorIds,text:texts.join(' '),images,names,labels,general:parts.join(' ').replace(/\s+/g,' ').trim()};
}
function isWhitelisted(post,data=getPostData(post)){return (data.authorIds||[data.author]).some(author=>whitelistedUsers.has(author)||manualWhitelistTerms.some(term=>term.startsWith('@')&&normalizeUsername(term)===author));}
function decidePost(post,data){
  if(isWhitelisted(post,data))return null;
  const combined=[data.general,data.text,data.names,data.labels,...data.images.map(img=>img.text)].join(' ');
  if(regexMatchAny(combined,manualWhitelistTerms.filter(term=>!term.startsWith('@'))))return null;
  if(altTextEnforcementEnabled&&data.images.some(img=>img.required&&!img.alt.trim()))return {reason:'Alt-text enforcement',keyword:'missing alt-text'};
  const fields=data.images.map(img=>[img.text,'Alt-text keyword']).concat([[data.names,'Author name'],[data.text,'Post text'],[data.labels,'ARIA/TITLE attribute'],[data.general,'General content']]);
  for(const [text,reason]of fields){const keyword=regexMatchAny(text,filteredTerms);if(keyword)return {reason,keyword};}return null;
}
function shouldProcessPage(){return !location.pathname.startsWith('/notifications');}
function recordBlockedPost(post,data,decision){
  if(!nodeIds.has(post))nodeIds.set(post,++nodeSequence);const provisional='node:'+nodeIds.get(post),id=data.identity?.url||provisional,excerpt=(data.text||data.general||'[No text content]').trim(),previous=blockedPosts.get(id)||blockedPosts.get(provisional);
  if(data.identity)blockedPosts.delete(provisional);
  blockedPosts.set(id,{id,url:data.identity?.url||'',author:data.author||'[Unknown author]',excerpt:excerpt.length>240?excerpt.slice(0,240)+'…':excerpt,...decision,timestamp:previous?.timestamp||new Date().toLocaleTimeString()});
  scheduleMenu();
}
async function processPost(post){
  const container=getPostContainer(post);if(!container||!container.isConnected)return;const epoch=contextEpoch;await contextReady;
  if(epoch!==contextEpoch){enqueuePost(container);return;}
  if(!shouldProcessPage()||(autoWhitelistEnabled&&!followReady)){container.classList.remove('bcm-filtered');return;}
  const context=decisionContext,data=getPostData(container),input=JSON.stringify([data.author,data.authorIds,data.identity?.url,data.text,data.names,data.labels,data.general,data.images]),previous=processedPosts.get(container);
  if(previous?.input===input&&previous.context===context){container.classList.toggle('bcm-filtered',!!previous.decision);return;}
  const run=(postRuns.get(container)||0)+1;postRuns.set(container,run);const fingerprint=data.identity?await digest(input):'';
  if(postRuns.get(container)!==run||epoch!==contextEpoch||context!==decisionContext||!container.isConnected)return;
  const key=data.identity?`${context}|${data.identity.url}`:'',cached=key&&blockedCache.get(key);
  const decision=cached?.fingerprint===fingerprint&&Date.now()-cached.at<CACHE_AGE?{reason:cached.reason,keyword:cached.keyword}:decidePost(container,data);
  processedPosts.set(container,{input,context,decision});container.classList.toggle('bcm-filtered',!!decision);
  if(decision){recordBlockedPost(container,data,decision);if(key&&(!cached||cached.fingerprint!==fingerprint))rememberDecision(key,{fingerprint,...decision,at:Date.now()});}else if(cached)blockedCache.delete(key);
}

/*** PERSISTENT DECISIONS ***/
function cacheEntries(value){
  const parsed=typeof value==='string'?JSON.parse(value):value;if(!parsed||parsed.version!==1||!Array.isArray(parsed.entries))throw new Error();
  return parsed.entries.filter(entry=>Array.isArray(entry)&&typeof entry[0]==='string'&&entry[0].length<1000&&entry[1]&&/^[a-f0-9]{64}$/.test(entry[1].fingerprint)&&typeof entry[1].reason==='string'&&typeof entry[1].keyword==='string'&&Number.isFinite(entry[1].at)&&Date.now()-entry[1].at>=0&&Date.now()-entry[1].at<CACHE_AGE).slice(-CACHE_LIMIT);
}
function loadDecisionCache(){try{for(const [key,value]of cacheEntries(readStored(CACHE_KEY,'{"version":1,"entries":[]}')))blockedCache.set(key,value);}catch(_){reportIssue('cache','Remembered blocks could not be loaded. Normal filtering still works; clear remembered decisions in settings to rebuild them.');}}
function rememberDecision(key,value){
  blockedCache.delete(key);blockedCache.set(key,value);pendingCache.set(key,value);while(blockedCache.size>CACHE_LIMIT)blockedCache.delete(blockedCache.keys().next().value);
  if(!cacheTimer)cacheTimer=setTimeout(flushDecisionCache,500);
}
function flushDecisionCache(){
  clearTimeout(cacheTimer);cacheTimer=null;if(!pendingCache.size)return;const additions=new Map(pendingCache);pendingCache.clear();let merged;
  try{merged=new Map(cacheEntries(GM_getValue(CACHE_KEY,'{"version":1,"entries":[]}')));}catch(_){merged=new Map();}
  for(const [key,value]of additions){merged.delete(key);merged.set(key,value);}const entries=[...merged].sort((a,b)=>a[1].at-b[1].at).slice(-CACHE_LIMIT);
  const failed=()=>{for(const [key,value]of additions)if(!pendingCache.has(key))pendingCache.set(key,value);reportIssue('cache-save','Remembered blocks could not be saved. Filtering still works; saving will be retried when more blocks are found or you leave the page.');};
  try{Promise.resolve(GM_setValue(CACHE_KEY,JSON.stringify({version:1,entries}))).then(()=>{clearIssue('cache-save');clearIssue('cache');},failed);}catch(_){failed();}
}

/*** OBSERVE + ROUTE WATCH ***/
function enqueuePost(post){if(!post?.isConnected)return;pendingPosts.add(post);if(!queueTimer&&!flushing)queueTimer=setTimeout(flushPosts,0);}
async function flushPosts(){
  queueTimer=null;if(flushing)return;flushing=true;const start=performance.now();
  try{for(const post of pendingPosts){pendingPosts.delete(post);try{await processPost(post);}catch(_){reportIssue('processing','A post could not be checked. Reload Bluesky if filtering does not resume.');}if(performance.now()-start>8)break;}}
  finally{flushing=false;if(pendingPosts.size&&!queueTimer)queueTimer=setTimeout(flushPosts,0);}
}
function collectPosts(node){
  if(node?.nodeType!==1||node.closest('[data-bcm-ui]'))return;const parent=getPostContainer(node);if(parent)enqueuePost(parent);
  for(const post of node.querySelectorAll(POST_CANDIDATES))if(isPostContainer(post))enqueuePost(post);
}
function rescanPosts(){if(document.body)collectPosts(document.body);}
function observePosts(){
  const observer=new MutationObserver(mutations=>{for(const mutation of mutations){const target=mutation.target.nodeType===1?mutation.target:mutation.target.parentElement;if(!target||target.closest('[data-bcm-ui]'))continue;const post=getPostContainer(target);if(post)enqueuePost(post);for(const node of mutation.addedNodes)collectPosts(node);}});
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['alt','aria-label','aria-hidden','title','src','href','role','data-testid','width','height']});
  document.addEventListener('load',event=>{if(event.target?.tagName==='IMG'){const post=getPostContainer(event.target);if(post)enqueuePost(post);}},true);return observer;
}

/*** ACTIVE ACCOUNT & PUBLIC FOLLOWS ***/
function getActiveAccount(value){const account=value?.session?.currentAccount,did=typeof account==='string'?account:account?.did;return typeof did==='string'&&/^did:[a-z]+:[^\s]+$/.test(did)?did:'';}
function readSiteState(){try{const raw=localStorage.getItem('BSKY_STORAGE');if(raw!==lastSiteStorage){lastSiteStorage=raw;siteState=raw?JSON.parse(raw):{};}}catch(_){siteState={};}return siteState;}
function followStorageKey(){return 'bcmFollowsV1.'+currentUserDid;}
function readFollowCache(){
  try{const raw=readStored(followStorageKey(),null),value=typeof raw==='string'?JSON.parse(raw):raw;if(!value||value.account!==currentUserDid||!Number.isFinite(value.at)||Date.now()-value.at<0||Date.now()-value.at>FOLLOW_AGE)return false;whitelistedUsers=new Set(normalizeTerms(value.users).map(normalizeUsername));followsUpdatedAt=value.at;return true;}catch(_){return false;}
}
function requestFollows(account,cursor){
  const url=new URL('https://public.api.bsky.app/xrpc/app.bsky.graph.getFollows');url.searchParams.set('actor',account);url.searchParams.set('limit','100');if(cursor)url.searchParams.set('cursor',cursor);
  return new Promise((resolve,reject)=>GM_xmlhttpRequest({method:'GET',url:url.href,anonymous:true,timeout:15000,headers:{Accept:'application/json'},onload(response){try{if(response.status!==200)throw new Error(`Server returned ${response.status}.`);const data=JSON.parse(response.responseText);if(!Array.isArray(data.follows))throw new Error('The server returned an invalid follows list.');resolve(data);}catch(error){reject(error);}},onerror:()=>reject(new Error('Network request failed.')),ontimeout:()=>reject(new Error('The request timed out.'))}));
}
async function autoWhitelistFollowedAccounts(){
  if(!autoWhitelistEnabled||!currentUserDid)return;const account=currentUserDid,epoch=++followEpoch;followState='loading';followsStartedAt=Date.now();updateDialogStatus();
  try{
    const users=new Set(),cursors=new Set();let cursor='';
    do{const data=await requestFollows(account,cursor);if(epoch!==followEpoch||account!==currentUserDid||!autoWhitelistEnabled)return;
      for(const user of data.follows)for(const id of [user.handle,user.did])if(typeof id==='string'&&id)users.add(normalizeUsername('@'+id));
      cursor=data.cursor;if(cursor&&(typeof cursor!=='string'||cursors.has(cursor)||cursors.size>=1000))throw new Error('The server repeated or exceeded its follows pages.');if(cursor)cursors.add(cursor);
    }while(cursor);
    whitelistedUsers=users;followReady=true;followState='ready';followsUpdatedAt=Date.now();clearIssue('follows');
    try{await GM_setValue(followStorageKey(),JSON.stringify({account,at:followsUpdatedAt,users:[...users]}));}catch(_){reportIssue('follow-save','Followed accounts were loaded, but their local snapshot could not be saved.');}
    await rebuildContext();
  }catch(error){if(epoch!==followEpoch||account!==currentUserDid)return;followState='error';reportIssue('follows',`${followReady?'Using the last loaded followed accounts.':'Filtering is paused to protect followed accounts.'} Could not refresh follows. ${error.message} Use Retry in settings.`);if(!followReady)rescanPosts();}
  updateDialogStatus();scheduleMenu();
}
async function refreshEnvironment(force=false){
  const state=readSiteState(),account=getActiveAccount(state),changed=account!==currentUserDid||followEnabled!==autoWhitelistEnabled||followAccount!==account;
  if(changed){currentUserDid=account;followAccount=account;followEnabled=autoWhitelistEnabled;followEpoch++;whitelistedUsers=new Set();followsUpdatedAt=0;clearIssue('follows');followReady=!autoWhitelistEnabled;followState=autoWhitelistEnabled?(account?'loading':'waiting'):'disabled';if(autoWhitelistEnabled&&account)followReady=readFollowCache();}
  if(changed||force)await rebuildContext();if(changed&&autoWhitelistEnabled&&account)void autoWhitelistFollowedAccounts();
  const path=location.pathname;if(path!==lastPath){lastPath=path;processedPosts=new WeakMap();rescanPosts();}if(configDialog)configDialog.dataset.bcmTheme=theme();updateDialogStatus();
}
function theme(){const mode=readSiteState().colorMode;return mode==='dark'||(mode!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}

/*** MENU UI ***/
function scheduleMenu(){if(!menuTimer)menuTimer=setTimeout(updateMenuCommand,100);}
function updateMenuCommand(){
  clearTimeout(menuTimer);menuTimer=null;if(menuCommandId!==null)GM_unregisterMenuCommand(menuCommandId);
  menuCommandId=GM_registerMenuCommand(`Configure Filters (${blockedPosts.size} blocked${issues.size?'; needs attention':''})`,showConfigUI);
  if(configDialog?.open){updateHistory();updateDialogStatus();}let notice=document.querySelector('.bcm-notice');
  if(issues.size&&document.body){if(!notice){notice=document.createElement('button');notice.className='bcm-notice';notice.dataset.bcmUi='';notice.addEventListener('click',showConfigUI);document.body.append(notice);}notice.textContent='Content Manager needs attention. Open settings for details.';}else notice?.remove();
}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
async function showConfigUI(){if(configDialog){configDialog.focus();return;}await refreshEnvironment();createConfigUI();}
function createConfigUI(){
  if(configDialog)return;const opener=document.activeElement,dialog=document.createElement('dialog');configDialog=dialog;
  dialog.className='bcm-dialog';dialog.dataset.bcmUi='';dialog.dataset.bcmTheme=theme();dialog.setAttribute('aria-labelledby','bcm-title');
  // Only static markup belongs here. Post content and saved values use textContent/value.
  dialog.innerHTML=`<div class="bcm-shell"><header class="bcm-head"><h2 id="bcm-title" tabindex="-1">Bluesky Content Manager</h2><button type="button" id="bcm-close" aria-label="Close settings">Close</button></header><div class="bcm-body"><section class="bcm-section"><div class="bcm-editors"><div class="bcm-editor"><label for="bcm-blocklist">Blocklist keywords</label><p class="bcm-help" id="bcm-block-help">One entry per line. Checks post text, author names, image descriptions, and embedded content.</p><textarea id="bcm-blocklist" spellcheck="false" aria-describedby="bcm-block-help bcm-block-count"></textarea><p class="bcm-help" id="bcm-block-count" aria-live="polite"></p><div class="bcm-find"><input type="search" id="bcm-block-find" aria-label="Find in blocklist" placeholder="Find in blocklist"><button type="button" id="bcm-block-next">Next match</button></div></div><div class="bcm-editor"><label for="bcm-allowlist">Allowlist overrides</label><p class="bcm-help" id="bcm-allow-help">One @handle or content term per line. Allowed authors and matching content override all blocking.</p><textarea id="bcm-allowlist" spellcheck="false" aria-describedby="bcm-allow-help bcm-allow-count"></textarea><p class="bcm-help" id="bcm-allow-count" aria-live="polite"></p><div class="bcm-find"><input type="search" id="bcm-allow-find" aria-label="Find in allowlist" placeholder="Find in allowlist"><button type="button" id="bcm-allow-next">Next match</button></div></div></div></section><section class="bcm-section"><h3>Filtering options</h3><div class="bcm-options"><label><input type="checkbox" id="bcm-alt">Hide posts with images missing alt text</label><label><input type="checkbox" id="bcm-follows">Allow posts from followed accounts</label></div><p class="bcm-help">Avatars, banners, small icons, and decorative images are excluded from alt-text enforcement.</p><div class="bcm-row"><p id="bcm-follow-status" class="bcm-status" role="status"></p><button type="button" id="bcm-follow-retry">Refresh followed accounts</button></div><p class="bcm-help">The public follows list is checked on account changes and refreshed while browsing. No access token is sent.</p></section><section class="bcm-section"><h3>Check a matching rule</h3><p class="bcm-help" id="bcm-rule-help">Plain English words of at least three letters match whole words with optional s, es, ed, ing, er, or ers. Other entries match literal substrings. For compatibility, city does not match cities, and cat matches cater.</p><label for="bcm-preview">Sample text</label><input type="text" id="bcm-preview" aria-describedby="bcm-rule-help"><p id="bcm-preview-result" class="bcm-help" role="status">Enter sample text to test the lists above.</p></section><section class="bcm-section"><h3>Local memory and backup</h3><p id="bcm-cache-status" class="bcm-help"></p><div class="bcm-row"><button type="button" id="bcm-clear-cache">Clear remembered decisions</button><button type="button" id="bcm-export">Export settings</button><button type="button" id="bcm-import">Import settings</button><input type="file" id="bcm-import-file" accept="application/json,.json" hidden></div><p class="bcm-help">Backups contain your lists and options only. Imports fill these editors; review them and choose Save changes. Settings and remembered decisions stay in this browser's userscript storage.</p></section><section class="bcm-section"><h3 id="bcm-history-title">Blocked posts this session</h3><label for="bcm-history-search">Search blocked history</label><input type="search" id="bcm-history-search" placeholder="Post excerpt, author, or reason"><ul class="bcm-history" id="bcm-history"></ul><div class="bcm-pager"><button type="button" id="bcm-history-prev">Previous</button><span id="bcm-history-page" class="bcm-help" role="status"></span><button type="button" id="bcm-history-next">Next</button></div></section></div><footer class="bcm-actions"><p id="bcm-save-status" class="bcm-status" role="status" aria-live="polite"></p><button type="button" id="bcm-cancel">Cancel</button><button type="button" class="bcm-primary" id="bcm-save">Save changes</button></footer></div>`;
  const errorDetails=element('p','bcm-status');errorDetails.id='bcm-errors';errorDetails.setAttribute('role','alert');errorDetails.dataset.error='true';errorDetails.hidden=true;dialog.querySelector('.bcm-body').prepend(errorDetails);
  const find=id=>dialog.querySelector('#'+id);let dirty=false,saving=false,page=0,baseRaw=settingsRaw;
  find('bcm-blocklist').value=filteredTerms.join('\n');find('bcm-allowlist').value=manualWhitelistTerms.join('\n');find('bcm-alt').checked=altTextEnforcementEnabled;find('bcm-follows').checked=autoWhitelistEnabled;
  const draft=()=>validateSettings({filteredTerms:find('bcm-blocklist').value.split('\n'),manualWhitelistTerms:find('bcm-allowlist').value.split('\n'),altTextEnforcementEnabled:find('bcm-alt').checked,autoWhitelistEnabled:find('bcm-follows').checked});
  const status=(message,error=false)=>{find('bcm-save-status').textContent=message;find('bcm-save-status').dataset.error=String(error);};
  updateDialogStatus=()=>{
    if(!configDialog)return;
    const descriptions={disabled:'Followed-account overrides are off.',waiting:'Sign in to Bluesky to load followed accounts. Filtering is paused.',loading:followReady?'Refreshing followed accounts; using the last loaded list.':'Loading followed accounts. Filtering is paused until the list is ready.',ready:`Followed accounts loaded at ${followsUpdatedAt?new Date(followsUpdatedAt).toLocaleTimeString():'startup'}.`,error:issues.get('follows')||'Could not load followed accounts. Retry the request.'};
    find('bcm-follow-status').textContent=descriptions[followState];find('bcm-follow-retry').disabled=!autoWhitelistEnabled||!currentUserDid||followState==='loading';find('bcm-follow-retry').textContent=followState==='error'?'Retry followed accounts':'Refresh followed accounts';
    find('bcm-cache-status').textContent=`${blockedCache.size.toLocaleString()} remembered decisions. Keeps up to ${CACHE_LIMIT.toLocaleString()} recent blocked-post decisions for 30 days. Changed content, lists, accounts, and followed accounts are rechecked. Session history is not truncated.`;
    const details=[...issues.values()].join('\n');errorDetails.hidden=!details;if(errorDetails.textContent!==details)errorDetails.textContent=details;
    if(details&&!find('bcm-save-status').textContent)status('Some settings need attention. See the details above.',true);
  };
  updateHistory=()=>{
    const query=find('bcm-history-search').value.trim().toLowerCase(),rows=[...blockedPosts.values()].reverse().filter(row=>!query||[row.excerpt,row.author,row.reason,row.keyword].join(' ').toLowerCase().includes(query)),pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));page=Math.min(page,pages-1);
    const list=find('bcm-history');list.replaceChildren();find('bcm-history-title').textContent=`Blocked posts this session (${blockedPosts.size.toLocaleString()})`;
    if(!rows.length)list.append(element('li','bcm-help',query?'No blocked posts match this search.':'No posts have been blocked this session. New blocks will appear here.'));
    for(const row of rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)){
      const item=element('li');if(row.url){const link=element('a','',row.author);link.href=row.url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',`Open blocked post by ${row.author}`);item.append(link);}else item.append(element('span','',row.author));
      item.append(element('p','',row.excerpt),element('p','bcm-help',`Blocked by “${row.keyword}” · ${row.reason} · ${row.timestamp}`));list.append(item);
    }
    find('bcm-history-page').textContent=`${rows.length.toLocaleString()} matching posts · Page ${page+1} of ${pages}`;find('bcm-history-prev').disabled=page===0;find('bcm-history-next').disabled=page>=pages-1;
  };
  function setupEditor(prefix,textareaId){
    const editor=find(textareaId),search=find(prefix+'-find'),next=find(prefix+'-next');
    function update(){try{const entries=normalizeTerms(editor.value.split('\n')),query=search.value.toLowerCase(),matches=query?entries.filter(entry=>entry.includes(query)).length:0;find(prefix+'-count').textContent=`${entries.length.toLocaleString()} unique entries${query?` · ${matches.toLocaleString()} matching entries`:''}`;next.disabled=!query||!matches;}catch(error){status(error.message,true);}}
    editor.addEventListener('input',update);search.addEventListener('input',update);next.addEventListener('click',()=>{const text=editor.value.toLowerCase(),query=search.value.toLowerCase();let index=text.indexOf(query,editor.selectionEnd);if(index<0)index=text.indexOf(query);if(index>=0){editor.focus();editor.setSelectionRange(index,index+query.length);editor.scrollTop=(editor.value.slice(0,index).split('\n').length-1)*parseFloat(getComputedStyle(editor).lineHeight);}});update();return update;
  }
  const updateBlock=setupEditor('bcm-block','bcm-blocklist'),updateAllow=setupEditor('bcm-allow','bcm-allowlist');
  const close=()=>{if(!saving)dialog.close();};find('bcm-close').addEventListener('click',close);find('bcm-cancel').addEventListener('click',close);
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=[...dialog.querySelectorAll('button,input,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter(control=>!control.disabled&&control.getClientRects().length);
    const first=controls[0],last=controls.at(-1),active=document.activeElement;
    if((event.shiftKey&&(active===first||!controls.includes(active)))||(!event.shiftKey&&active===last)){event.preventDefault();(event.shiftKey?last:first)?.focus();}
  });
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('close',()=>{dialog.remove();configDialog=null;updateDialogStatus=()=>{};updateHistory=()=>{};if(opener?.isConnected&&opener!==document.body)opener.focus();});
  dialog.addEventListener('input',event=>{if(event.target.matches('textarea,input[type="checkbox"]')){dirty=true;status('Unsaved changes.');}});
  const renderPreview=()=>{try{const value=draft(),text=find('bcm-preview').value,allow=regexMatchAny(text,value.manualWhitelistTerms.filter(term=>!term.startsWith('@'))),block=regexMatchAny(text,value.filteredTerms);find('bcm-preview-result').textContent=!text?'Enter sample text to test the lists above.':allow?`Allowed by content term “${allow}”.`:block?`Blocked by keyword “${block}”.`:'No keyword rule matches. Account overrides and image options are checked on real posts.';}catch(error){status(error.message,true);}};find('bcm-preview').addEventListener('input',renderPreview);find('bcm-blocklist').addEventListener('input',renderPreview);find('bcm-allowlist').addEventListener('input',renderPreview);
  find('bcm-history-search').addEventListener('input',()=>{page=0;updateHistory();});find('bcm-history-prev').addEventListener('click',()=>{page--;updateHistory();});find('bcm-history-next').addEventListener('click',()=>{page++;updateHistory();});find('bcm-follow-retry').addEventListener('click',()=>void autoWhitelistFollowedAccounts());
  find('bcm-clear-cache').addEventListener('click',async()=>{try{clearTimeout(cacheTimer);cacheTimer=null;await GM_setValue(CACHE_KEY,'{"version":1,"entries":[]}');blockedCache.clear();pendingCache.clear();clearIssue('cache');clearIssue('cache-save');updateDialogStatus();status('Remembered decisions cleared. Current filters and history were kept.');}catch(_){status('Could not clear remembered decisions. Check userscript storage and try again.',true);}});
  find('bcm-export').addEventListener('click',()=>{try{const url=URL.createObjectURL(new Blob([JSON.stringify({format:'bluesky-content-manager-settings',version:1,settings:draft()},null,2)],{type:'application/json'})),link=element('a');link.href=url;link.download='bluesky-content-manager-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Settings backup exported. Unsaved editor changes are included.');}catch(error){status(`Could not export settings. ${error.message}`,true);}});
  find('bcm-import').addEventListener('click',()=>find('bcm-import-file').click());
  find('bcm-import-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>2*1024*1024)throw new Error('Choose a settings file smaller than 2 MB.');const value=JSON.parse(await file.text());if(value.format!=='bluesky-content-manager-settings'||value.version!==1)throw new Error('Choose a Bluesky Content Manager settings backup.');const imported=validateSettings(value.settings);find('bcm-blocklist').value=imported.filteredTerms.join('\n');find('bcm-allowlist').value=imported.manualWhitelistTerms.join('\n');find('bcm-alt').checked=imported.altTextEnforcementEnabled;find('bcm-follows').checked=imported.autoWhitelistEnabled;updateBlock();updateAllow();dirty=true;status('Backup loaded into the editors. Review it, then choose Save changes.');}catch(error){status(`Import failed. ${error.message} Your lists were kept.`,true);}event.target.value='';
  });
  find('bcm-save').addEventListener('click',async()=>{
    try{const value=draft();if(GM_getValue(SETTINGS_KEY,null)!==baseRaw)throw new Error('Settings changed in another tab. Export these edits, then close and reopen settings before saving.');saving=true;find('bcm-save').disabled=true;status('Saving changes…');const raw=JSON.stringify({version:1,settings:value});await GM_setValue(SETTINGS_KEY,raw);settingsRaw=raw;baseRaw=raw;installSettings(value);for(const key of ['settings',SETTINGS_KEY,'filteredTerms','manualWhitelistTerms','autoWhitelistEnabled','altTextEnforcementEnabled','whitelistedUsers'])issues.delete(key);await refreshEnvironment(true);dirty=false;status('Saved. Filters updated without reloading the page.');scheduleMenu();}catch(error){status(`Could not save. ${error.message} Your edits are still here.`,true);}finally{saving=false;find('bcm-save').disabled=false;}
  });
  dialog.addEventListener('bcm-settings-changed',()=>status(dirty?'Settings changed in another tab. Export your edits before closing this window.':'Settings changed in another tab. Close and reopen to see the latest lists.',dirty));
  document.body.append(dialog);dialog.showModal();find('bcm-title').focus();updateHistory();updateDialogStatus();
}

/*** INIT ***/
async function main(){
  try{
    initializeSettings();loadDecisionCache();
    if(!document.body)await new Promise(resolve=>{const observer=new MutationObserver(()=>{if(document.body){observer.disconnect();resolve();}});observer.observe(document.documentElement||document,{childList:true,subtree:true});});
    observePosts();await refreshEnvironment(true);updateMenuCommand();rescanPosts();
    if(typeof GM_addValueChangeListener==='function')GM_addValueChangeListener(SETTINGS_KEY,(_key,_old,_new,remote)=>{if(!remote)return;const loaded=readSettings();settingsRaw=loaded.raw;installSettings(loaded.value);void refreshEnvironment(true);configDialog?.dispatchEvent(new Event('bcm-settings-changed'));});
    setInterval(()=>{void refreshEnvironment();if(autoWhitelistEnabled&&currentUserDid&&followState!=='loading'&&Date.now()-Math.max(followsUpdatedAt,followsStartedAt)>=FOLLOW_AGE)void autoWhitelistFollowedAccounts();},1000);
    window.addEventListener('pagehide',flushDecisionCache);document.addEventListener('visibilitychange',()=>{if(document.hidden)flushDecisionCache();else{void refreshEnvironment();rescanPosts();}});
  }catch(_){reportIssue('startup','Content Manager could not start. Open its settings or reload Bluesky to retry.');updateMenuCommand();}
}

main();

})();

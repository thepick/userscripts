const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const files = {bluesky:'bluesky-content-manager.user.js',reddit:'reddit-advanced-content-filter.user.js'};
function load(platform, values={}, hostname=platform==='bluesky'?'bsky.app':'www.reddit.com') {
  let source = fs.readFileSync(path.join(__dirname,'..',files[platform]),'utf8');
  source = source.replace(/^\s*main\(\);\s*$/m, `Object.assign(globalThis, {
    editor: typeof createPagedEditor === 'function' ? createPagedEditor : undefined,
    exportCurrent: exportBackup,
    parse: typeof parseBackup === 'function' ? parseBackup : undefined,
    create: typeof createUnifiedBackup === 'function' ? createUnifiedBackup : undefined,
    shared: typeof validateSharedFilters === 'function' ? validateSharedFilters : undefined,
    merge: typeof mergePlatformSettings === 'function' ? mergePlatformSettings : undefined,
    normalize: ${platform === 'bluesky' ? 'normalizeTerms' : 'normalizeList'},
    read: ${platform === 'bluesky' ? 'readSettings' : 'readConfiguration'},
    compile: ${platform === 'bluesky' ? 'compileTerms' : 'compileRules'},
    match: ${platform === 'bluesky' ? 'regexMatchAny' : 'matchBlock'},
    ${platform === 'reddit' ? 'setRules, decide: filterDecision, allowed: data => aiAllowed(null, data), edit: editFilter, undo: undoFilter, save: saveConfigurationDraft, defaults: aiDefaults, backupFilterDraft' : ''}
  });`);
  const storage = values instanceof Map ? values : new Map(Object.entries(values));
  const c = {console,URL,Blob,TextEncoder,crypto:webcrypto,performance,Date,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,
    getComputedStyle:()=>({lineHeight:"20px"}),window:{},document:{},location:{hostname},
    GM:{getValue:(k,d)=>Promise.resolve(storage.has(k)?storage.get(k):d), setValue:(k,v)=>storage.set(k,v), listValues:()=>Array.from(storage.keys())},
    GM_addStyle(){},GM_getValue:(k,d)=>storage.has(k)?storage.get(k):d,GM_setValue:(k,v)=>storage.set(k,v)};
  vm.createContext(c); vm.runInContext(source,c); return c;
}
module.exports = {load,files};

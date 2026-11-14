const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
for (const file of ['reddit-advanced-content-filter.user.js','bluesky-content-manager.user.js']) {
  test(file+' selects and validates Mammoth separately from Liquid',()=>{
    const code=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8');
    const c={crypto:require('node:crypto').webcrypto,URL,TextEncoder,GM_addStyle(){},GM_getValue:(_k,d)=>d,GM_setValue(){}};
    vm.createContext(c);vm.runInContext(code.replace(/\n\s*main\(\);\s*\n/,'\nObject.assign(globalThis,{aiBatchPayload,parseAIBatch,validateAI,aiDefaults});\n'),c);
    const model='baseten/mammoth-1', job={model,text:'baseball roster',topics:['Sports'],images:[]};
    assert.equal(c.validateAI({...c.aiDefaults,model}).model,model);
    assert.equal(c.aiBatchPayload([job],model).model,model);
    assert.throws(()=>c.aiBatchPayload([job,job],model));
    const response={model,answers:{post_0:{type:'choice',choice:'hide',probabilities:{hide:.9,keep:.05,uncertain:.05}}}};
    assert.equal(c.parseAIBatch(response,[job])[0].decision,'hide');
    assert.equal(c.parseAIBatch({...response,model:'liquid/d1-ultra'},[job])[0].decision,'uncertain');
  });
}

for (const platform of ['reddit','bluesky']) {
  test(platform+' imports the sports preset without platform-specific settings',()=>{
    const {load}=require('./filter-backup-harness.cjs');
    const script=load(platform);
    const json=fs.readFileSync(require('node:path').join(__dirname,'../docs/sports-filter-backup.json'),'utf8');
    const backup=script.parse(json);
    assert(backup.shared.blocklist.includes('bowl projections'));
    assert(backup.shared.blocklist.includes('mls referee of the year'));
    assert.equal(backup.shared.aiTopics.length,1);
    assert.equal(Object.keys(backup.platforms).length,0);
  });
}

// Node includes Acorn for its own parser; use that copy without adding a dependency.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
if(!source)throw Error('This Node version does not expose its bundled Acorn. Use Acorn with ecmaVersion:2015 to check the scripts.');
const moduleObject={exports:{}};vm.runInNewContext(source,{module:moduleObject,exports:moduleObject.exports});
for(const file of ['bluesky-content-manager.user.js','reddit-advanced-content-filter.user.js']){
 moduleObject.exports.parse(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{ecmaVersion:2015});console.log(file+': ES2015 syntax passed');
}

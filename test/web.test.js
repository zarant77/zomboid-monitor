const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function loadWeb(changedFile) {
  const context={Buffer,__dirname:path.resolve('src'),module:{exports:{}},require(name){
    if(name==='node:fs')return {...fs,readFileSync(filename,...args){
      const content=fs.readFileSync(filename,...args);
      return changedFile&&filename.endsWith(changedFile)?Buffer.concat([Buffer.from(content),Buffer.from('\n ')]):content;
    }};
    if(name==='../public/locales/en.json')return require('../public/locales/en.json');
    return require(name);
  }};
  vm.runInNewContext(fs.readFileSync('src/web.js','utf8'),context);
  return context.module.exports.serveAsset;
}
function request(serve,url) {
  let status,headers,body;
  const found=serve(url,{writeHead(code,value){status=code;headers=value;},end(value){body=value;}});
  return {found,status,headers,body};
}
function urls(html){return [...String(html).matchAll(/(?:src|href)="([^"]+\.(?:css|js))"/g)].map(m=>m[1]);}
test('HTML uses versioned CSS and JS and i18n loads matching versioned dictionaries',()=>{
  const serve=loadWeb();const page=request(serve,'/');
  assert.equal(page.headers['Cache-Control'],'no-store');
  const references=urls(page.body);assert.equal(references.length,6);
  for(const url of references){
    assert.match(url,/\.[a-f0-9]{16}\.(css|js)$/);
    const asset=request(serve,url);assert.equal(asset.status,200);
    assert.equal(asset.headers['Cache-Control'],'public, max-age=31536000, immutable');
  }
  const i18n=request(serve,references.find(url=>url.includes('/i18n.'))).body.toString();
  const template=i18n.match(/\/locales\/\$\{code\}\.[a-f0-9]{16}\.json/)[0];
  for(const code of ['en','uk']){
    const dictionary=request(serve,template.replace('${code}',code));
    assert.equal(dictionary.status,200);assert.ok(JSON.parse(dictionary.body).Deaths);
  }
  assert.equal(request(serve,'/styles.css').headers['Cache-Control'],'no-cache');
  assert.deepEqual(urls(request(serve,'/index.html').body),references);
  assert.equal(request(serve,'/styles.0000000000000000.css').found,false);
});
test('unchanged content keeps versions; CSS, JS and locale changes invalidate the whole bundle',()=>{
  const original=urls(request(loadWeb(),'/').body);
  assert.deepEqual(urls(request(loadWeb(),'/').body),original);
  for(const filename of ['styles.css','js/players.js','locales/uk.json']){
    const changed=urls(request(loadWeb(filename),'/').body);
    assert.equal(changed.length,original.length);
    changed.forEach((url,i)=>assert.notEqual(url,original[i]));
  }
});

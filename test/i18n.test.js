const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const en=require('../public/locales/en.json'),uk=require('../public/locales/uk.json'),de=require('../public/locales/de.json');
async function load(browserLanguage,saved,blocked=false) {
  let stored=saved;const events=[];
  const context={ZM:{},navigator:{language:browserLanguage},localStorage:{getItem(){if(blocked)throw Error('blocked');return stored;},setItem(key,value){if(blocked)throw Error('blocked');assert.equal(key,'zomboid-monitor.language');stored=value;}},
    document:{documentElement:{},querySelectorAll:()=>[],querySelector:()=>null,getElementById:()=>null,dispatchEvent:event=>events.push(event)},window:{addEventListener(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    fetch:async url=>({ok:true,json:async()=>url.includes('/uk.')?uk:url.includes('/de.')?de:en})};
  vm.runInNewContext(fs.readFileSync('public/js/i18n.js','utf8'),context);await context.ZM.i18nReady;
  return {context,stored:()=>stored,events};
}
test('locale files have matching keys and interpolation parameters',()=>{
  for(const dictionary of [uk,de]) {
  assert.deepEqual(Object.keys(en).sort(),Object.keys(dictionary).sort());
  for(const key of Object.keys(en))if(typeof en[key]==='string')assert.deepEqual([...en[key].matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort(),[...dictionary[key].matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort(),key);
  }
});
test('browser default, saved override, switching and unavailable localStorage',async()=>{
  for(const [browser,saved,expected] of [['de-DE',null,'de-DE'],['de-AT',null,'de-DE'],['en-US','de','de-DE'],['uk-UA',null,'uk-UA'],['en-US',null,'en-GB'],['fr-FR',null,'en-GB'],['uk-UA','en','en-GB'],['en-US','uk','uk-UA'],['uk-UA','invalid','uk-UA']]){
    const {context}=await load(browser,saved);assert.equal(context.ZM.locale(),expected);
  }
  const {context,stored,events}=await load('uk-UA',null);context.ZM.setLanguage('en');assert.equal(stored(),'en');assert.equal(context.document.documentElement.lang,'en');assert.equal(context.ZM.t('Online'),'Online');assert.equal(events.at(-1).type,'languagechange');
  context.ZM.setLanguage('invalid');assert.equal(stored(),'en');
  const blocked=await load('uk-UA',null,true);blocked.context.ZM.setLanguage('en');assert.equal(blocked.context.ZM.locale(),'en-GB');
});
test('Ukrainian relative time plural forms and template interpolation',async()=>{
  const {context:{ZM}}=await load('uk-UA');
  for(const [seconds,expected] of [[0,'щойно'],[2,'2 секунди тому'],[11,'11 секунд тому'],[21,'21 секунду тому'],[60,'1 хвилину тому'],[120,'2 хвилини тому'],[660,'11 хвилин тому'],[3600,'1 годину тому']])assert.equal(ZM.relativeAge(seconds),expected);
  assert.equal(ZM.t('playerJoin',{name:'Zar'}),'Zar приєднався');
});
test('server renders English metadata without JavaScript and serves locale assets',()=>{
  const {serveAsset}=require('../src/web');
  let body,status,mime;const response={writeHead(code,headers){status=code;mime=headers['Content-Type'];},end(value){body=String(value);}};
  assert.equal(serveAsset('/',response),true);assert.equal(status,200);
  assert.match(body,/<title[^>]*>28 Kills Later · Project Zomboid Server Monitor<\/title>/);
  assert.match(body,/property="og:title" content="28 Kills Later · Project Zomboid Server Monitor"/);
  assert.match(body,/aria-label="Switch to Ukrainian"/);
  serveAsset('/locales/uk.json',response);assert.match(mime,/application\/json/);assert.equal(JSON.parse(body).Online,'Онлайн');
});

test('German translations, relative time and locale asset',async()=>{
  const {context:{ZM}}=await load('de-DE');
  assert.equal(ZM.t('Books'),'Bücher');
  assert.equal(ZM.t('playerJoin',{name:'Zar'}),'Zar ist beigetreten');
  for(const [seconds,expected] of [[0,'gerade eben'],[1,'gerade eben'],[2,'vor 2 Sekunden'],[60,'vor 1 Minute'],[120,'vor 2 Minuten'],[3600,'vor 1 Stunde'],[7200,'vor 2 Stunden']])assert.equal(ZM.relativeAge(seconds),expected);
  const {serveAsset}=require('../src/web');
  let body;assert.equal(serveAsset('/locales/de.json',{writeHead(code){assert.equal(code,200);},end(value){body=String(value);}}),true);
  assert.equal(JSON.parse(body).Books,'Bücher');
  const html=fs.readFileSync('public/index.html','utf8');
  for(const code of ['en','uk','de'])assert.match(html,new RegExp('data-language="'+code+'"'));
  assert.doesNotMatch(html,/<span>(EN|UK|DE)<\/span>/);
});

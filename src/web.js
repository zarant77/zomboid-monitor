const fs = require('node:fs');
const path = require('node:path');
const publicPath = path.join(__dirname, '../public');
const english = require('../public/locales/en.json');
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function renderEnglish(html) {
  html=html.replace(/<(span|title)([^>]*data-i18n="([^"]+)"[^>]*)><\/\1>/g,(_,tag,attrs,key)=>`<${tag}${attrs}>${escape((english[key] ?? key).replace('{period}',english.period24h))}</${tag}>`);
  return html.replace(/<[^>]+data-i18n-(?:content|aria-label|title)=[^>]+>/g,tag=>{
    for(const attr of ['content','aria-label','title']) {
      const match=tag.match(new RegExp(`data-i18n-${attr}="([^"]+)"`));if(!match)continue;
      const value=escape(english[match[1]] ?? match[1]);
      const pattern=new RegExp(`(?<![\\w-])${attr}="[^"]*"`);
      tag=pattern.test(tag)?tag.replace(pattern,`${attr}="${value}"`):tag.replace(/>$/,` ${attr}="${value}">`);
    }
    return tag;
  });
}
const definitions = [
  ['/js/i18n.js', 'js/i18n.js', 'text/javascript; charset=utf-8'],
  ['/locales/en.json', 'locales/en.json', 'application/json; charset=utf-8'],
  ['/locales/uk.json', 'locales/uk.json', 'application/json; charset=utf-8'],
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/index.html', 'index.html', 'text/html; charset=utf-8'],
  ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
  ['/styles.css', 'styles.css', 'text/css; charset=utf-8'],
  ['/js/utils.js', 'js/utils.js', 'text/javascript; charset=utf-8'],
  ['/js/charts.js', 'js/charts.js', 'text/javascript; charset=utf-8'],
  ['/js/players.js', 'js/players.js', 'text/javascript; charset=utf-8'],
  ['/og-image.jpg', 'og-image.jpg', 'image/jpeg'],
  ['/og-image.png', 'og-image.png', 'image/png'],
  ['/hero.png', 'hero.png', 'image/png'],
  ['/hero.jpg', 'hero.jpg', 'image/jpeg'],
  ['/favicon.ico', 'favicon.ico', 'image/x-icon']
];
const assets = new Map(definitions.filter(([,name]) => fs.existsSync(path.join(publicPath,name)))
  .map(([url,name,mime]) => [url,{mime,content:fs.readFileSync(path.join(publicPath,name))}]));
// Keep the existing social image available until a PNG replacement is supplied.
if (!assets.has('/og-image.png') && assets.has('/og-image.jpg')) assets.set('/og-image.png',assets.get('/og-image.jpg'));
function serveAsset(pathname, res) {
  const asset = assets.get(pathname);
  if (!asset && pathname === '/favicon.ico') {
    res.writeHead(204, { 'Cache-Control': 'no-cache' }); res.end(); return true;
  }
  if (!asset) return false;
  res.writeHead(200, { 'Content-Type': asset.mime, 'Cache-Control': 'no-cache' });
  if (pathname === '/' || pathname === '/index.html') {
    const hero = assets.has('/hero.png') ? '/hero.png' : assets.has('/hero.jpg') ? '/hero.jpg' : '';
    res.end(renderEnglish(asset.content.toString()).replace('data-hero=""', `data-hero="${hero}"`));
  } else res.end(asset.content);
  return true;
}
module.exports = { serveAsset };

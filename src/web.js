const fs = require('node:fs');
const path = require('node:path');
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
].map(([url, [name, mime]]) => [url, { mime, content: fs.readFileSync(path.join(__dirname, '../public', name)) }]));
function serveAsset(pathname, res) {
  const asset = assets.get(pathname);
  if (!asset) return false;
  res.writeHead(200, { 'Content-Type': asset.mime, 'Cache-Control': 'no-cache' }); res.end(asset.content); return true;
}
module.exports = { serveAsset };

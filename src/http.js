const http = require('node:http');
const { serveAsset } = require('./web');
function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function createServer(repository, monitor) {
  return http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: 'Method not allowed' }); }
      if (url.pathname === '/health') {
        const s = repository.status();
        return json(res, monitor.running ? 200 : 503, { status: monitor.running ? 'ok' : 'stopping', monitorRunning: monitor.running, lastCheck: s.updatedAt, serverOnline: s.online });
      }
      const routes = {
        '/api/status': () => repository.status(), '/api/players': () => repository.players(true),
        '/api/leaderboard': () => repository.players(), '/api/stats': () => repository.stats(),
        '/api/history': () => repository.history(url.searchParams.get('period') || '24h'),
        '/api/mods': () => repository.mods(), '/api/events': () => {
          const n = Number(url.searchParams.get('limit') ?? 50);
          if (!Number.isSafeInteger(n) || n < 1) throw new RangeError('limit must be a positive integer');
          return repository.events(Math.min(n, 200));
        }
      };
      const playerMatch = url.pathname.match(/^\/api\/player\/(\d+)$/);
      if (playerMatch) {
        const id = Number(playerMatch[1]);
        if (!Number.isSafeInteger(id) || id < 1) throw new RangeError('Invalid player id');
        const player = repository.player(id);
        return json(res, player ? 200 : 404, player || { error: 'Player not found' });
      }
      if (routes[url.pathname]) return json(res, 200, routes[url.pathname]());
      if (!serveAsset(url.pathname, res)) json(res, 404, { error: 'Not found' });
    } catch (error) {
      if (!(error instanceof RangeError)) console.error('HTTP request failed:', error);
      json(res, error instanceof RangeError ? 400 : 500, { error: error instanceof RangeError ? error.message : 'Internal server error' });
    }
  });
}
module.exports = { createServer };

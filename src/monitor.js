const { GameDig } = require('gamedig');
const { normalize } = require('./utils');
class Monitor {
  constructor(repository, config, query = options => GameDig.query(options)) {
    this.repository = repository; this.config = config; this.query = query;
    this.running = false; this.timer = null; this.inFlight = null;
  }
  start() { if (!this.running) { this.running = true; this.tick(); } }
  tick() {
    this.inFlight = this.check().catch(error => {
      console.error('Persistence failure:', error); this.running = false;
      if (this.onFatal) this.onFatal(error);
    }).finally(() => {
      if (this.running) this.timer = setTimeout(() => this.tick(), this.config.interval);
    });
  }
  async check() {
    let result;
    try {
      result = normalize(await this.query({ type: 'projectzomboid', host: this.config.host, port: this.config.gamePort,
        requestRules: true, requestRulesRequired: false, socketTimeout: 3000, attemptTimeout: 5000, maxRetries: 0,
        givenPortOnly: true }), this.config);
    } catch (error) {
      result = { online: false, error: String(error.message || error).slice(0, 2000) };
      console.warn('Game query failed:', result.error);
    }
    this.repository.record(result);
  }
  async stop() { this.running = false; clearTimeout(this.timer); await this.inFlight; }
}
module.exports = { Monitor };

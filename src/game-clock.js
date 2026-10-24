class GameClock {
  constructor(db) { this.db=db; }
  read() {
    const row=this.db.prepare('SELECT * FROM game_clock WHERE id=1').get();
    const minutes=row.game_minutes == null ? null : Math.floor(row.game_minutes + 1e-8) % 1440;
    return { dayMinutes:row.day_minutes, time:minutes == null ? null : `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`, syncedAt:row.synced_at, observedAt:row.observed_at, estimated:true };
  }
  configure(dayMinutes,time,userId,now=Date.now()) {
    if (typeof dayMinutes !== 'number' || !Number.isFinite(dayMinutes) || dayMinutes < 1 || dayMinutes > 10080 || typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new RangeError('Invalid game clock settings');
    const [hours,minutes]=time.split(':').map(Number);
    this.db.prepare('UPDATE game_clock SET day_minutes=?,game_minutes=?,observed_at=?,synced_at=?,updated_by=? WHERE id=1').run(dayMinutes,hours*60+minutes,now,now,userId);
    return this.read();
  }
  observe(at,elapsed,wasOnline,online) {
    const now=Date.parse(at),row=this.db.prepare('SELECT * FROM game_clock WHERE id=1').get();
    if(row.game_minutes == null || !Number.isFinite(now)) return;
    const seconds=wasOnline && online && row.observed_at != null ? Math.max(0,(now-Math.max(now-elapsed*1000,row.observed_at))/1000) : 0;
    this.db.prepare('UPDATE game_clock SET game_minutes=?,observed_at=? WHERE id=1').run((row.game_minutes+seconds*24/row.day_minutes)%1440,Math.max(now,row.observed_at || now));
  }
}
module.exports={GameClock};

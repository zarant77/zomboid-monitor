const DEFAULT_SERVER_TIMEZONE = '+01:00';
function createServerDayClock(timeZone = DEFAULT_SERVER_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' });
  const day = at => {
    const parts = Object.fromEntries(formatter.formatToParts(at).map(p => [p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  let cachedDay, cachedStart;
  return now => {
    const currentDay = day(now);
    if (currentDay === cachedDay) return cachedStart;
    // Locate the first instant of this local date, including DST transitions.
    let low = now-48*3600000, high = now;
    while (high-low > 1) {
      const middle = Math.floor((low+high)/2);
      if (day(middle) < currentDay) low=middle; else high=middle;
    }
    cachedDay=currentDay; cachedStart=new Date(high).toISOString();
    return cachedStart;
  };
}
module.exports = { DEFAULT_SERVER_TIMEZONE, createServerDayClock };

(async () => {
  await ZM.i18nReady;
  const {$,text,escapeHtml,icon,number,timestamp,time,duration,bool,ping,get,keyed,metrics,segments,safeDescription,t}=ZM;
  const state={status:null,players:[],board:[],stats:null,events:[],mods:null,history:null,period:'24h',playerFilter:'all',sortKey:'currentKills',sortDirection:'desc',eventFilter:'all',eventLimit:12,historyRequest:0,connectionError:null,historyError:null,feedback:null};
  function renderServer(s) {
    const label=s.online==null?t("WAITING"):s.stale?t("STALE"):s.online?t("ONLINE"):t("OFFLINE");
    text('status-label',label);$('status').className=`live-status ${s.stale||s.online==null?'waiting':s.online?'online':'offline'}`;
    text('hero-subtitle',s.name);text('server-name',s.name);text('address',`${s.host}:${s.port}`);
    text('server-error',s.error || (s.stale?t("Waiting for a fresh monitor check."):''));
    const badges=[
      {key:'pvp',label:s.pvp==null?t("PvP unknown"):s.pvp?t('PvP'):t("PvE"),good:s.pvp===false,icon:'swords'},
      {key:'public',label:s.public==null?t("Visibility unknown"):s.public?t("Public"):t("Private"),good:s.public===true,icon:'players'},
      {key:'open',label:s.open==null?t("Access unknown"):s.open?t("Open"):t("Closed"),good:s.open===true,icon:'server'},
      {key:'secure',label:s.secure==null?t("Security unknown"):s.secure?t("Secure"):t("Not secure"),good:s.secure===true,icon:'shield'},
      {key:'password',label:s.password==null?t("Password unknown"):s.password?t("Password"):t("No Password"),good:false,icon:'lock'}
    ];
    keyed($('server-badges'),badges,b=>b.key,b=>{const node=document.createElement('span');node.innerHTML=`${icon(b.icon)}<span></span>`;return node;},(node,b)=>{node.className=`badge ${b.good?'good':''}`;node.lastChild.textContent=b.label;});
    metrics($('server-metrics'),[
      {label:t('Players'),value:s.players==null?'—':`${number(s.players)} / ${number(s.maxPlayers)}`,icon:'players'},
      {label:t("Ping"),value:ping(s.ping),icon:'chart',tone:s.ping==null?'':s.ping<80?'tone-green':s.ping<=150?'tone-amber':'tone-red'},
      {label:t("Version"),value:s.version,icon:'box'}, {label:t('Mods'),value:number(s.modCount),icon:'mods'},
      {label:t('PvP'),value:bool(s.pvp),icon:'swords'}, {label:t("OS"),value:s.environment,icon:'server'}
    ]);
    const fields=[['Name',s.name],['IP:Port',`${s.host}:${s.port}`],['Version',s.version],['Mods',t('modsReported',{total:number(s.modCount),reported:number(s.modsReported ?? 0)})],
      ['PvP',bool(s.pvp),s.pvp===false],['Open',bool(s.open),s.open===true],['Public',bool(s.public),s.public===true],
      ['Secure',s.secure===true?t('Yes (Steam)'):bool(s.secure),s.secure===true],['Password',bool(s.password)],['OS',s.environment],['Last metadata',timestamp(s.metadataUpdatedAt)]];
    keyed($('server-info'),fields,f=>f[0],f=>{
      const node=document.createElement('div');node.className='info-row';node.innerHTML='<dt></dt><dd></dd>';
      if(f[0]==='IP:Port')node.lastChild.innerHTML=`<div class="address-line"><span class="mono"></span><button class="icon-button copy-address">${icon('copy')}</button></div>`;
      return node;
    },(node,f)=>{
      node.firstChild.textContent=t(f[0]);const dd=node.lastChild;dd.className=f[2]?'green':'';
      if(f[0]==='IP:Port'){dd.querySelector('span').textContent=f[1];dd.querySelector('button').setAttribute('aria-label',t('Copy server address'));}else dd.textContent=f[1]??'—';
    });
    safeDescription($('description'),s.description || t("No description reported."));
  }
  function renderPlayers() {
    ZM.tableRows('players',state.players.slice().sort((a,b)=>b.currentKills-a.currentKills));
    text('online-count',`(${state.players.length})`);
    const s=state.status;
    text('players-note',s.online&&s.playersReported==null?t("Player list unavailable; showing last observed presence."):s.online&&s.players>state.players.length?t("Server count exceeds reported names; only named players can be tracked."):t("Joined is the time this monitor first observed the current session."));
    const rankMap=new Map(ZM.sortLeaderboard(state.board,'currentKills','desc',ZM.locale()).map((p,i)=>[p.id,i+1]));
    const filtered=state.board.filter(p=>state.playerFilter==='all'||(state.playerFilter==='online'?p.online:!p.online));
    ZM.tableRows('leaderboard',ZM.sortLeaderboard(filtered,state.sortKey,state.sortDirection,ZM.locale()),true,rankMap);
    document.querySelectorAll('.leaderboard-table th[data-sort]').forEach(header=>{
      const active=header.dataset.sort===state.sortKey;
      if(active)header.setAttribute('aria-sort',state.sortDirection==='asc'?'ascending':'descending');
      else header.removeAttribute('aria-sort');
      header.querySelector('.sort-arrow').textContent=active?(state.sortDirection==='asc'?'↑':'↓'):'';
    });
  }
  function renderStats() {
    const h=state.history,s=state.stats;if(!s)return;
    const summary=h?.summary;
    metrics($('stats-metrics'),[
      {label:t("Availability"),value:summary?.availability==null?'—':`${new Intl.NumberFormat(ZM.locale(),{minimumFractionDigits:2,maximumFractionDigits:2}).format(summary.availability)}%`},
      {label:t("Peak players"),value:number(summary?.peakPlayers)}, {label:t("Average ping"),value:ping(summary?.avgPing)},
      {label:t("Min ping"),value:ping(summary?.minPing)}, {label:t("Max ping"),value:ping(summary?.maxPing)},
      {label:t("Tracked players (all)"),value:number(s.trackedPlayers)}, {label:t("Total checks"),value:number(summary?.totalChecks)},
      {label:t("Failures"),value:number(summary?.failedChecks)}
    ]);
    text('state-note',t('stateNote',{state:t(state.status?.online?'uptime':'state'),duration:duration(s.currentStateSeconds),downtime:duration(s.downtimeSeconds)}));
    const periods={'24h':'period24h','7d':'period7d','30d':'period30d'};
    text('chart-title',t('chartTitle',{period:t(periods[state.period])}));
    if(h){text('chart-empty',t("No samples in this period yet."));ZM.renderChart(h);}
    else {
      const windowMs={'24h':86400000,'7d':7*86400000,'30d':30*86400000}[state.period];
      ZM.renderChart({samples:[],period:state.period,from:new Date(Date.now()-windowMs).toISOString(),to:new Date().toISOString(),bucketSeconds:600});
      text('chart-empty',t("Loading history\u2026"));
    }
  }
  function renderEvents() {
    const filtered=state.events.filter(e=>state.eventFilter==='all'||(state.eventFilter==='server'?e.source==='server':e.eventType===state.eventFilter));
    const shown=filtered.slice(0,state.eventLimit);
    keyed($('events'),shown,e=>`${e.source}:${e.id}`,()=>{
      const li=document.createElement('li');li.innerHTML='<time></time><span class="event-symbol" aria-hidden="true"></span><span class="event-message"></span>';return li;
    },(node,e)=>{
      node.className=`event-${e.eventType}`;node.children[0].textContent=time(e.createdAt);node.children[0].title=timestamp(e.createdAt);
      node.children[1].textContent=({join:'↗',leave:'↘',death:'☠',server_up:'●',server_down:'!'}[e.eventType] || '·');
      node.children[2].textContent=e.source==='server'?(e.eventType==='server_up'?t("Server responding"):t('serverDown',{error:e.message})):t(e.eventType==='join'?'playerJoin':e.eventType==='death'?'playerDeath':'playerLeave',{name:e.player ?? e.name ?? e.message.replace(/ (joined|left)$/,'')});
    });
    $('load-events').hidden=shown.length>=filtered.length;
    text('events-note',!filtered.length?t("No matching events."):filtered.length>=200?t("Showing the latest 200 fetched events."):t('eventCount',{shown:number(shown.length),total:number(filtered.length)}));
  }
  function renderMods(m) {
    text('mods-total',number(m.totalCount));text('mods-reported',number(m.reportedCount));
    $('mods-warning').hidden=m.complete;
    text('mods-warning-text',m.totalCount==null?t('modsUnknown',{reported:number(m.reportedCount)}):
      t('modsIncomplete',{reported:number(m.reportedCount),total:number(m.totalCount)}));
    keyed($('mods'),m.mods,id=>id,()=>{const node=document.createElement('span');node.className='mod-tag';return node;},(node,id)=>{node.textContent=id;});
    text('mods-missing',m.totalCount!=null&&m.totalCount>m.reportedCount?t('modsMissing',{count:number(m.totalCount-m.reportedCount)}):m.complete?t("All declared mod IDs reported."):'');
  }
  const refreshInterval=5000,refreshProgress=$('refresh-progress'),refreshMarker=refreshProgress.closest('.status-marker');
  let nextRefreshAt=null;
  function animateRefresh(now) {
    if(nextRefreshAt!==null){
      const remaining=Math.max(0,Math.min(1,(nextRefreshAt-now)/refreshInterval));
      refreshProgress.style.strokeDashoffset=String(100*(1-remaining));
    }
    requestAnimationFrame(animateRefresh);
  }
  async function loadHistory() {
    const request=++state.historyRequest,period=state.period;
    try{const history=await get(`history?period=${period}`);if(request===state.historyRequest){state.history=history;state.historyError=null;renderStats();text('stats-note',t("Period statistics \u00b7 tracked players across all history"));}}
    catch(error){if(request===state.historyRequest){state.historyError=error.message;text('stats-note',t('historyError',{error:error.message}));}}
  }
  async function update() {
    nextRefreshAt=null;refreshMarker.classList.add('refreshing');refreshProgress.style.strokeDashoffset='75';
    try{
      const [status,players,board,stats,events,mods]=await Promise.all(['status','players','leaderboard','stats','events?limit=200','mods'].map(get));
      Object.assign(state,{status,players,board,stats,events,mods,connectionError:null});
      state.feedback=null;text('connection-message','');renderServer(status);renderPlayers();renderEvents();renderMods(mods);
      await Promise.all([loadHistory(),ZM.refreshPlayer()]);
    }catch(error){
      state.connectionError=error.message;text('connection-message',t('connectionError',{error:error.message}));
      text('status-label',t("STALE"));$('status').className='live-status waiting';
    }finally{refreshMarker.classList.remove('refreshing');nextRefreshAt=performance.now()+refreshInterval;setTimeout(update,refreshInterval);}
  }
  document.querySelector('.leaderboard-table thead').addEventListener('click',event=>{
    const button=event.target.closest('button[data-sort]');if(!button)return;
    const key=button.dataset.sort;
    state.sortDirection=state.sortKey===key?(state.sortDirection==='asc'?'desc':'asc'):
      key==='name'||key==='rank'?'asc':'desc';
    state.sortKey=key;renderPlayers();
  });
  $('leaderboard-filter').addEventListener('click',event=>{const b=event.target.closest('button[data-filter]');if(!b)return;state.playerFilter=b.dataset.filter;segments($('leaderboard-filter'),'filter',state.playerFilter);renderPlayers();});
  $('event-filter').addEventListener('click',event=>{const b=event.target.closest('button[data-event]');if(!b)return;state.eventFilter=b.dataset.event;state.eventLimit=12;segments($('event-filter'),'event',state.eventFilter);renderEvents();});
  $('period-filter').addEventListener('click',event=>{const b=event.target.closest('button[data-period]');if(!b)return;state.period=b.dataset.period;segments($('period-filter'),'period',state.period);state.history=null;renderStats();void loadHistory();});
  $('load-events').addEventListener('click',()=>{state.eventLimit+=12;renderEvents();});
  document.addEventListener('click',async event=>{
    const button=event.target.closest('.copy-address');if(!button||!state.status)return;
    const address=`${state.status.host}:${state.status.port}`;
    try{await navigator.clipboard.writeText(address);state.feedback={key:'copied',params:{address}};text('connection-message',t('copied',{address}));button.setAttribute('aria-label',t("Server address copied"));}
    catch{state.feedback={key:'copyUnavailable',params:{address}};text('connection-message',t('copyUnavailable',{address}));}
  });
  document.addEventListener('languagechange',()=>{
    if(state.status){renderServer(state.status);renderPlayers();renderEvents();renderMods(state.mods);renderStats();}
    ZM.relocalizePlayer();
    if(state.connectionError){text('connection-message',t('connectionError',{error:state.connectionError}));text('status-label',t('STALE'));$('status').className='live-status waiting';}
    else if(state.feedback)text('connection-message',t(state.feedback.key,state.feedback.params));
    text('stats-note',state.historyError?t('historyError',{error:state.historyError}):t('Period statistics · tracked players across all history'));
  });
  const hero=document.querySelector('.hero'),source=hero.dataset.hero;
  if(source){const image=new Image();image.onload=()=>{hero.style.setProperty('--hero-image',`url("${source}")`);hero.classList.add('has-image');};image.src=source;}
  ZM.setupChart();ZM.setupPlayers();requestAnimationFrame(animateRefresh);void update();
})();

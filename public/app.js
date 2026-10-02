(() => {
  const {$,text,escapeHtml,icon,number,timestamp,time,duration,bool,ping,get,keyed,metrics,segments,safeDescription}=ZM;
  const state={status:null,players:[],board:[],stats:null,events:[],mods:null,history:null,period:'24h',playerFilter:'all',eventFilter:'all',eventLimit:12,historyRequest:0,connectionError:null};
  function renderServer(s) {
    const label=s.online==null?'WAITING':s.stale?'STALE':s.online?'ONLINE':'OFFLINE';
    text('status-label',label);$('status').className=`live-status ${s.stale||s.online==null?'waiting':s.online?'online':'offline'}`;
    text('server-name',s.name);text('address',`${s.host}:${s.port}`);text('exact-check',timestamp(s.updatedAt));
    text('server-error',s.error || (s.stale?'Waiting for a fresh monitor check.':''));
    const badges=[
      {key:'pvp',label:s.pvp==null?'PvP unknown':s.pvp?'PvP':'PvE',good:s.pvp===false,icon:'swords'},
      {key:'public',label:s.public==null?'Visibility unknown':s.public?'Public':'Private',good:s.public===true,icon:'players'},
      {key:'open',label:s.open==null?'Access unknown':s.open?'Open':'Closed',good:s.open===true,icon:'server'},
      {key:'secure',label:s.secure==null?'Security unknown':s.secure?'Secure':'Not secure',good:s.secure===true,icon:'shield'},
      {key:'password',label:s.password==null?'Password unknown':s.password?'Password':'No Password',good:false,icon:'lock'}
    ];
    keyed($('server-badges'),badges,b=>b.key,b=>{const node=document.createElement('span');node.innerHTML=`${icon(b.icon)}<span></span>`;return node;},(node,b)=>{node.className=`badge ${b.good?'good':''}`;node.lastChild.textContent=b.label;});
    metrics($('server-metrics'),[
      {label:'Players',value:s.players==null?'—':`${number(s.players)} / ${number(s.maxPlayers)}`,icon:'players'},
      {label:'Ping',value:ping(s.ping),icon:'chart',tone:s.ping==null?'':s.ping<80?'tone-green':s.ping<=150?'tone-amber':'tone-red'},
      {label:'Version',value:s.version,icon:'box'}, {label:'Mods',value:number(s.modCount),icon:'mods'},
      {label:'PvP',value:bool(s.pvp),icon:'swords'}, {label:'OS',value:s.environment,icon:'server'}
    ]);
    const fields=[['Name',s.name],['IP:Port',`${s.host}:${s.port}`],['Version',s.version],['Mods',`${number(s.modCount)} (${s.modsReported ?? 0} reported)`],
      ['PvP',bool(s.pvp),s.pvp===false],['Open',bool(s.open),s.open===true],['Public',bool(s.public),s.public===true],
      ['Secure',s.secure===true?'Yes (Steam)':bool(s.secure),s.secure===true],['Password',bool(s.password)],['OS',s.environment],['Last metadata',timestamp(s.metadataUpdatedAt)]];
    keyed($('server-info'),fields,f=>f[0],f=>{
      const node=document.createElement('div');node.className='info-row';node.innerHTML='<dt></dt><dd></dd>';
      node.firstChild.textContent=f[0];
      if(f[0]==='IP:Port')node.lastChild.innerHTML=`<div class="address-line"><span class="mono"></span><button class="icon-button copy-address" aria-label="Copy server address">${icon('copy')}</button></div>`;
      return node;
    },(node,f)=>{
      const dd=node.lastChild;dd.className=f[2]?'green':'';
      if(f[0]==='IP:Port')dd.querySelector('span').textContent=f[1];else dd.textContent=f[1]??'—';
    });
    safeDescription($('description'),s.description || 'No description reported.');
    renderRelative();
  }
  function renderPlayers() {
    ZM.tableRows('players',state.players.slice().sort((a,b)=>b.currentKills-a.currentKills));
    text('online-count',`(${state.players.length})`);
    const s=state.status;
    text('players-note',s.online&&s.playersReported==null?'Player list unavailable; showing last observed presence.':s.online&&s.players>state.players.length?'Server count exceeds reported names; only named players can be tracked.':'Joined is the time this monitor first observed the current session.');
    const rankMap=new Map(state.board.map((p,i)=>[p.id,i+1]));
    const filtered=state.board.filter(p=>state.playerFilter==='all'||(state.playerFilter==='online'?p.online:!p.online));
    ZM.tableRows('leaderboard',filtered,true,rankMap);
  }
  function renderStats() {
    const h=state.history,s=state.stats;if(!s)return;
    const summary=h?.summary;
    metrics($('stats-metrics'),[
      {label:'Availability',value:summary?.availability==null?'—':`${summary.availability.toFixed(2)}%`},
      {label:'Peak players',value:number(summary?.peakPlayers)}, {label:'Average ping',value:ping(summary?.avgPing)},
      {label:'Min ping',value:ping(summary?.minPing)}, {label:'Max ping',value:ping(summary?.maxPing)},
      {label:'Tracked players (all)',value:number(s.trackedPlayers)}, {label:'Total checks',value:number(summary?.totalChecks)},
      {label:'Failures',value:number(summary?.failedChecks)}
    ]);
    text('state-note',`Current ${state.status?.online?'uptime':'state'}: ${duration(s.currentStateSeconds)} · Observed downtime (all history): ${duration(s.downtimeSeconds)}`);
    const periods={'24h':'24 hours','7d':'7 days','30d':'30 days'};
    text('chart-title',`Players & Ping (last ${periods[state.period]})`);
    if(h){text('chart-empty','No samples in this period yet.');ZM.renderChart(h);}
    else {
      const windowMs={'24h':86400000,'7d':7*86400000,'30d':30*86400000}[state.period];
      ZM.renderChart({samples:[],period:state.period,from:new Date(Date.now()-windowMs).toISOString(),to:new Date().toISOString(),bucketSeconds:600});
      text('chart-empty','Loading history…');
    }
  }
  function renderEvents() {
    const filtered=state.events.filter(e=>state.eventFilter==='all'||(state.eventFilter==='server'?e.source==='server':e.eventType===state.eventFilter));
    const shown=filtered.slice(0,state.eventLimit);
    keyed($('events'),shown,e=>`${e.source}:${e.id}`,()=>{
      const li=document.createElement('li');li.innerHTML='<time></time><span class="event-symbol" aria-hidden="true"></span><span class="event-message"></span>';return li;
    },(node,e)=>{
      node.className=`event-${e.eventType}`;node.children[0].textContent=time(e.createdAt);node.children[0].title=timestamp(e.createdAt);
      node.children[1].textContent=({join:'↗',leave:'↘',server_up:'●',server_down:'!'}[e.eventType] || '·');
      node.children[2].textContent=e.source==='server'?(e.eventType==='server_up'?'Server responding':`SERVER DOWN · ${e.message}`):e.message;
    });
    $('load-events').hidden=shown.length>=filtered.length;
    text('events-note',!filtered.length?'No matching events.':filtered.length>=200?'Showing the latest 200 fetched events.':`${shown.length} of ${filtered.length} recent events`);
  }
  function renderMods(m) {
    text('mods-total',number(m.totalCount));text('mods-reported',number(m.reportedCount));
    $('mods-warning').hidden=m.complete;
    text('mods-warning-text',m.totalCount==null?`Server reports ${m.reportedCount} mod IDs. The total is unknown, so completeness cannot be verified.`:
      `Server reports only ${m.reportedCount} mod IDs. Total number of mods is ${m.totalCount}, so the list is incomplete.`);
    keyed($('mods'),m.mods,id=>id,()=>{const node=document.createElement('span');node.className='mod-tag';return node;},(node,id)=>{node.textContent=id;});
    text('mods-missing',m.totalCount!=null&&m.totalCount>m.reportedCount?`${m.totalCount-m.reportedCount} IDs not reported`:m.complete?'All declared mod IDs reported.':'');
  }
  function renderRelative() {
    const at=state.status?.updatedAt;
    if(!at){text('relative-check','Waiting for first check');return;}
    const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(at))/1000));
    const ago=seconds<2?'just now':seconds<60?`${seconds} seconds ago`:seconds<3600?`${Math.floor(seconds/60)} minute${seconds<120?'':'s'} ago`:`${Math.floor(seconds/3600)} hour${seconds<7200?'':'s'} ago`;
    text('relative-check',`Last check: ${ago}`);
  }
  async function loadHistory() {
    const request=++state.historyRequest,period=state.period;
    try{const history=await get(`history?period=${period}`);if(request===state.historyRequest){state.history=history;renderStats();text('stats-note','Period statistics · tracked players across all history');}}
    catch(error){if(request===state.historyRequest)text('stats-note',`History unavailable: ${error.message}`);}
  }
  async function update() {
    try{
      const [status,players,board,stats,events,mods]=await Promise.all(['status','players','leaderboard','stats','events?limit=200','mods'].map(get));
      Object.assign(state,{status,players,board,stats,events,mods,connectionError:null});
      text('connection-message','');renderServer(status);renderPlayers();renderEvents();renderMods(mods);
      await Promise.all([loadHistory(),ZM.refreshPlayer()]);
    }catch(error){
      state.connectionError=error.message;text('connection-message',`Monitor connection failed: ${error.message}. Retrying…`);
      text('status-label','STALE');$('status').className='live-status waiting';
    }finally{setTimeout(update,5000);}
  }
  $('leaderboard-filter').addEventListener('click',event=>{const b=event.target.closest('button[data-filter]');if(!b)return;state.playerFilter=b.dataset.filter;segments($('leaderboard-filter'),'filter',state.playerFilter);renderPlayers();});
  $('event-filter').addEventListener('click',event=>{const b=event.target.closest('button[data-event]');if(!b)return;state.eventFilter=b.dataset.event;state.eventLimit=12;segments($('event-filter'),'event',state.eventFilter);renderEvents();});
  $('period-filter').addEventListener('click',event=>{const b=event.target.closest('button[data-period]');if(!b)return;state.period=b.dataset.period;segments($('period-filter'),'period',state.period);state.history=null;renderStats();void loadHistory();});
  $('load-events').addEventListener('click',()=>{state.eventLimit+=12;renderEvents();});
  document.addEventListener('click',async event=>{
    const button=event.target.closest('.copy-address');if(!button||!state.status)return;
    const address=`${state.status.host}:${state.status.port}`;
    try{await navigator.clipboard.writeText(address);text('connection-message',`Copied ${address}`);button.setAttribute('aria-label','Server address copied');}
    catch{text('connection-message',`Copy unavailable. Server address: ${address}`);}
  });
  const hero=document.querySelector('.hero'),source=hero.dataset.hero;
  if(source){const image=new Image();image.onload=()=>{hero.style.setProperty('--hero-image',`url("${source}")`);hero.classList.add('has-image');};image.src=source;}
  ZM.setupChart();ZM.setupPlayers();setInterval(renderRelative,1000);void update();
})();

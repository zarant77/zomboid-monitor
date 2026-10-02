(() => {
  const {$,escapeHtml,number,timestamp,time,duration,keyed,metrics,get}=ZM;
  let selectedId=null,opener=null,details=null;
  const statusMarkup = online=>`<span class="player-status ${online ? 'online' : ''}"><span class="dot ${online ? 'green' : ''}"></span>${online ? 'Online' : 'Offline'}</span>`;
  function tableRows(id,list,leaderboard=false,rankMap=new Map()) {
    const container=$(id),cols=leaderboard?8:5;
    keyed(container,list.length?list:[{id:'empty'}],p=>p.id,p=>{
      const tr=document.createElement('tr');
      if(p.id==='empty'){tr.className='empty-row';tr.innerHTML=`<td colspan="${cols}">No ${leaderboard?'matching players':'players online'}.</td>`;return tr;}
      const labels=leaderboard?['Rank','Player','Kills','Status','Last seen','First seen','Best session','Gain (tracked)']:['Rank','Player','Kills','Session','Joined'];
      tr.innerHTML=labels.map(label=>`<td data-label="${label}"></td>`).join('');
      tr.children[1].innerHTML=`<div class="player-cell"><span class="dot"></span><button class="player-button" data-player-id="${p.id}">${escapeHtml(p.name)}</button></div>`;
      tr.children[2].className='kills';
      return tr;
    },(tr,p,index)=>{
      if(p.id==='empty')return;
      const cells=tr.children;cells[0].textContent=leaderboard?rankMap.get(p.id):index+1;
      cells[1].querySelector('.dot').className=`dot ${p.online ? 'green' : ''}`;
      cells[2].textContent=number(leaderboard?p.maxKills:p.currentKills);
      if(leaderboard){
        const markup=statusMarkup(p.online);if(cells[3].innerHTML!==markup)cells[3].innerHTML=markup;
        cells[4].textContent=p.online?'Now':timestamp(p.lastSeen);cells[5].textContent=timestamp(p.firstSeen);
        cells[6].textContent=duration(p.longestSessionSeconds);cells[7].textContent=`+${number(p.trackedKillGain)}`;cells[7].className='gain';
        cells[7].title=`Positive deltas tracked since ${timestamp(p.gainTrackedSince)}`;
      }else{cells[3].textContent=duration(p.currentSessionSeconds);cells[4].textContent=time(p.joinedAt);cells[4].title=p.joinedAt?`First observed in this session: ${timestamp(p.joinedAt)}`:'Join time unknown';}
    });
  }
  function renderDetails(player) {
    details=player;$('player-dialog-title').textContent=player.name;
    $('player-dialog-status').innerHTML=statusMarkup(player.online);
    metrics($('player-details'),[
      {label:'Current kills',value:number(player.currentKills)}, {label:'Highest observed kills',value:number(player.maxKills)},
      {label:'Tracked kill gain',value:`+${number(player.trackedKillGain)}`,tone:'tone-green'},
      {label:'First seen',value:timestamp(player.firstSeen)}, {label:'Last seen',value:player.online?'Now':timestamp(player.lastSeen)},
      {label:player.online?'Current session':'Last observed session',value:duration(player.currentSessionSeconds)},
      {label:'Longest observed session',value:duration(player.longestSessionSeconds)},
      {label:'Observed sessions',value:number(player.observedSessions)}, {label:'Join count',value:number(player.joinCount)}
    ]);
    const events=(player.events||[]).slice().reverse(),timeline=$('player-timeline');
    if(!events.length){timeline.className='player-timeline empty';timeline.textContent='No event snapshots available.';}
    else{
      timeline.className='player-timeline';const peak=Math.max(1,...events.map(e=>e.kills));
      keyed(timeline,events,(e,i)=>`${e.createdAt}:${e.eventType}:${i}`,()=>document.createElement('div'),(node,e)=>{
        node.className=`snapshot-bar ${e.eventType}`;node.style.height=`${Math.max(4,e.kills/peak*100)}%`;
        node.title=`${timestamp(e.createdAt)} · ${e.eventType} · ${number(e.kills)} kills · ${duration(e.sessionSeconds)}`;
      });
    }
    $('player-detail-note').textContent=`Gain tracked since ${timestamp(player.gainTrackedSince)}. Initial kills are excluded. Sessions and join counts reflect observed joins; outages can split a session. Bars show event snapshots, not a continuous kills history.`;
  }
  async function refreshPlayer() {
    if(selectedId===null)return;
    const id=selectedId;
    try{const player=await get(`player/${id}`);if(selectedId===id)renderDetails(player);}
    catch(error){if(selectedId===id)$('player-detail-note').textContent=`Unable to load player: ${error.message}`;}
  }
  function setupPlayers() {
    const dialog=$('player-dialog');
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-player-id]');if(!button)return;
      opener=button;selectedId=Number(button.dataset.playerId);details=null;
      $('player-dialog-title').textContent=button.textContent;$('player-dialog-status').textContent='Loading…';
      $('player-details').replaceChildren();$('player-timeline').replaceChildren();$('player-detail-note').textContent='';
      dialog.showModal();$('close-player').focus();void refreshPlayer();
    });
    $('close-player').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=>{
      if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}
    });
    dialog.addEventListener('close',()=>{selectedId=null;details=null;if(opener?.isConnected)opener.focus();opener=null;});
  }
  Object.assign(ZM,{tableRows,setupPlayers,refreshPlayer});
})();

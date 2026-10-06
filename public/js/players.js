(() => {
  const {$,escapeHtml,number,timestamp,time,duration,keyed,metrics,get,t}=ZM;
  let selectedId=null,opener=null,details=null;
  const statusMarkup = online=>`<span class="player-status ${online ? 'online' : ''}"><span class="dot ${online ? 'green' : ''}"></span>${online ? t("Online") : t("Offline")}</span>`;
  function tableRows(id,list,leaderboard=false,rankMap=new Map()) {
    const container=$(id),cols=leaderboard?9:5;
    keyed(container,list.length?list:[{id:'empty'}],p=>p.id,p=>{
      const tr=document.createElement('tr');
      if(p.id==='empty'){tr.className='empty-row';tr.innerHTML=`<td colspan="${cols}"></td>`;return tr;}
      tr.innerHTML='<td></td>'.repeat(cols);
      tr.children[1].innerHTML=`<div class="player-cell"><span class="dot"></span><button class="player-button" data-player-id="${p.id}">${escapeHtml(p.name)}</button></div>`;
      tr.children[2].className='kills';
      return tr;
    },(tr,p,index)=>{
      if(p.id==='empty'){tr.firstChild.textContent=t(leaderboard?'No matching players.':'No players online.');return;}
      const labels=leaderboard?['Rank','Player','Kills','Status','Last seen','First seen','Best session','Gain (today)','Deaths']:['Rank','Player','Kills','Session','Joined'];
      Array.from(tr.children).forEach((cell,i)=>cell.dataset.label=t(labels[i]));tr.children[2].dataset.killsLabel=t('kills');
      const cells=tr.children;cells[0].textContent=leaderboard?rankMap.get(p.id):index+1;
      cells[1].querySelector('.dot').className=`dot ${p.online ? 'green' : ''}`;
      cells[2].textContent=number(p.currentKills);
      if(leaderboard){
        const markup=statusMarkup(p.online);if(cells[3].innerHTML!==markup)cells[3].innerHTML=markup;
        cells[4].textContent=p.online?t("Now"):timestamp(p.lastSeen);cells[5].textContent=timestamp(p.firstSeen);
        cells[6].textContent=duration(p.longestSessionSeconds);cells[7].textContent=`+${number(p.killGainToday)}`;cells[7].className='gain';
        cells[8].textContent=number(p.deaths);
        cells[7].title=t('dailyGainNote',{timezone:p.serverTimezone});
      }else{cells[3].textContent=duration(p.currentSessionSeconds);cells[4].textContent=time(p.joinedAt);cells[4].title=p.joinedAt?t('joinedSince',{date:timestamp(p.joinedAt)}):t("Join time unknown");}
    });
  }
  function sortLeaderboard(players,key,direction,locale) {
    const collator=new Intl.Collator(locale,{numeric:true,sensitivity:'base'});
    const value=p=>key==='rank'?-p.currentKills:key==='lastSeen'?(p.online?Infinity:Date.parse(p.lastSeen)):
      key==='firstSeen'?Date.parse(p.firstSeen):p[key];
    return players.slice().sort((a,b)=>{
      const av=value(a),bv=value(b);
      const missing=v=>v==null||(typeof v==='number'&&Number.isNaN(v));
      if(missing(av)||missing(bv))return missing(av)===missing(bv)?collator.compare(a.name,b.name):missing(av)?1:-1;
      const comparison=key==='name'?collator.compare(av,bv):av===bv?0:av>bv?1:-1;
      return comparison*(direction==='asc'?1:-1)||collator.compare(a.name,b.name)||a.id-b.id;
    });
  }
  function playerRecords(players) {
    return [
      {key:'maxKills',label:'Most kills'},
      {key:'longestSessionSeconds',label:'Longest session',isDuration:true},
      {key:'bestSessionKills',label:'Most kills in one session'},
      {key:'deaths',label:'Most deaths'}
    ].map(record=>{
      const value=Math.max(0,...players.map(p=>p[record.key]??0));
      return {...record,value,winners:value>0?players.filter(p=>p[record.key]===value).sort((a,b)=>a.name.localeCompare(b.name)):[]};
    });
  }
  function renderRecords(players) {
    keyed($('player-records'),playerRecords(players),r=>r.key,()=>{
      const node=document.createElement('article');node.className='record-card';
      node.innerHTML='<h3></h3><strong class="record-value"></strong><div class="record-winners"></div>';return node;
    },(node,r)=>{
      node.querySelector('h3').textContent=t(r.label);
      node.querySelector('.record-value').textContent=r.winners.length?(r.isDuration?duration(r.value):number(r.value)):'—';
      const winners=node.querySelector('.record-winners');
      keyed(winners,r.winners.length?r.winners:[{id:'empty'}],p=>p.id,p=>{
        const element=document.createElement(p.id==='empty'?'span':'button');
        if(p.id!=='empty'){element.type='button';element.className='player-button';element.dataset.playerId=p.id;}
        return element;
      },(element,p)=>{element.textContent=p.id==='empty'?t('No record yet'):p.name;});
    });
  }
  function renderDetails(player) {
    details=player;$('player-dialog-title').textContent=player.name;
    $('player-dialog-status').innerHTML=statusMarkup(player.online);
    metrics($('player-details'),[
      {label:t("Most kills in one session"),value:number(player.bestSessionKills)},
      {label:t("Deaths"),value:number(player.deaths)},
      {label:t("Current kills"),value:number(player.currentKills)}, {label:t("Highest observed kills"),value:number(player.maxKills)},
      {label:t("Gain (today)"),value:`+${number(player.killGainToday)}`,tone:'tone-green'},
      {label:t("First seen"),value:timestamp(player.firstSeen)}, {label:t("Last seen"),value:player.online?t("Now"):timestamp(player.lastSeen)},
      {label:player.online?t("Current session"):t("Last observed session"),value:duration(player.currentSessionSeconds)},
      {label:t("Longest observed session"),value:duration(player.longestSessionSeconds)},
      {label:t("Observed sessions"),value:number(player.observedSessions)}, {label:t("Join count"),value:number(player.joinCount)}
    ]);
    const events=(player.events||[]).slice().reverse(),timeline=$('player-timeline');
    if(!events.length){timeline.className='player-timeline empty';timeline.textContent=t("No event snapshots available.");}
    else{
      timeline.className='player-timeline';const peak=Math.max(1,...events.map(e=>e.kills));
      keyed(timeline,events,(e,i)=>`${e.createdAt}:${e.eventType}:${i}`,()=>document.createElement('div'),(node,e)=>{
        node.className=`snapshot-bar ${e.eventType}`;node.style.height=`${Math.max(4,e.kills/peak*100)}%`;
        node.title=t('eventSnapshot',{date:timestamp(e.createdAt),event:t(e.eventType==='join'?'eventJoin':e.eventType==='death'?'eventDeath':'eventLeave'),kills:number(e.kills),duration:duration(e.sessionSeconds)});
      });
    }
    $('player-detail-note').textContent=t('dailyGainDetails',{timezone:player.serverTimezone});
  }
  async function refreshPlayer() {
    if(selectedId===null)return;
    const id=selectedId;
    try{const player=await get(`player/${id}`);if(selectedId===id)renderDetails(player);}
    catch(error){if(selectedId===id)$('player-detail-note').textContent=t('playerError',{error:error.message});}
  }
  function setupPlayers() {
    const dialog=$('player-dialog');
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-player-id]');if(!button)return;
      opener=button;selectedId=Number(button.dataset.playerId);details=null;
      $('player-dialog-title').textContent=button.textContent;$('player-dialog-status').textContent=t("Loading\u2026");
      $('player-details').replaceChildren();$('player-timeline').replaceChildren();$('player-detail-note').textContent='';
      dialog.showModal();$('close-player').focus();void refreshPlayer();
    });
    $('close-player').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=>{
      if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}
    });
    dialog.addEventListener('close',()=>{selectedId=null;details=null;if(opener?.isConnected)opener.focus();opener=null;});
  }
  Object.assign(ZM,{playerRecords,renderRecords,sortLeaderboard,tableRows,setupPlayers,refreshPlayer,relocalizePlayer:()=>{if(details)renderDetails(details);}});
})();

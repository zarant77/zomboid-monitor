window.ZM = {};
(() => {
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '—').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const number = value => value == null ? '—' : new Intl.NumberFormat(ZM.locale(),{maximumFractionDigits:1}).format(value);
  const timestamp = value => value ? new Date(value).toLocaleString(ZM.locale(),{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).replaceAll('/', '.') : '—';
  const time = value => value ? new Date(value).toLocaleTimeString(ZM.locale(),{hour12:false}) : '—';
  const duration = value => {
    if (value == null) return '—';
    const seconds = Math.floor(value), m = Math.floor(seconds%3600/60);
    return seconds>=3600 ? ZM.t('durationHours',{hours:Math.floor(seconds/3600),minutes:m}) : ZM.t('durationMinutes',{minutes:m,seconds:seconds%60});
  };
  const bool = value => ZM.t(value == null ? 'Unknown' : value ? 'Yes' : 'No');
  const ping = value => value == null ? '—' : ZM.t('pingValue',{value:ZM.number(Math.round(value))});
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  function text(id,value) { const node = $(id), next = String(value ?? '—'); if (node.textContent!==next) node.textContent=next; }
  async function get(endpoint) {
    const response = await fetch(`/api/${endpoint}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error(ZM.t('apiError',{endpoint,status:response.status}));
    return response.json();
  }
  function keyed(container,items,key,create,update) {
    const old = new Map(Array.from(container.children).map(node=>[node.dataset.key,node]));
    const keep = new Set();
    items.forEach((item,index) => {
      const id = String(key(item,index)); let node = old.get(id);
      if (!node) { node = create(item,index); node.dataset.key=id; }
      update(node,item,index); keep.add(node);
      if (container.children[index]!==node) container.insertBefore(node,container.children[index] || null);
    });
    for (const node of Array.from(container.children)) if (!keep.has(node)) node.remove();
  }
  function metrics(container,values) {
    keyed(container,values,v=>v.key || v.label, v=>{
      const node=document.createElement('div'); node.className='metric';
      node.innerHTML=`${v.icon ? icon(v.icon) : ''}<div><strong></strong><span></span></div>`;
      return node;
    },(node,v)=>{node.className=`metric ${v.tone || ''}`;node.querySelector('strong').textContent=v.value ?? '—';node.querySelector('span').textContent=v.label;});
  }
  function segments(container,attribute,value) {
    container.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset[attribute]===value)));
  }
  function safeDescription(container,value) {
    if (container.dataset.value === value) return;
    container.dataset.value=value; const fragment=document.createDocumentFragment();
    const pattern=/https?:\/\/[^\s<>"']+/g;let start=0;
    for (const match of value.matchAll(pattern)) {
      fragment.append(document.createTextNode(value.slice(start,match.index)));
      const url=match[0].replace(/[.,;!?)]+$/,'');
      const link=document.createElement('a');link.href=url;link.textContent=url;link.target='_blank';link.rel='noopener noreferrer';
      fragment.append(link,document.createTextNode(match[0].slice(url.length)));start=match.index+match[0].length;
    }
    fragment.append(document.createTextNode(value.slice(start)));container.replaceChildren(fragment);
  }
  const userName = user => user.displayName || `Steam · ${String(user.steamId || '').slice(-4)}`;
  function userBadge(user) {
    const link = document.createElement('a'); link.className = 'steam-profile';
    link.href = `https://steamcommunity.com/profiles/${user.steamId}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.title = `SteamID: ${user.steamId}`;
    const avatar = document.createElement('span'); avatar.className = 'steam-avatar';
    const initial = document.createElement('span'); initial.textContent = userName(user).slice(0, 1).toUpperCase(); initial.setAttribute('aria-hidden', 'true'); avatar.append(initial);
    if (user.avatarUrl) {
      try {
        const url = new URL(user.avatarUrl);
        if (url.protocol === 'https:' && ['avatars.steamstatic.com','avatars.fastly.steamstatic.com','steamcdn-a.akamaihd.net'].includes(url.hostname)) {
          const image = document.createElement('img'); image.src = url.href; image.alt = ''; image.referrerPolicy = 'no-referrer'; image.width = 32; image.height = 32;
          image.addEventListener('error', () => image.remove(), { once: true }); avatar.append(image);
        }
      } catch {}
    }
    const name = document.createElement('span'); name.className = 'steam-name'; name.textContent = userName(user);
    link.append(avatar, name); return link;
  }
  Object.assign(ZM,{userName,userBadge});
  Object.assign(ZM,{$,escapeHtml,number,timestamp,time,duration,bool,ping,icon,text,get,keyed,metrics,segments,safeDescription});
})();

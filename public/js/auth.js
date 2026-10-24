(() => {
  const login = document.getElementById('steam-login'), logout = document.getElementById('steam-logout');
  const message = document.getElementById('account-message'), booksLink = document.getElementById('menu-books');
  const monitorLink = document.getElementById('menu-monitor');
  const monitorView = document.getElementById('monitoring-view'), booksView = document.getElementById('books-view');
  let user = null, messageKey = null, loaded = false, settingsAllowed = false, settingsLoading = false;
  ZM.user = null;
  const url = new URL(location.href), result = url.searchParams.get('auth');
  if (result) { url.searchParams.delete('auth'); history.replaceState(null, '', url); }
  if (result === 'failed') messageKey = 'Steam sign-in failed. Please try again.';
  function render() {
    message.hidden = !messageKey;
    message.textContent = messageKey ? ZM.t(messageKey) : '';
    login.hidden = !loaded || Boolean(user);
    logout.hidden = !user;
    const profile = document.getElementById('account-profile');
    profile.hidden = !user;
    profile.replaceChildren(...(user ? [ZM.userBadge(user)] : []));
    document.getElementById('main-menu').hidden = !user;
    booksLink.hidden = !user;
    const books = Boolean(user) && (['#books', '#factions'].includes(location.hash) || location.hash.startsWith('#invite='));
    const factionLink = document.getElementById('menu-factions');
    factionLink.removeAttribute('aria-current');
    const settingsLink = document.getElementById('menu-settings');
    const settings = Boolean(user?.isAdmin) && location.hash === '#settings';
    settingsLink.hidden = !user?.isAdmin;
    settingsLink.removeAttribute('aria-current');
    monitorView.hidden = books || settings; booksView.hidden = !books;
    document.getElementById('settings-view').hidden = !settings || !settingsAllowed;
    if (settings) {
      settingsLink.setAttribute('aria-current','page');
      document.title = ZM.t('Settings');
      if (!settingsAllowed && !settingsLoading) void loadSettings();
    }
    if (loaded && !user?.isAdmin && location.hash === '#settings') history.replaceState(null,'',`${location.pathname}${location.search}#monitoring`);
    if (books) { booksLink.removeAttribute('aria-current'); (location.hash === '#books' ? booksLink : factionLink).setAttribute('aria-current', 'page'); monitorLink.removeAttribute('aria-current'); }
    else { if (settings) monitorLink.removeAttribute('aria-current'); else monitorLink.setAttribute('aria-current', 'page'); booksLink.removeAttribute('aria-current'); }
    if (loaded && !user && ['#books', '#factions'].includes(location.hash)) history.replaceState(null, '', `${location.pathname}${location.search}#monitoring`);
  }
  async function loadSettings() {
    settingsLoading = true;
    const userId = user?.id;
    try {
      const response = await fetch('/api/admin/settings', { cache:'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (user?.id === userId && user?.isAdmin && data.settings?.gameClock) {
        document.getElementById('game-day-minutes').value=data.settings.gameClock.dayMinutes;
        document.getElementById('game-clock-time').value=data.settings.gameClock.time || '';
      }
      if (user?.id === userId && user?.isAdmin) settingsAllowed = true;
    } catch {
      if (user?.id === userId && location.hash === '#settings') {
        messageKey = 'Could not load settings. Please try again.';
        history.replaceState(null,'',`${location.pathname}${location.search}#monitoring`);
      }
    } finally { settingsLoading = false; render(); }
  }
  let clockMessage = null;
  const clockForm = document.getElementById('game-clock-form');
  clockForm.addEventListener('submit', async event => {
    event.preventDefault(); const button=clockForm.querySelector('button'); if(button.disabled)return;
    button.disabled=true; clockMessage=null; document.getElementById('game-clock-message').textContent='';
    try {
      const response=await fetch('/api/admin/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({dayMinutes:Number(document.getElementById('game-day-minutes').value),time:document.getElementById('game-clock-time').value})});
      if(!response.ok)throw new Error();
      const data=await response.json(); clockMessage='Clock synchronized.';
      document.dispatchEvent(new CustomEvent('gameclockchange',{detail:data.settings.gameClock}));
    } catch { clockMessage='Could not save clock settings.'; }
    finally {button.disabled=false;document.getElementById('game-clock-message').textContent=ZM.t(clockMessage);}
  });
  document.addEventListener('languagechange',()=>{if(clockMessage)document.getElementById('game-clock-message').textContent=ZM.t(clockMessage);});
  document.addEventListener('languagechange', render);
  window.addEventListener('hashchange', render);
  async function load() {
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      user = (await response.json()).user;
      settingsAllowed = false;
      ZM.user = user;
      document.dispatchEvent(new CustomEvent('accountchange'));
      loaded = true;
    } catch { messageKey = 'Could not load account. Please reload the page.'; }
    render();
  }
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    try {
      const response = await fetch('/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
      user = null; settingsAllowed = false; ZM.user = null; messageKey = null;
      document.dispatchEvent(new CustomEvent('accountchange'));
    } catch { messageKey = 'Could not sign out. Please try again.'; }
    finally { logout.disabled = false; render(); }
  });
  ZM.i18nReady.then(load).catch(load);
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
})();

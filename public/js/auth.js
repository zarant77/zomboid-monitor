(() => {
  const login = document.getElementById('steam-login'), logout = document.getElementById('steam-logout');
  const message = document.getElementById('account-message'), booksLink = document.getElementById('menu-books');
  const monitorLink = document.getElementById('menu-monitor');
  const monitorView = document.getElementById('monitoring-view'), booksView = document.getElementById('books-view');
  let user = null, messageKey = null, loaded = false;
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
    monitorView.hidden = books; booksView.hidden = !books;
    if (books) { booksLink.removeAttribute('aria-current'); (location.hash === '#books' ? booksLink : factionLink).setAttribute('aria-current', 'page'); monitorLink.removeAttribute('aria-current'); }
    else { monitorLink.setAttribute('aria-current', 'page'); booksLink.removeAttribute('aria-current'); }
    if (loaded && !user && ['#books', '#factions'].includes(location.hash)) history.replaceState(null, '', `${location.pathname}${location.search}#monitoring`);
  }
  document.addEventListener('languagechange', render);
  window.addEventListener('hashchange', render);
  async function load() {
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      user = (await response.json()).user;
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
      user = null; ZM.user = null; messageKey = null;
      document.dispatchEvent(new CustomEvent('accountchange'));
    } catch { messageKey = 'Could not sign out. Please try again.'; }
    finally { logout.disabled = false; render(); }
  });
  ZM.i18nReady.then(load).catch(load);
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
})();

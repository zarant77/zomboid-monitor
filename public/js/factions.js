(() => {
  const $ = id => document.getElementById(id);
  let busy = false, notice = null, customErrorKey = null;
  let factions = [], active = null, members = [], joinLink = { enabled: false, url: null }, items = [], customSeries = [], pending = null, errorKey = null, generation = 0;
  try { pending = sessionStorage.getItem('zm.invite'); } catch {}
  function captureInvite() {
    const match = location.hash.match(/^#invite=([a-f0-9]{64})$/);
    if (match) { pending = match[1]; try { sessionStorage.setItem('zm.invite', pending); } catch {} }
  }
  captureInvite();
  const t = key => ZM.t(key);
  async function api(path, method = 'GET', body) {
    const response = await fetch(path, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }
  function button(label, action) { const node = document.createElement('button'); node.type = 'button'; node.textContent = t(label); node.disabled = busy; node.addEventListener('click', () => run(action)); return node; }
  function list(id, values, render) { $(id).replaceChildren(...values.map(value => { const li = document.createElement('li'); render(li, value); return li; })); }
  function render() {
    $('faction-error').hidden = !errorKey; $('faction-error').textContent = errorKey ? t(errorKey) : '';
    $('custom-book-error').hidden = !customErrorKey;
    $('custom-book-error').textContent = customErrorKey ? t(customErrorKey) : '';
    $('custom-book-name').setAttribute('aria-invalid',String(Boolean(customErrorKey)));
    const books = location.hash === '#books';
    $('menu-factions').querySelector('span').textContent = t('Faction');
    const pageName = t(books ? 'Books' : 'Faction');
    const pageTitle = active ? `${active.name} - ${pageName}` : pageName;
    $('books-heading').textContent = pageTitle;
    document.title = ZM.user && (books || location.hash === '#factions') ? pageTitle : t('28 Kills Later · Project Zomboid Server Monitor');
    $('no-faction').hidden = Boolean(active);
    $('faction-content').hidden = !active;
    $('faction-management').hidden = books;
    $('create-faction-card').hidden = Boolean(active);
    $('faction-owner').hidden = active?.role !== 'owner';
    $('leader-settings').hidden = active?.role !== 'owner';
    $('leave-faction').hidden = !active;
    $('collection-content').hidden = !books;
    $('print-books').hidden = !books || !active;
    $('books-heading-actions').hidden = !books || !active;
    $('disband-faction').hidden = active?.role !== 'owner';
    $('invite-state').textContent = t(joinLink.enabled ? 'Enabled' : 'Disabled');
    $('toggle-invite').setAttribute('aria-checked', String(joinLink.enabled));
    $('invite-result').hidden = !joinLink.enabled;
    $('invite-url').value = joinLink.url || '';
    $('faction-role').textContent = t(active?.role === 'owner' ? 'Leader' : 'Member');
    $('faction-count').textContent = `${t('Members')}: ${members.length} · ${t('Shared items')}: ${items.length}`;
    $('create-consequence').textContent = active ? consequence() : '';
    $('invite-consequence').textContent = active ? consequence() : '';
    $('faction-success').hidden = !notice; $('faction-success').textContent = notice ? t(notice) : '';
    const candidates = members.filter(m => m.id !== ZM.user?.id);
    const selected = $('new-leader').value;
    $('new-leader').replaceChildren(...candidates.map(m => { const option = document.createElement('option'); option.value = m.id; option.textContent = `${ZM.userName(m)} · ${m.steamId.slice(-4)}`; return option; }));
    if (candidates.some(m => String(m.id) === selected)) $('new-leader').value = selected;
    renderLeaderProfile();
    $('new-leader').disabled = !candidates.length || busy;
    $('transfer-button').disabled = !candidates.length || busy;
    list('faction-members', members, (li, member) => {
      li.className = 'faction-member';
      const role = document.createElement('span'); role.className = 'member-role'; role.textContent = t(member.role === 'owner' ? 'Leader' : 'Member');
      li.append(ZM.userBadge(member), role);
      if (active?.role === 'owner' && member.role !== 'owner') li.append(button('Remove member', async () => { if (!await confirmAction('Remove member', 'This member will lose access to the shared collection.')) return; await api(`/api/factions/${active.id}/members/${member.id}`, 'DELETE'); await details(); }));
    });
    ZM.renderBookCollection(active?.id, items, busy, changeBook, customSeries, removeCustomBook);
  }
  function changeBook(book, checked) {
    if (busy || !active) { render(); return; }
    const factionId = active.id;
    run(async () => {
      await api(`/api/factions/${factionId}/items/${encodeURIComponent(book.itemKey)}`, 'PUT', {
        name: book.name, category: 'book', quantity: checked ? 1 : 0
      });
      await details();
    });
  }

  function renderLeaderProfile() {
    const member = members.find(m => String(m.id) === $('new-leader').value);
    $('new-leader-profile').replaceChildren(...(member ? [ZM.userBadge(member)] : []));
  }
  $('new-leader').addEventListener('change', renderLeaderProfile);
  async function details() {
    const id = active?.id, version = ++generation;
    if (!id) { members = []; joinLink = { enabled: false, url: null }; items = []; customSeries = []; render(); return; }
    const [m, i, v, c] = await Promise.all([api(`/api/factions/${id}/members`), api(`/api/factions/${id}/items`), active.role === 'owner' ? api(`/api/factions/${id}/invites`) : Promise.resolve({ invite: { enabled: false, url: null } }), api(`/api/factions/${id}/custom-books`)]);
    if (version !== generation || !ZM.user) return;
    members = m.members; items = i.items; customSeries = c.series; joinLink = v.invite; render();
  }
  async function refresh(preferred) {
    if (!ZM.user) { generation++; factions = []; active = null; members = []; joinLink = { enabled: false, url: null }; items = []; customSeries = []; $('invite-preview').hidden = true; $('invite-result').hidden = true; $('invite-url').value = ''; render(); return; }
    const userId = ZM.user.id, version = ++generation;
    const data = await api('/api/factions');
    if (ZM.user?.id !== userId || version !== generation) return;
    factions = data.factions;
    $('invite-result').hidden = true; $('invite-url').value = '';
    const previousFactionId = active?.id;
    active = factions[0] || null;
    if (active?.id !== previousFactionId) { items = []; customSeries = []; }
    await details();
    if (pending) {
      let preview;
      try { preview = await api(`/api/faction-invites/${pending}`); }
      catch (error) { pending = null; try { sessionStorage.removeItem('zm.invite'); } catch {} $('invite-preview').hidden = true; throw error; }
      $('invite-name').textContent = preview.faction.name; $('invite-preview').hidden = false;
      if (location.hash !== '#factions') { history.replaceState(null, '', `${location.pathname}${location.search}#factions`); window.dispatchEvent(new Event('hashchange')); }
    }
  }
  function consequence() {
    if (active?.role !== 'owner') return t('You will automatically leave your current faction. Its collection stays with that faction.');
    return t(members.length > 1 ? 'You will leave your faction. Leadership passes to its longest-standing member.' : 'You are the last member. Leaving will disband your faction and delete its shared collection.');
  }
  function confirmAction(title, description, literal = false) {
    return new Promise(resolve => {
      const dialog = $('faction-confirm');
      $('faction-confirm-title').textContent = t(title);
      $('faction-confirm-description').textContent = literal ? description : t(description);
      dialog.returnValue = 'cancel';
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
      dialog.showModal();
    });
  }
  async function run(action, inlineError = false) {
    if (busy) return;
    busy = true; errorKey = null; customErrorKey = null; notice = null;
    $('custom-book-error').hidden = true;
    document.querySelectorAll('.books-page button').forEach(node => { node.disabled = true; });
    ZM.renderBookCollection(active?.id, items, true, changeBook, customSeries, removeCustomBook);
    try { await action(); }
    catch (error) { const message = ['Invitation unavailable','Owner required','Faction not found','Invalid name','Choose another member','This book already exists','Add at least one volume','Use a full game item ID','Duplicate volume or item ID'].includes(error.message) ? error.message : 'Faction operation failed. Refresh and try again.';
      if (inlineError) customErrorKey = message; else errorKey = message;
    }
    finally { busy = false; document.querySelectorAll('.books-page button').forEach(node => { node.disabled = false; }); render(); }
  }
  function form(id, action) {
    $(id).addEventListener('submit', event => {
      event.preventDefault(); const node = event.currentTarget, submit = node.querySelector('button');
      if (busy) return;
      const data = Object.fromEntries(new FormData(node)); submit.disabled = true;
      run(() => action(data, node), id === 'add-custom-book').finally(() => { submit.disabled = false; });
    });
  }
  form('create-faction', async (data, node) => { if (active && !await confirmAction('Create faction', consequence(), true)) return; const result = await api('/api/factions', 'POST', data); node.reset(); await refresh(result.faction.id); });
  $('toggle-invite').addEventListener('click', () => run(async () => {
    const result = await api(`/api/factions/${active.id}/invites`, 'POST', { enabled: !joinLink.enabled });
    joinLink = result.invite;
  }));
  $('custom-book-name').addEventListener('input', () => {
    customErrorKey = null; $('custom-book-error').hidden = true; $('custom-book-name').setAttribute('aria-invalid','false');
  });
  $('show-custom-book').addEventListener('click', () => {
    customErrorKey = null; $('custom-book-error').hidden = true; $('custom-book-name').setAttribute('aria-invalid','false');
    $('add-custom-book').hidden = !$('add-custom-book').hidden;
    $('show-custom-book').setAttribute('aria-expanded',String(!$('add-custom-book').hidden));
    if (!$('add-custom-book').hidden) $('custom-book-name').focus();
  });
  form('add-custom-book', async (data,node) => {
    await api(`/api/factions/${active.id}/custom-books`, 'POST', { name:data.name });
    node.reset(); node.hidden = true; $('show-custom-book').setAttribute('aria-expanded','false'); await details(); notice = 'Custom book added.';
  });
  function removeCustomBook(skill) {
    run(async () => {
      if (!await confirmAction('Remove custom row', 'The custom row will be removed. Recorded inventory is kept.')) return;
      await api(`/api/factions/${active.id}/custom-books/${skill.id}`, 'DELETE'); await details();
    });
  }
  $('dismiss-invite').addEventListener('click', () => {
    pending = null; try { sessionStorage.removeItem('zm.invite'); } catch {}
    $('invite-preview').hidden = true; errorKey = null; location.hash = '#factions'; render();
  });
  $('accept-invite').addEventListener('click', () => run(async () => {
    if (active && !await confirmAction('Join faction', consequence(), true)) return;
    const result = await api(`/api/faction-invites/${pending}/accept`, 'POST'); pending = null;
    try { sessionStorage.removeItem('zm.invite'); } catch {} $('invite-preview').hidden = true; await refresh(result.faction.id);
  }));
  $('leave-faction').addEventListener('click', () => run(async () => { if (!await confirmAction('Leave faction', consequence(), true)) return; await api(`/api/factions/${active.id}/members/${ZM.user.id}`, 'DELETE'); active = null; await refresh(); }));
  $('disband-faction').addEventListener('click', () => run(async () => {
    if (!await confirmAction('Disband faction', 'Deletes the faction, its invitations and shared collection for everyone.')) return;
    await api(`/api/factions/${active.id}`, 'DELETE'); await refresh(); notice = 'Faction disbanded.';
  }));
  form('transfer-leader', async data => {
    if (!await confirmAction('Transfer leadership', 'You remain a member. Joining by link will be disabled.')) return;
    await api(`/api/factions/${active.id}/leader`, 'POST', { userId: Number(data.userId) }); await refresh(); notice = 'Leadership transferred.';
  });
  $('copy-invite').addEventListener('click', () => run(async () => {
    try { await navigator.clipboard.writeText($('invite-url').value); notice = 'Link copied.'; }
    catch { $('invite-url').focus(); $('invite-url').select(); notice = 'Select and copy the invitation link.'; }
  }));
  $('show-missing-books').addEventListener('change', render);
  $('print-books').addEventListener('click', () => window.print());
  document.addEventListener('accountchange', () => { generation++; if (!ZM.user) refresh(); else run(() => refresh()); });
  document.addEventListener('languagechange', render);
  window.addEventListener('hashchange', () => { captureInvite(); if (ZM.user) run(() => refresh()); else render(); });
})();

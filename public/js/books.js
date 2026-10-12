/* Build 42 vanilla skill-book IDs. Sources and scope: README, Vanilla skill books. */
(() => {
  const skills = [
    ['Agriculture', 'Farming'], ['Aiming', 'Aiming'], ['Animal Care', 'Husbandry'],
    ['Blacksmithing', 'Blacksmith'], ['Butchering', 'Butchering'], ['Carpentry', 'Carpentry'],
    ['Carving', 'Carving'], ['Cooking', 'Cooking'], ['Electrical', 'Electrician'],
    ['First Aid', 'FirstAid'], ['Fishing', 'Fishing'], ['Foraging', 'Foraging'],
    ['Glassmaking', 'Glassmaking'], ['Knapping', 'FlintKnapping'], ['Long Blade', 'LongBlade'],
    ['Maintenance', 'Maintenance'], ['Masonry', 'Masonry'], ['Mechanics', 'Mechanic'],
    ['Pottery', 'Pottery'], ['Reloading', 'Reloading'], ['Tailoring', 'Tailoring'],
    ['Tracking', 'Tracking'], ['Trapping', 'Trapping'], ['Welding', 'MetalWelding']
  ].map(([name, id]) => ({ name, volumes: Array.from({ length: 5 }, (_, i) => ({
    itemKey: `Base.Book${id}${i + 1}`, name: `${name} ${['I', 'II', 'III', 'IV', 'V'][i]}`, volume: i + 1
  })) }));
  if (typeof module !== 'undefined' && module.exports) { module.exports = { skills }; return; }
  const rows = new Map();
  function renderBookCollection(factionId, items, busy, onToggle, customSeries = [], onRemove = null) {
    const body = document.getElementById('books-table-body');
    const stored = new Map(items.map(item => [item.itemKey, item]));
    const catalog = [...skills.map(skill => ({ ...skill, key: `vanilla:${skill.name}` })), ...customSeries.map(series => ({
      ...series, key: `custom:${series.id}`, custom: true,
      volumes: series.volumes.map(book => ({ ...book, name: `${series.name} ${['I','II','III','IV','V'][book.volume - 1]}` }))
    }))].sort((a,b) => a.name.localeCompare(b.name,'en') || a.key.localeCompare(b.key));
    const keys = new Set(catalog.map(skill => skill.key));
    for (const [key,value] of rows) if (!keys.has(key)) { value.row.remove(); rows.delete(key); }
    for (const skill of catalog) {
      if (!rows.has(skill.key)) {
        const row = document.createElement('tr');
        const heading = document.createElement('th'); heading.scope = 'row';
        const english = document.createElement('span'); english.className = 'book-skill-name'; english.lang = 'en'; english.textContent = skill.name;
        const localized = document.createElement('span'); localized.className = 'book-skill-localized';
        heading.append(english, localized); row.append(heading);
        const checkboxes = Array.from({ length:5 },(_,index) => {
          const book = skill.volumes.find(value => value.volume === index+1);
          const cell = document.createElement('td'), label = document.createElement('label'), input = document.createElement('input');
          if (!book) { cell.textContent = '—'; cell.className = 'book-volume-unavailable'; row.append(cell); return null; }
          input.type = 'checkbox'; input.dataset.itemKey = book.itemKey;
          label.className = 'book-check'; label.append(input); cell.append(label); row.append(cell);
          return { book, input };
        });
        const badge = document.createElement('span'); badge.className = 'custom-book-badge';
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'custom-book-remove'; remove.textContent = '×';
        if (skill.custom) heading.append(remove);
        rows.set(skill.key, { row, localized, checkboxes:checkboxes.filter(Boolean), badge, remove });
      }
    }
    let owned = 0;
    for (const [index, skill] of catalog.entries()) {
      const { row, localized, checkboxes, badge, remove } = rows.get(skill.key);
      if (body.children[index] !== row) body.insertBefore(row, body.children[index] || null);
      if (skill.custom) { badge.textContent = skill.modName || ZM.t('Custom'); remove.disabled = busy; remove.setAttribute('aria-label', ZM.t('Remove custom book', { name:skill.name })); remove.onclick = () => onRemove?.(skill); }
      row.classList.toggle('book-set-complete', skill.volumes.every(book => (stored.get(book.itemKey)?.quantity || 0) > 0));
      const translation = skill.custom ? skill.name : ZM.t(`bookSkill.${skill.name}`);
      localized.textContent = translation !== skill.name ? ` (${translation})` : '';
      localized.lang = document.documentElement.lang;
      for (const { book, input } of checkboxes) {
        const present = (stored.get(book.itemKey)?.quantity || 0) > 0;
        if (present) owned++;
        input.checked = present;
        input.disabled = busy || !factionId;
        input.setAttribute('aria-label', `${skill.name} · ${ZM.t('bookVolume', { volume: book.volume })}`);
        input.title = `${skill.name} · ${ZM.t('bookVolume', { volume:book.volume })}`;
        input.onchange = () => onToggle(book, input.checked);
      }
    }
    document.getElementById('books-progress').textContent = `${owned} / ${catalog.reduce((sum,skill) => sum + skill.volumes.length,0)}`;
  }
  ZM.renderBookCollection = renderBookCollection;
})();

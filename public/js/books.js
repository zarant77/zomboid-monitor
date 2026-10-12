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
  function renderBookCollection(factionId, items, busy, onToggle) {
    const body = document.getElementById('books-table-body');
    const stored = new Map(items.map(item => [item.itemKey, item]));
    if (!rows.size) {
      for (const skill of skills) {
        const row = document.createElement('tr');
        const heading = document.createElement('th'); heading.scope = 'row';
        const english = document.createElement('span'); english.className = 'book-skill-name'; english.lang = 'en'; english.textContent = skill.name;
        const localized = document.createElement('span'); localized.className = 'book-skill-localized';
        heading.append(english, localized); row.append(heading);
        const checkboxes = skill.volumes.map(book => {
          const cell = document.createElement('td'), label = document.createElement('label'), input = document.createElement('input');
          input.type = 'checkbox'; input.dataset.itemKey = book.itemKey;
          label.className = 'book-check'; label.append(input); cell.append(label); row.append(cell);
          return { book, input };
        });
        rows.set(skill.name, { row, localized, checkboxes }); body.append(row);
      }
    }
    let owned = 0;
    for (const skill of skills) {
      const { row, localized, checkboxes } = rows.get(skill.name);
      row.classList.toggle('book-set-complete', skill.volumes.every(book => (stored.get(book.itemKey)?.quantity || 0) > 0));
      const translation = ZM.t(`bookSkill.${skill.name}`);
      localized.textContent = translation !== skill.name ? ` (${translation})` : '';
      localized.lang = document.documentElement.lang;
      for (const { book, input } of checkboxes) {
        const present = (stored.get(book.itemKey)?.quantity || 0) > 0;
        if (present) owned++;
        input.checked = present;
        input.disabled = busy || !factionId;
        input.setAttribute('aria-label', `${skill.name} · ${ZM.t('bookVolume', { volume: book.volume })}`);
        input.title = book.itemKey;
        input.onchange = () => onToggle(book, input.checked);
      }
    }
    document.getElementById('books-progress').textContent = `${owned} / ${skills.length * 5}`;
  }
  ZM.renderBookCollection = renderBookCollection;
})();

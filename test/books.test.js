const test = require('node:test');
const assert = require('node:assert/strict');
const { skills } = require('../public/js/books');
const en = require('../public/locales/en.json');
const uk = require('../public/locales/uk.json');
test('vanilla Build 42 catalog covers all 24 skills and 120 unique game book IDs', () => {
  assert.equal(skills.length, 24);
  const ids = skills.flatMap(skill => skill.volumes.map(book => book.itemKey));
  assert.equal(new Set(ids).size, 120);
  // Game IDs differ from displayed skill names for these vanilla books.
  for (const [name, prefix] of [['Agriculture','Farming'],['Animal Care','Husbandry'],['Electrical','Electrician'],['Knapping','FlintKnapping'],['Mechanics','Mechanic'],['Welding','MetalWelding']]) {
    assert.deepEqual(skills.find(skill => skill.name === name).volumes.map(book => book.itemKey), [1,2,3,4,5].map(volume => `Base.Book${prefix}${volume}`));
  }
  assert.deepEqual(skills.map(skill => skill.name), skills.map(skill => skill.name).sort((a,b) => a.localeCompare(b,'en')));
  for (const skill of skills) {
    assert.equal(en[`bookSkill.${skill.name}`], skill.name);
    assert.equal(typeof uk[`bookSkill.${skill.name}`], 'string');
    assert.notEqual(uk[`bookSkill.${skill.name}`], skill.name);
  }
});

import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const ctx = {window: {}, document: {}, console};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../site/client/shop.js', import.meta.url), 'utf8'), ctx);
const S = ctx.window.NoworaShop;

const cols = [{id: 'a', name: 'Name', type: 'text'}, {id: 'b', name: 'Items', type: 'longtext'}, {id: 'c', name: 'Total', type: 'money'}, {id: 'd', name: 'Status', type: 'choice'}];
const day = n => new Date(Date.now() - n * 864e5).toISOString();
const orders = {table: {cols}, rows: [
  {_ts: day(1), a: 'Riya', b: '1 × Puffer · Pink · M — ₹1,999', c: 1999, d: 'Confirmed'},
  {_ts: day(2), a: 'Kabir', b: '2 × Hoodie · Beige · L — ₹2,598', c: 2598, d: 'New'},
  {_ts: day(3), a: 'Aman', b: '1 × Puffer · Blue · S — ₹1,999', c: 1999, d: 'Cancelled'},
  {_ts: day(40), a: 'Neha', b: '1 × Puffer · Pink · S — ₹1,999', c: 1999, d: 'Delivered'},
]};

test('sales split confirmed, waiting and cancelled orders by range', () => {
  const m = S.summarise(orders, 30), all = S.summarise(orders, 0);
  assert.equal(m.confirmed, 1999);
  assert.equal(m.waiting, 2598);
  assert.equal(m.orders, 2);
  assert.equal(m.nCancelled, 1);
  assert.equal(all.sales, 1999 + 2598 + 1999);
  assert.equal(m.series.length, 30);
  assert.deepEqual(JSON.parse(JSON.stringify(m.top.map(t => [t.name, t.qty]))), [['Hoodie', 2], ['Puffer', 1]]);
});

test('categories come from the product name, most specific kind first', () => {
  const cats = [{id: 'hoodies', name: 'Hoodies'}, {id: 'jackets', name: 'Jackets'}, {id: 'puffers', name: 'Puffers'}, {id: 'co-ords', name: 'Co-ord sets'}];
  const g = n => { const r = S.guessCategory(n, cats); return r && [r.id, r.isNew]; };
  assert.deepEqual(g('Hooded puffer jacket'), ['puffers', false]);
  assert.deepEqual(g('Black oversized hoodie'), ['hoodies', false]);
  assert.deepEqual(g('Denim jacket'), ['jackets', false]);
  assert.deepEqual(g('Cargo pants'), ['bottoms', true]);
  assert.deepEqual(g('Summer co-ord set'), ['co-ords', false]);
  assert.equal(g('Something'), null);
});

test('the catalogue block is read and rewritten in place, safely escaped', () => {
  const html = '<body><script type="application/json" id="nowora-products">{"categories":[],"products":[]}</script><p>rest</p></body>';
  const data = {categories: [{id: 'x', name: 'X'}], products: [{id: 'p', name: 'Tee </script><b>', price: 5, colours: []}]};
  const out = S.writeCatalogue(html, data);
  assert.ok(out.endsWith('<p>rest</p></body>'));
  assert.equal(S.readCatalogue(out).products[0].name, 'Tee </script><b>');
  assert.throws(() => S.writeCatalogue('<html></html>', data));
});

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
new vm.Script(code);
const handler = code.slice(code.indexOf('function clientForm_(b)'), code.indexOf('/** Finds a table'));
function backend(full = false) {
  const context = {
    CacheService: {getScriptCache: () => ({get: key => key === 'track_map' ? '{"test":{"id":"client"}}' : null, put() {}})},
    readAll_: () => [{id: 'client'}], clientData_: () => ({}),
    LockService: {getScriptLock: () => ({waitLock() {}, releaseLock() {}})},
    guessType_: () => 'text', DB_LIMIT: {rows: 5000},
    dbEnsure_: () => ({sh: {getLastRow: () => full ? 5001 : 1}}),
    takeStock_: () => { throw new Error('Inventory must not be reached'); }
  };
  vm.createContext(context); vm.runInContext(handler, context); return context;
}
test('rejects malformed items before inventory processing', () => {
  for (const item of [null, {qty: -1, price: 10}, {qty: 1.5, price: 10}, {qty: 1, price: Infinity}, {qty: 1, price: -10}]) {
    assert.equal(backend().clientForm_({cid: 'test', items: [item]}).ok, false);
  }
});
test('full tables cannot trigger inventory deductions', () => {
  const result = backend(true).clientForm_({cid: 'test', items: [{name: 'Test', qty: 1, price: 10}]});
  assert.equal(result.ok, false); assert.match(result.error, /table is full/);
});
test('replayed order IDs return the existing row without stock processing, even at capacity', () => {
  const ctx=backend(true);
  ctx.dbEnsure_=()=>({cols:[{name:'Order ID'}],sh:{getLastRow:()=>5001,getName:()=> 'Orders',getRange:(row,col)=> col===3 ? {getDisplayValues:()=>[['52A-stable']]} : {getValue:()=> 'saved-row'}}});
  const result=ctx.clientForm_({cid:'test',table:'Orders',fields:{'Order ID':'52A-stable'},items:[{name:'Test',qty:1,price:10}]});
  assert.equal(result.ok,true);assert.equal(result.duplicate,true);assert.equal(result.id,'saved-row');
});

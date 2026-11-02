import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const source=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function clientData_'),source.indexOf('function dbTables_'));
test('unavailable existing databases never silently become empty replacements',()=>{
  let created=0, updated=0;
  const c={SpreadsheetApp:{openById(){throw Error('Unavailable');},create(){created++;}},upsert_(){updated++;}};
  vm.createContext(c);vm.runInContext(fn,c);
  for(const write of [true,false]) assert.throws(()=>c.clientData_({dataSheet:'existing'},write),/no replacement/);
  assert.equal(created,0);assert.equal(updated,0);
});
test('accessible databases continue using the existing spreadsheet',()=>{
  const db={};const c={SpreadsheetApp:{openById:()=>db}};
  vm.createContext(c);vm.runInContext(fn,c);
  assert.equal(c.clientData_({dataSheet:'existing'},true),db);
});

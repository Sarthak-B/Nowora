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

test('view-only clients cannot change anything; the owner always can', () => {
  const src = source.slice(source.indexOf('function planOff_'), source.indexOf('function siteRepo_'));
  const c = {}; vm.createContext(c); vm.runInContext(src, c);
  assert.throws(() => c.writable_({editAccess: 'off'}), /view-only/);
  assert.throws(() => c.writable_({editAccess: ' OFF '}), /view-only/);
  assert.equal(c.writable_({editAccess: 'off', _owner: true})._owner, true);
  for (const a of ['', 'auto', 'on']) assert.doesNotThrow(() => c.writable_({editAccess: a}));
  for (const action of ['portal_request', 'site_publish', 'site_restore', 'db_save_table', 'db_delete_table', 'db_save_row', 'db_delete_rows'])
    assert.match(source, new RegExp(`case '${action}':[^\\n]*writable_\\(portalClient_\\(body\\)\\)`), action);
  for (const action of ['portal', 'db_get', 'db_rev', 'site_source'])
    assert.doesNotMatch(source, new RegExp(`case '${action}':[^\\n]*writable_`), action);
});

test('turning the care plan off on a live site locks everything the plan includes', () => {
  const src = source.slice(source.indexOf('function planOff_'), source.indexOf('function siteRepo_'));
  const c = {}; vm.createContext(c); vm.runInContext(src, c);
  for (const cl of [{status: 'live', carePlan: 'no', editAccess: 'on'}, {status: 'live', carePlan: '', editAccess: 'auto'}, {status: 'paused', carePlan: 'yes'}]) {
    assert.throws(() => c.writable_(cl), /care plan/, JSON.stringify(cl));
    assert.equal(c.readOnly_(cl), true);
    assert.equal(c.editReason_(Object.assign({repo: 'a/b'}, cl)), 'no-plan');
  }
  assert.doesNotThrow(() => c.writable_({status: 'live', carePlan: 'yes'}));
  assert.equal(c.editReason_({repo: 'a/b', status: 'live', carePlan: 'yes'}), '');
  assert.doesNotThrow(() => c.writable_({status: 'building', carePlan: 'no'}));
  assert.doesNotThrow(() => c.writable_({status: 'live', carePlan: 'no', _owner: true}));
});

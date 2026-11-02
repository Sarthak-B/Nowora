import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const code = readFileSync(new URL('../apps-script/Backups.gs', import.meta.url), 'utf8');
function run(fail) {
  const props = {CLIENT_DB_ID: 'logs'}, copied = []; let released = false, manifest;
  const batch = {getId: () => 'batch', getUrl: () => 'private-folder', createFile: (name, value) => {manifest = JSON.parse(value);}};
  const context = {
    console: {log() {}}, MimeType: {PLAIN_TEXT: 'text/plain'},
    Utilities: {formatDate: () => 'test'},
    LockService: {getScriptLock: () => ({waitLock() {}, releaseLock() {released = true;}})},
    PropertiesService: {getScriptProperties: () => ({getProperty: k => props[k], setProperty: (k,v) => {props[k] = v;}})},
    SpreadsheetApp: {getActiveSpreadsheet: () => ({getId: () => 'studio'})},
    readAll_: () => [{id:'one',dataSheet:'client'}, {id:'duplicate',dataSheet:'client'}],
    DriveApp: {createFolder: () => ({getId: () => 'root', createFolder: () => batch}), getFileById: id => ({makeCopy() {
      if (id === fail) throw new Error('Unavailable');
      copied.push(id); return {getId: () => 'copy-' + id};
    }})}
  };
  vm.createContext(context); vm.runInContext(code,context);
  let error; try {context.backupNowora();} catch (e) {error=e;}
  return {props,copied,released,manifest,error};
}
test('backs up each distinct source and records complete manifest', () => {
  const r=run(); assert.equal(r.error,undefined); assert.deepEqual(r.copied,['studio','logs','client']);
  assert.equal(r.manifest.complete,true); assert.ok(r.props.LAST_BACKUP_SUCCESS); assert.equal(r.released,true);
});
test('partial failure retains successful copies and never reports success', () => {
  const r=run('logs'); assert.match(r.error.message,/incomplete/);
  assert.deepEqual(r.copied,['studio','client']); assert.equal(r.manifest.errors.length,1);
  assert.equal(r.props.LAST_BACKUP_SUCCESS,undefined); assert.equal(r.released,true);
});
test('restore fingerprint detects changes in values and table metadata', () => {
  const context={};vm.createContext(context);vm.runInContext(code,context);
  const book=(value,meta)=>({getSheets:()=>[{getName:()=> 'Orders',getDataRange:()=>({getValues:()=>[[value]],getFormulas:()=>[['']],getNumberFormats:()=>[['@']]}),getDeveloperMetadata:()=>[{getKey:()=> 'nowora_table',getValue:()=>meta}]}]});
  const original=context.backupFingerprint_(book('saved','schema'));
  assert.equal(original,context.backupFingerprint_(book('saved','schema')));
  assert.notEqual(original,context.backupFingerprint_(book('changed','schema')));
  assert.notEqual(original,context.backupFingerprint_(book('saved','missing')));
});

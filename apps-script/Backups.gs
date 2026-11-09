/** Private recovery snapshots. Run backupNowora manually before migrations.
 * Copies preserve sheet contents, formatting and metadata. Originals are untouched.
 * No automatic deletion: review storage and retention before enabling a schedule.
 * Restore by reviewing a copy, then copying verified data back under maintenance.
 * Script properties, credentials and uploaded media are not included.
 */
function backupNowora() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const studio = SpreadsheetApp.getActiveSpreadsheet();
    if (!studio) throw new Error('Run this from the bound make4yu project.');
    const sources = [{ id: studio.getId(), label: 'Studio' }];
    const logs = props.getProperty('CLIENT_DB_ID');
    if (logs) sources.push({ id: logs, label: 'Client logs' });
    readAll_('Clients').forEach(c => {
      if (c.dataSheet) sources.push({ id: String(c.dataSheet), label: 'Client ' + String(c.id) });
    });
    const unique = sources.filter((s, i) => sources.findIndex(x => x.id === s.id) === i);
    let folder;
    const folderId = props.getProperty('BACKUP_FOLDER_ID');
    if (folderId) folder = DriveApp.getFolderById(folderId);
    else {
      folder = DriveApp.createFolder('make4yu private backups');
      props.setProperty('BACKUP_FOLDER_ID', folder.getId());
    }
    const stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH-mm-ss');
    const batch = folder.createFolder(stamp);
    const report = { started: new Date().toISOString(), complete: false, files: [], errors: [] };
    unique.forEach(source => {
      try {
        const copy = DriveApp.getFileById(source.id).makeCopy(source.label + ' ' + stamp, batch);
        report.files.push({ sourceId: source.id, copyId: copy.getId(), label: source.label });
      } catch (error) {
        report.errors.push({ sourceId: source.id, error: String(error.message || error) });
      }
    });
    report.complete = report.errors.length === 0;
    report.finished = new Date().toISOString();
    batch.createFile('manifest.json', JSON.stringify(report, null, 2), MimeType.PLAIN_TEXT);
    props.setProperty('LAST_BACKUP_ATTEMPT', report.finished);
    props.setProperty('LAST_BACKUP_FOLDER_ID', batch.getId());
    if (report.complete) props.setProperty('LAST_BACKUP_SUCCESS', report.finished);
    console.log(JSON.stringify({ complete: report.complete, copied: report.files.length, failed: report.errors.length, folder: batch.getUrl() }));
    if (!report.complete) throw new Error('Backup incomplete. Review manifest.json; original data is unchanged.');
    return { ok: true, copied: report.files.length, folder: batch.getUrl() };
  } finally { lock.releaseLock(); }
}

/** Restore drill: create independent copies from the latest complete backup.
 * Never overwrites production. Retains restored copies and a verification report.
 */
function verifyLatestBackup() {
  const id = PropertiesService.getScriptProperties().getProperty('LAST_BACKUP_FOLDER_ID');
  if (!id) throw new Error('Run a complete backup first.');
  const folder = DriveApp.getFolderById(id);
  const manifests = folder.getFilesByName('manifest.json');
  if (!manifests.hasNext()) throw new Error('Backup manifest missing.');
  const manifest = JSON.parse(manifests.next().getBlob().getDataAsString());
  if (!manifest.complete) throw new Error('Latest backup is incomplete.');
  const restored = folder.createFolder('Restore verification ' + Date.now());
  const results = manifest.files.map(file => {
    const before = backupFingerprint_(SpreadsheetApp.openById(file.copyId));
    const copy = DriveApp.getFileById(file.copyId).makeCopy('RESTORE TEST ' + file.label, restored);
    const after = backupFingerprint_(SpreadsheetApp.openById(copy.getId()));
    return { label: file.label, copyId: copy.getId(), passed: before === after };
  });
  const report = { verifiedAt: new Date().toISOString(), passed: results.every(x => x.passed), results: results };
  restored.createFile('verification.json', JSON.stringify(report, null, 2), MimeType.PLAIN_TEXT);
  console.log(JSON.stringify({ passed: report.passed, checked: results.length, folder: restored.getUrl() }));
  if (!report.passed) throw new Error('Restore verification failed; inspect verification.json.');
  return report;
}

function backupFingerprint_(ss) {
  return JSON.stringify(ss.getSheets().map(sh => {
    const range = sh.getDataRange();
    return {name: sh.getName(), values: range.getValues(), formulas: range.getFormulas(),
      formats: range.getNumberFormats(), metadata: sh.getDeveloperMetadata().map(m => [m.getKey(), m.getValue()]).sort()};
  }));
}

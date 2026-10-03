const CONFIG = {
  SYNC_SHEET: 'sync_records',
  AUDIT_SHEET: 'audit_log',
  BACKUP_FOLDER: 'FP&CU Respaldos',
  SESSION_HOURS: 168,
  BACKUP_RETENTION_DAYS: 35,
  MAX_PUSH_RECORDS: 400
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('FP&CU')
    .addItem('Configurar servidor', 'setupFPCU')
    .addItem('Rotar clave privada', 'rotateAccessKey')
    .addSeparator()
    .addItem('Crear respaldo ahora', 'createBackupNow')
    .addItem('Ver estado del servidor', 'showServerStatus')
    .addToUi();
}

function setupFPCU() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abre este script desde la hoja FP&CU Datos.');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());
  if (!props.getProperty('SESSION_SECRET')) props.setProperty('SESSION_SECRET', newSecret_());
  ensureSheet_(ss, CONFIG.SYNC_SHEET, ['clave','valor','t','borrado','recibido','dispositivo']);
  ensureSheet_(ss, CONFIG.AUDIT_SHEET, ['fecha','accion','dispositivo','detalle']);
  let accessKey = null;
  if (!props.getProperty('ACCESS_KEY_HASH')) accessKey = setNewAccessKey_();
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(t => t.getHandlerFunction() === 'scheduledBackup')) {
    ScriptApp.newTrigger('scheduledBackup').timeBased().everyDays(1).atHour(3).create();
  }
  scheduledBackup();
  if (accessKey) showKey_(accessKey, 'Configuracion terminada');
  else SpreadsheetApp.getUi().alert('FP&CU', 'Servidor configurado. La clave privada existente sigue vigente.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function rotateAccessKey() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHEET_ID')) throw new Error('Primero ejecuta Configurar servidor.');
  const accessKey = setNewAccessKey_();
  props.setProperty('SESSION_SECRET', newSecret_());
  audit_('rotar_clave', '', 'Todas las sesiones anteriores quedaron invalidadas');
  showKey_(accessKey, 'Nueva clave privada');
}

function showServerStatus() {
  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty('SHEET_ID');
  const hasKey = !!props.getProperty('ACCESS_KEY_HASH');
  const last = props.getProperty('LAST_BACKUP_DAY') || 'sin respaldo';
  SpreadsheetApp.getUi().alert('Estado FP&CU', `Hoja conectada: ${ssId ? 'si' : 'no'}\nClave privada: ${hasKey ? 'configurada' : 'no'}\nUltimo respaldo: ${last}`, SpreadsheetApp.getUi().ButtonSet.OK);
}

function createBackupNow() {
  const name = scheduledBackup();
  SpreadsheetApp.getUi().alert('FP&CU', 'Respaldo creado: ' + name, SpreadsheetApp.getUi().ButtonSet.OK);
}

function doGet() {
  return json_({ok:true,service:'FP&CU Sync',auth:'required'});
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'login') {
      if (!verifyAccessKey_(body.accessKey || '')) {
        audit_('login_fallido', body.device || '', 'clave incorrecta');
        return json_({ok:false,error:'clave_privada_incorrecta'});
      }
      const token = issueSession_();
      audit_('login', body.device || '', 'ok');
      return json_({ok:true,session:token,serverTime:Date.now()});
    }
    const auth = verifySession_(body.session || '');
    if (!auth.ok) return json_({ok:false,error:'sesion'});
    if (body.action === 'ping') return json_({ok:true,serverTime:Date.now()});
    if (body.action === 'pull') {
      const since = Math.max(0, Number(body.since || 0));
      const result = pull_(since);
      audit_('pull', body.device || '', String(result.records.length));
      return json_({ok:true,records:result.records,totalRecords:result.totalRecords,serverTime:Date.now()});
    }
    if (body.action === 'push') {
      const records = Array.isArray(body.records) ? body.records : [];
      if (records.length > CONFIG.MAX_PUSH_RECORDS) throw new Error('demasiados_registros');
      const accepted = push_(records, body.device || '');
      maybeDailyBackup_();
      audit_('push', body.device || '', String(accepted));
      return json_({ok:true,accepted,serverTime:Date.now()});
    }
    if (body.action === 'backup') {
      const file = scheduledBackup();
      audit_('backup', body.device || '', file || 'ok');
      return json_({ok:true,file,serverTime:Date.now()});
    }
    return json_({ok:false,error:'accion'});
  } catch (err) {
    return json_({ok:false,error:String(err && err.message ? err.message : err)});
  }
}

function setNewAccessKey_() {
  const raw = 'FPCU-' + Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
  PropertiesService.getScriptProperties().setProperty('ACCESS_KEY_HASH', sha256Hex_(raw));
  return raw;
}

function verifyAccessKey_(raw) {
  if (!raw) return false;
  const stored = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY_HASH') || '';
  return constantTimeEqual_(sha256Hex_(String(raw)), stored);
}

function issueSession_() {
  const payload = {sub:'owner',iat:Date.now(),exp:Date.now()+CONFIG.SESSION_HOURS*60*60*1000,v:1};
  const p = b64url_(JSON.stringify(payload));
  const sig = b64urlBytes_(Utilities.computeHmacSha256Signature(p, sessionSecret_()));
  return p + '.' + sig;
}

function verifySession_(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return {ok:false};
    const expected = b64urlBytes_(Utilities.computeHmacSha256Signature(parts[0], sessionSecret_()));
    if (!constantTimeEqual_(expected, parts[1])) return {ok:false};
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(pad64_(parts[0]))).getDataAsString());
    if (payload.sub !== 'owner' || !payload.exp || Date.now() > Number(payload.exp)) return {ok:false};
    return {ok:true};
  } catch (_) { return {ok:false}; }
}

function push_(records, device) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = syncSheet_(), values = sh.getDataRange().getValues(), idx = {};
    for (let i=1;i<values.length;i++) idx[String(values[i][0])] = i+1;
    let accepted = 0;
    for (const r of records) {
      if (!r || !r.k) continue;
      const key=String(r.k), t=Number(r.t||0), del=!!r.d, val=del?'':String(r.v||''), received=Date.now();
      const row=idx[key];
      if (row) {
        const oldT=Number(sh.getRange(row,3).getValue()||0);
        if (t < oldT) continue;
        sh.getRange(row,1,1,6).setValues([[key,val,t,del,received,device]]);
      } else {
        sh.appendRow([key,val,t,del,received,device]); idx[key]=sh.getLastRow();
      }
      accepted++;
    }
    return accepted;
  } finally { lock.releaseLock(); }
}

function pull_(since) {
  const sh=syncSheet_(), values=sh.getDataRange().getValues(), records=[];
  for (let i=1;i<values.length;i++) {
    const [k,v,t,d,received,device]=values[i];
    if (!k) continue;
    if (Number(received||0) > since) records.push({k:String(k),v:String(v||''),t:Number(t||0),d:d===true||String(d).toUpperCase()==='TRUE',received:Number(received||0),device:String(device||'')});
  }
  return {records,totalRecords:Math.max(0,values.length-1)};
}

function scheduledBackup() {
  const records=pull_(0).records;
  const payload={schema:'fpcu_server_backup_v1',created_at:new Date().toISOString(),records};
  const folder=backupFolder_();
  const stamp=Utilities.formatDate(new Date(),Session.getScriptTimeZone()||'America/Bogota','yyyy-MM-dd_HHmmss');
  const name='fpcu-backup-'+stamp+'.json';
  folder.createFile(name,JSON.stringify(payload,null,2),MimeType.PLAIN_TEXT);
  PropertiesService.getScriptProperties().setProperty('LAST_BACKUP_DAY',Utilities.formatDate(new Date(),Session.getScriptTimeZone()||'America/Bogota','yyyy-MM-dd'));
  pruneBackups_(folder);
  return name;
}

function maybeDailyBackup_() {
  const tz=Session.getScriptTimeZone()||'America/Bogota', today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd'), props=PropertiesService.getScriptProperties();
  if (props.getProperty('LAST_BACKUP_DAY') !== today) scheduledBackup();
}

function pruneBackups_(folder) {
  const cutoff=Date.now()-CONFIG.BACKUP_RETENTION_DAYS*24*60*60*1000, files=folder.getFiles();
  while (files.hasNext()) { const f=files.next(); if (f.getName().indexOf('fpcu-backup-')===0 && f.getDateCreated().getTime()<cutoff) f.setTrashed(true); }
}

function syncSheet_(){return spreadsheet_().getSheetByName(CONFIG.SYNC_SHEET)||ensureSheet_(spreadsheet_(),CONFIG.SYNC_SHEET,['clave','valor','t','borrado','recibido','dispositivo'])}
function spreadsheet_(){const id=PropertiesService.getScriptProperties().getProperty('SHEET_ID');if(!id)throw new Error('ejecuta_setupFPCU');return SpreadsheetApp.openById(id)}
function ensureSheet_(ss,name,headers){let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);if(sh.getLastRow()===0)sh.appendRow(headers);return sh}
function audit_(action,device,detail){try{const sh=spreadsheet_().getSheetByName(CONFIG.AUDIT_SHEET)||ensureSheet_(spreadsheet_(),CONFIG.AUDIT_SHEET,['fecha','accion','dispositivo','detalle']);sh.appendRow([new Date(),action,device,detail])}catch(_){}}
function backupFolder_(){const props=PropertiesService.getScriptProperties(),id=props.getProperty('BACKUP_FOLDER_ID');if(id){try{return DriveApp.getFolderById(id)}catch(_){}}const it=DriveApp.getFoldersByName(CONFIG.BACKUP_FOLDER);const folder=it.hasNext()?it.next():DriveApp.createFolder(CONFIG.BACKUP_FOLDER);props.setProperty('BACKUP_FOLDER_ID',folder.getId());return folder}
function sessionSecret_(){const s=PropertiesService.getScriptProperties().getProperty('SESSION_SECRET');if(!s)throw new Error('ejecuta_setupFPCU');return s}
function newSecret_(){return Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid()}
function sha256Hex_(text){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text),Utilities.Charset.UTF_8).map(b=>('0'+((b<0?b+256:b).toString(16))).slice(-2)).join('')}
function constantTimeEqual_(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
function b64url_(text){return Utilities.base64EncodeWebSafe(text,Utilities.Charset.UTF_8).replace(/=+$/,'')}
function b64urlBytes_(bytes){return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'')}
function pad64_(s){while(s.length%4)s+='=';return s}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)}
function showKey_(key,title){SpreadsheetApp.getUi().alert(title, 'COPIA ESTA CLAVE Y GUARDALA EN TU GESTOR DE CONTRASENAS:\n\n'+key+'\n\nNo la subas a GitHub ni la compartas.', SpreadsheetApp.getUi().ButtonSet.OK)}
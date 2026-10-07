/**
 * FP&CU v2 — servidor privado en Google Apps Script.
 *
 * Hoja "sync_records": un registro por fila (sincronización por registro).
 * Seguridad: clave privada FPCU-... (solo se guarda su hash SHA-256),
 * sesiones firmadas con HMAC, bloqueo temporal tras intentos fallidos.
 * Respaldos: JSON diario en Drive ("FP&CU Respaldos"), retención 35 días.
 *
 * Este archivo no contiene datos ni claves. Se puede publicar en GitHub.
 */

var SHEET_RECORDS = 'sync_records';
var SHEET_AUDIT = 'audit_log';
var HEADERS = ['clave', 'valor', 't', 'borrado', 'recibido', 'dispositivo', 'seq'];
var AUDIT_HEADERS = ['fecha', 'accion', 'dispositivo', 'registros', 'resultado'];
var SESSION_DAYS = 30;          // duración de la sesión en cada dispositivo
var BACKUP_FOLDER = 'FP&CU Respaldos';
var BACKUP_KEEP_DAYS = 35;
var MAX_FAILS = 8;              // intentos fallidos permitidos...
var FAIL_WINDOW_SEC = 900;      // ...en 15 minutos
var MAX_VALUE_CHARS = 45000;

// ---------------------------------------------------------------- menú

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FP&CU')
    .addItem('Configurar servidor', 'configurarServidor')
    .addItem('Rotar clave privada', 'rotarClave')
    .addItem('Crear respaldo ahora', 'crearRespaldoAhora')
    .addItem('Ver estado del servidor', 'verEstado')
    .addToUi();
}

function configurarServidor() {
  var ui = SpreadsheetApp.getUi();
  var p = props_();
  ensureSheets_();
  ensureTrigger_();
  p.setProperty('SPREADSHEET_ID', SpreadsheetApp.getActive().getId());
  if (!p.getProperty('SEQ')) p.setProperty('SEQ', '0');
  if (p.getProperty('KEY_HASH') && p.getProperty('KEY_VER')) {
    var r = ui.alert('El servidor ya está configurado',
      'Hojas y respaldo diario verificados.\n\n¿Quieres generar una clave privada nueva? Todas las sesiones abiertas se cerrarán.',
      ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  issueKey_();
  audit_('configurar', 'hoja', 0, 'ok');
}

function rotarClave() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Rotar clave privada', 'Se generará una clave nueva y todos los dispositivos tendrán que volver a entrar. ¿Continuar?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  issueKey_();
  audit_('rotar_clave', 'hoja', 0, 'ok');
}

function crearRespaldoAhora() {
  var f = backup_('manual');
  SpreadsheetApp.getUi().alert('Respaldo creado', f.getName() + '\nCarpeta: ' + BACKUP_FOLDER, SpreadsheetApp.getUi().ButtonSet.OK);
}

function verEstado() {
  var st = status_();
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { /* sin despliegue */ }
  var msg = [
    'Registros activos: ' + st.total,
    'Registros borrados (lápidas): ' + st.deleted,
    'Secuencia del servidor: ' + st.seq,
    'Clave configurada: ' + (st.configured ? 'sí' : 'no'),
    'Duración de sesión: ' + SESSION_DAYS + ' días',
    'Respaldo diario: ' + (st.trigger ? 'activo' : 'no programado'),
    'Último respaldo: ' + (st.lastBackup || 'ninguno'),
    'URL /exec: ' + (url || 'publica la app web para verla')
  ].join('\n');
  SpreadsheetApp.getUi().alert('Estado de FP&CU', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

// Disparador diario (debe ser función pública)
function respaldoDiario() { backup_('diario'); }

// ---------------------------------------------------------------- web app

function doGet() {
  return out_({ ok: true, app: 'FPCU', version: 2, msg: 'Servidor activo. Sin sesión no entrega datos.' });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); }
  catch (x) { return out_({ ok: false, code: 'bad', error: 'Solicitud no válida.' }); }
  try {
    switch (req.action) {
      case 'ping': return out_({ ok: true, app: 'FPCU', version: 2 });
      case 'login': return out_(login_(req));
      case 'pull': auth_(req); return out_(pull_(req));
      case 'push': auth_(req); return out_(push_(req));
      case 'status': auth_(req); return out_(Object.assign({ ok: true }, status_()));
      case 'quick': return out_(quick_(req));
      case 'shortcutKey': auth_(req); return out_(shortcutKey_());
      case 'shortcutOff': auth_(req); props_().deleteProperty('SHORTCUT_HASH'); audit_('atajos_off', req.device, 0, 'ok'); return out_({ ok: true });
      default: return out_({ ok: false, code: 'bad', error: 'Acción desconocida.' });
    }
  } catch (err) {
    return out_({ ok: false, code: err.code || 'server', error: String(err.message || err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- seguridad

function props_() { return PropertiesService.getScriptProperties(); }

function issueKey_() {
  var p = props_();
  var raw = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toUpperCase();
  var key = 'FPCU-' + raw.match(/.{1,8}/g).join('-');
  p.setProperty('KEY_HASH', sha256_(normKey_(key)));
  p.setProperty('HMAC_SECRET', Utilities.getUuid() + Utilities.getUuid());
  p.setProperty('KEY_VER', String(Number(p.getProperty('KEY_VER') || '0') + 1));
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,sans-serif;padding:6px">' +
    '<p style="margin:0 0 10px">Copia esta clave en tu gestor de contraseñas. <b>No se volverá a mostrar</b> y no la envíes por chat.</p>' +
    '<textarea id="k" readonly style="width:100%;height:70px;font:600 14px monospace;padding:8px">' + key + '</textarea>' +
    '<p><button onclick="var t=document.getElementById(\'k\');t.select();document.execCommand(\'copy\');this.textContent=\'Copiada\'">Copiar clave</button></p>' +
    '</div>').setWidth(460).setHeight(230);
  SpreadsheetApp.getUi().showModalDialog(html, 'Clave privada de FP&CU');
}

function normKey_(k) { return String(k || '').trim().toUpperCase().replace(/\s+/g, ''); }

function sha256_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function sign_(payload) {
  var sig = Utilities.computeHmacSha256Signature(payload, props_().getProperty('HMAC_SECRET'));
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');
}

function login_(req) {
  var p = props_();
  if (!p.getProperty('KEY_HASH')) return { ok: false, code: 'setup', error: 'El servidor no está configurado. En la hoja: FP&CU > Configurar servidor.' };
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('fails') || '0');
  if (fails >= MAX_FAILS) {
    audit_('login_bloqueado', req.device, 0, 'bloqueado');
    return { ok: false, code: 'locked', error: 'Demasiados intentos. Espera 15 minutos.' };
  }
  if (sha256_(normKey_(req.key)) !== p.getProperty('KEY_HASH')) {
    cache.put('fails', String(fails + 1), FAIL_WINDOW_SEC);
    Utilities.sleep(700);
    audit_('login', req.device, 0, 'clave incorrecta');
    return { ok: false, code: 'badkey', error: 'Clave incorrecta.' };
  }
  var exp = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({ exp: exp, dv: String(req.device || '').slice(0, 40), v: p.getProperty('KEY_VER') }));
  audit_('login', req.device, 0, 'ok');
  return { ok: true, token: payload + '.' + sign_(payload), exp: exp };
}

function auth_(req) {
  var fail = function () { var e = new Error('Sesión vencida o no válida. Vuelve a entrar con tu clave.'); e.code = 'auth'; throw e; };
  var parts = String(req.token || '').split('.');
  if (parts.length !== 2 || !props_().getProperty('HMAC_SECRET')) fail();
  if (sign_(parts[0]) !== parts[1]) fail();
  var data;
  try { data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); } catch (e) { fail(); }
  if (!data || data.exp < Date.now() || String(data.v) !== String(props_().getProperty('KEY_VER'))) fail();
  return data;
}

// ---------------------------------------------------------------- datos

function ss_() {
  var id = props_().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}

function ensureSheets_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_RECORDS);
  if (sh && sh.getMaxColumns() < HEADERS.length) sh.insertColumnsAfter(sh.getMaxColumns(), HEADERS.length - sh.getMaxColumns());
  if (sh) {
    var head = sh.getRange(1, 1, 1, sh.getMaxColumns()).getValues()[0].slice(0, HEADERS.length).join('|');
    if (head !== HEADERS.join('|')) {
      if (sh.getLastRow() > 1) {
        sh.setName(SHEET_RECORDS + '_v1_' + Utilities.formatDate(new Date(), 'America/Bogota', 'yyyyMMdd_HHmm'));
        sh = null;
      } else {
        sh.clear();
      }
    }
  }
  if (!sh) sh = ss.getSheetByName(SHEET_RECORDS) || ss.insertSheet(SHEET_RECORDS);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.getRange('A:B').setNumberFormat('@');
  sh.setFrozenRows(1);
  var au = ss.getSheetByName(SHEET_AUDIT) || ss.insertSheet(SHEET_AUDIT);
  au.getRange(1, 1, 1, AUDIT_HEADERS.length).setValues([AUDIT_HEADERS]).setFontWeight('bold');
  au.setFrozenRows(1);
}

function readAll_(sh) {
  var n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, HEADERS.length).getValues() : [];
}

function rowToRec_(r) {
  return { k: String(r[0]), v: String(r[1]), t: Number(r[2]), d: Number(r[3]) ? 1 : 0, dv: String(r[5] || ''), s: Number(r[6]) };
}

function pull_(req) {
  var sh = ss_().getSheetByName(SHEET_RECORDS);
  var since = Number(req.since) || 0;
  var limit = Math.min(Number(req.limit) || 1000, 2000);
  var rows = readAll_(sh);
  var total = 0;
  var fresh = [];
  rows.forEach(function (r) {
    if (!r[0]) return;
    if (!Number(r[3])) total++;
    if (Number(r[6]) > since) fresh.push(rowToRec_(r));
  });
  fresh.sort(function (a, b) { return a.s - b.s; });
  var page = fresh.slice(0, limit);
  return { ok: true, records: page, cursor: page.length ? page[page.length - 1].s : since, more: fresh.length > limit, total: total };
}

function push_(req) {
  var recs = Array.isArray(req.records) ? req.records : [];
  if (recs.length > 500) { var e = new Error('Demasiados registros en un envío.'); e.code = 'bad'; throw e; }
  var dev = String(req.device || '').slice(0, 40);
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var p = props_();
    var sh = ss_().getSheetByName(SHEET_RECORDS);
    var rows = readAll_(sh);
    var index = {};
    rows.forEach(function (r, i) { if (r[0]) index[String(r[0])] = i; });
    var seq = Number(p.getProperty('SEQ') || '0');
    var now = Utilities.formatDate(new Date(), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss");
    var results = [];
    var accepted = 0;
    recs.forEach(function (rec) {
      var k = String(rec.k || '');
      var v = String(rec.v == null ? '' : rec.v);
      var t = Number(rec.t);
      if (!/^[a-z]+:[A-Za-z0-9._-]{1,120}$/.test(k) || !t || v.length > MAX_VALUE_CHARS) {
        results.push({ k: k, status: 'invalid' });
        return;
      }
      var i = index[k];
      if (i !== undefined) {
        var cur = rows[i];
        var curT = Number(cur[2]);
        if (curT > t || (curT === t && String(cur[5]) >= dev)) {
          results.push(curT === t ? { k: k, status: 'ok' } : { k: k, status: 'stale', rec: rowToRec_(cur) });
          return;
        }
      }
      seq++;
      var row = [k, rec.d ? '' : v, t, rec.d ? 1 : 0, now, dev, seq];
      if (i !== undefined) rows[i] = row; else { index[k] = rows.length; rows.push(row); }
      accepted++;
      results.push({ k: k, status: 'ok' });
    });
    if (accepted) {
      sh.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
      p.setProperty('SEQ', String(seq));
    }
    var total = rows.filter(function (r) { return r[0] && !Number(r[3]); }).length;
    audit_('push', dev, accepted, 'ok');
    return { ok: true, results: results, cursor: seq, total: total };
  } finally {
    lock.releaseLock();
  }
}

function status_() {
  var p = props_();
  var sh = ss_().getSheetByName(SHEET_RECORDS);
  var rows = sh ? readAll_(sh) : [];
  var total = 0, deleted = 0;
  rows.forEach(function (r) { if (!r[0]) return; if (Number(r[3])) deleted++; else total++; });
  var trig = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'respaldoDiario'; });
  return {
    total: total, deleted: deleted, seq: Number(p.getProperty('SEQ') || '0'),
    configured: !!p.getProperty('KEY_HASH'), trigger: trig,
    lastBackup: p.getProperty('LAST_BACKUP') || null, sessionDays: SESSION_DAYS, shortcut: !!p.getProperty('SHORTCUT_HASH')
  };
}

// ---------------------------------------------------------------- Siri / Atajos
// Llave aparte, solo para AGREGAR registros desde un Atajo del iPhone. No permite leer datos.

function shortcutKey_() {
  var raw = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toUpperCase().slice(0, 32);
  var key = 'ATJ-' + raw.match(/.{1,8}/g).join('-');
  props_().setProperty('SHORTCUT_HASH', sha256_(normKey_(key)));
  audit_('atajos_llave', 'app', 0, 'ok');
  return { ok: true, key: key };
}

function parseMonto_(v) {
  if (typeof v === 'number') return v;
  var t = String(v || '').toLowerCase();
  var mult = /mill[oó]n|millones/.test(t) ? 1000000 : /\bmil\b|\dmil/.test(t) ? 1000 : 1;
  var x = t.replace(/[^\d,.]/g, '');
  if (x.indexOf(',') >= 0) x = x.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}(\.|$)/.test(x)) x = x.replace(/\./g, '');
  var n = Number(x);
  return isFinite(n) ? n * mult : 0;
}

function cop_(n) {
  var r = Math.round(n * 100) / 100, i = Math.floor(r), c = Math.round((r - i) * 100);
  return '$' + String(i).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (c ? ',' + ('0' + c).slice(-2) : '');
}

function quick_(req) {
  var p = props_(), fail = function (m) { return { ok: false, code: 'quick', error: m, msg: m }; };
  if (!p.getProperty('SHORTCUT_HASH')) return fail('Los atajos no están activados. Crea la llave en la app: Ajustes > Siri y Atajos.');
  var cache = CacheService.getScriptCache(), n = Number(cache.get('quick_n') || '0');
  if (n > 40) return fail('Demasiados registros seguidos. Espera unos minutos.');
  cache.put('quick_n', String(n + 1), 600);
  if (sha256_(normKey_(req.llave || req.key)) !== p.getProperty('SHORTCUT_HASH')) { audit_('atajo', 'atajo', 0, 'llave incorrecta'); return fail('La llave del atajo no es válida.'); }
  var tipo = String(req.tipo || 'gasto').toLowerCase().trim();
  if (['gasto', 'ingreso', 'compra'].indexOf(tipo) < 0) return fail('Tipo no válido: usa gasto, ingreso o compra.');
  var monto = Math.round(parseMonto_(req.monto) * 100) / 100;
  if (!(monto > 0) || monto > 1e9) return fail('No entendí el monto.');
  var desc = String(req.desc || req.descripcion || '').trim().slice(0, 80);
  var cat = String(req.cat || req.categoria || '').trim().slice(0, 30) || 'Otros';
  cat = cat.charAt(0).toUpperCase() + cat.slice(1);
  var date = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd');
  var now = Date.now(), id = 's' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  var lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    var sh = ss_().getSheetByName(SHEET_RECORDS), rows = readAll_(sh), key, val, msg;
    if (tipo === 'compra') {
      var cards = [];
      rows.forEach(function (r) { if (String(r[0]).indexOf('card:') === 0 && !Number(r[3])) { try { var c = JSON.parse(String(r[1])); if (!c.archived) cards.push(c); } catch (e) { /* nada */ } } });
      cards.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var want = String(req.tarjeta || '').toLowerCase().trim();
      var card = (want && cards.filter(function (c) { return String(c.name).toLowerCase().indexOf(want) >= 0; })[0]) || cards[0];
      if (!card) return fail('No tienes tarjetas activas.');
      var cuotas = Math.min(48, Math.max(1, parseInt(req.cuotas, 10) || 1));
      key = 'buy:' + id;
      val = { id: id, card: card.id, date: date, amount: monto, desc: desc, type: 'propia', cat: cat, cuotas: cuotas, noInt: false, cxc: null, via: 'siri', created: now };
      msg = 'Listo: compra de ' + cop_(monto) + ' con ' + card.name + (cuotas > 1 ? ' a ' + cuotas + ' cuotas' : '') + (desc ? ', ' + desc : '') + '.';
    } else {
      key = 'mov:' + id;
      val = tipo === 'ingreso'
        ? { id: id, kind: 'ingreso', date: date, amount: monto, desc: desc || 'Ingreso', salary: false, via: 'siri', created: now }
        : { id: id, kind: 'gasto', date: date, amount: monto, desc: desc, cat: cat, pocket: null, via: 'siri', created: now };
      msg = 'Listo: ' + tipo + ' de ' + cop_(monto) + (desc ? ', ' + desc : '') + (tipo === 'gasto' ? ' (' + cat + ')' : '') + '.';
    }
    var seq = Number(p.getProperty('SEQ') || '0') + 1;
    sh.appendRow([key, JSON.stringify(val), now, 0, Utilities.formatDate(new Date(), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss"), 'atajo', seq]);
    p.setProperty('SEQ', String(seq));
    audit_('atajo_' + tipo, 'atajo', 1, 'ok');
    return { ok: true, msg: msg, key: key };
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- respaldos

function ensureTrigger_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'respaldoDiario'; });
  if (!has) ScriptApp.newTrigger('respaldoDiario').timeBased().everyDays(1).atHour(3).create();
}

function folder_() {
  var p = props_();
  var id = p.getProperty('BACKUP_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recrear */ } }
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  var f = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  p.setProperty('BACKUP_FOLDER_ID', f.getId());
  return f;
}

// Mismo formato que "Exportar JSON" de la app: se puede importar directamente.
function backup_(kind) {
  var sh = ss_().getSheetByName(SHEET_RECORDS);
  var records = {};
  readAll_(sh).forEach(function (r) {
    if (!r[0]) return;
    var v = null;
    if (!Number(r[3])) { try { v = JSON.parse(String(r[1])); } catch (e) { v = String(r[1]); } }
    records[String(r[0])] = { v: v, t: Number(r[2]), d: Number(r[3]) ? 1 : 0, dv: String(r[5] || '') };
  });
  var stamp = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd_HHmmss');
  var body = JSON.stringify({ app: 'FPCU', schema: 2, exported: new Date().toISOString(), source: 'servidor-' + kind, records: records });
  var folder = folder_();
  var file = folder.createFile('fpcu-backup-' + stamp + '.json', body, MimeType.PLAIN_TEXT);
  var limit = Date.now() - BACKUP_KEEP_DAYS * 24 * 3600 * 1000;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf('fpcu-backup-') === 0 && f.getDateCreated().getTime() < limit) f.setTrashed(true);
  }
  props_().setProperty('LAST_BACKUP', stamp);
  audit_('respaldo_' + kind, 'servidor', Object.keys(records).length, 'ok');
  return file;
}

// ---------------------------------------------------------------- auditoría

function audit_(action, device, n, result) {
  try {
    var sh = ss_().getSheetByName(SHEET_AUDIT);
    if (!sh) return;
    sh.appendRow([Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss'), action, String(device || ''), n || 0, result || '']);
    if (sh.getLastRow() > 6000) sh.deleteRows(2, 1000);
  } catch (e) { /* la auditoría nunca debe romper una operación */ }
}

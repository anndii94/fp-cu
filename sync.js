/*
 * FP&CU v2 — almacenamiento local y sincronización por registro.
 * - Cada dato es un registro con clave única ("tipo:id") y marca de tiempo.
 * - Los cambios se guardan primero en este dispositivo y se encolan.
 * - Sincronización: primero descarga lo nuevo del servidor, luego sube la cola.
 * - Conflictos: gana la escritura más reciente (t); empate por id de dispositivo.
 * - Los borrados son "lápidas" (d = 1) para que también se sincronicen.
 * Este archivo no contiene datos ni claves.
 */
(function () {
  'use strict';

  const C = Object.assign(
    { serverUrl: '', syncIntervalMs: 120000, saveDebounceMs: 3000, timeoutMs: 90000, batchSize: 100, demo: false },
    window.FPCU_CONFIG || {}
  );

  const K = {
    db: 'fpcu_db_v2',
    queue: 'fpcu_sync_queue_v2',
    meta: 'fpcu_sync_meta_v2',
    last: 'fpcu_sync_last_v2',
    session: 'fpcu_auth_session_v2',
    device: 'fpcu_device_id_v1'
  };

  const listeners = {};
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, data) {
    (listeners[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } });
  }

  const ls = {
    get(k, def) {
      try { const s = localStorage.getItem(k); return s == null ? def : JSON.parse(s); }
      catch (e) { return def; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; }
      catch (e) { emit('error', 'No se pudo guardar en este dispositivo: ' + e.message); return false; }
    },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
  };

  let device = '';
  try { device = String(localStorage.getItem(K.device) || '').replace(/"/g, ''); } catch (e) { /* nada */ }
  if (!device) {
    device = 'd-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    try { localStorage.setItem(K.device, device); } catch (e) { /* nada */ }
  }

  let db = ls.get(K.db, null);
  if (!db || typeof db.r !== 'object') db = { r: {} };
  let queue = new Set(ls.get(K.queue, []));
  let meta = Object.assign({ cursor: 0, serverTotal: null, firstSyncDone: false }, ls.get(K.meta, {}));
  let last = ls.get(K.last, null);
  let session = ls.get(K.session, null);

  const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
  const KEY_RE = /^[a-z]+:[A-Za-z0-9._-]{1,120}$/;

  function persist() { ls.set(K.db, db); ls.set(K.queue, Array.from(queue)); }
  function changed() { persist(); emit('change'); emitStatus(); }

  function newer(a, b) {
    if (!b) return true;
    if (a.t !== b.t) return a.t > b.t;
    return String(a.dv || '') > String(b.dv || '');
  }

  function stamp(k) {
    const prev = db.r[k];
    const now = Date.now();
    return prev && prev.t >= now ? prev.t + 1 : now;
  }

  // ---------- lectura ----------
  function get(k) { const x = db.r[k]; return x && !x.d ? clone(x.v) : null; }
  function list(prefix) {
    const out = [];
    for (const k in db.r) {
      if (k.indexOf(prefix) === 0) { const x = db.r[k]; if (!x.d) out.push(clone(x.v)); }
    }
    return out;
  }
  function count() { let n = 0; for (const k in db.r) if (!db.r[k].d) n++; return n; }

  // ---------- escritura ----------
  function write(k, v, del) {
    if (!KEY_RE.test(k)) throw new Error('Clave no válida: ' + k);
    db.r[k] = del ? { v: null, t: stamp(k), d: 1, dv: device } : { v: clone(v), t: stamp(k), d: 0, dv: device };
    queue.add(k);
  }
  function put(k, v) { write(k, v, false); changed(); schedule(); }
  function del(k) { if (!db.r[k] || db.r[k].d) return; write(k, null, true); changed(); schedule(); }
  // ops: [['put', clave, valor], ['del', clave]]  -> un solo guardado
  function tx(ops) {
    ops.forEach(function (op) {
      if (op[0] === 'put') write(op[1], op[2], false);
      else if (op[0] === 'del' && db.r[op[1]] && !db.r[op[1]].d) write(op[1], null, true);
    });
    changed(); schedule();
  }

  // ---------- importar / exportar ----------
  function exportData() {
    return { app: 'FPCU', schema: 2, exported: new Date().toISOString(), device: device, records: clone(db.r) };
  }

  function normalizeImport(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('El archivo no es un JSON válido.');
    if (obj.app !== 'FPCU' || Number(obj.schema) !== 2 || !obj.records) {
      throw new Error('Este archivo no es una apertura o respaldo de FP&CU v2.');
    }
    const out = [];
    const recs = obj.records;
    const entries = Array.isArray(recs) ? recs.map((r) => [r.k, r]) : Object.keys(recs).map((k) => [k, recs[k]]);
    entries.forEach(function (e) {
      const k = e[0], r = e[1] || {};
      if (!KEY_RE.test(String(k))) return;
      let v = r.v;
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch (x) { /* valor plano */ } }
      out.push([k, { v: r.d ? null : v, t: Number(r.t) || Date.now(), d: r.d ? 1 : 0, dv: r.dv || 'importado' }]);
    });
    return out;
  }

  function previewImport(obj) {
    const recs = normalizeImport(obj);
    const byType = {};
    let fresh = 0, older = 0;
    recs.forEach(function (e) {
      const t = e[0].split(':')[0];
      byType[t] = (byType[t] || 0) + 1;
      if (newer(e[1], db.r[e[0]])) fresh++; else older++;
    });
    const cfg = recs.find((e) => e[0] === 'cfg:main');
    return { total: recs.length, byType: byType, fresh: fresh, older: older, cfg: cfg ? cfg[1].v : null };
  }

  // Idempotente: conserva las marcas de tiempo del archivo, así que importar
  // dos veces el mismo archivo no duplica nada ni pisa cambios posteriores.
  function importData(obj) {
    const recs = normalizeImport(obj);
    let applied = 0, skipped = 0;
    recs.forEach(function (e) {
      if (newer(e[1], db.r[e[0]])) { db.r[e[0]] = e[1]; queue.add(e[0]); applied++; }
      else skipped++;
    });
    changed(); schedule(500);
    return { applied: applied, skipped: skipped };
  }

  function wipeLocal() {
    db = { r: {} }; queue = new Set(); meta = { cursor: 0, serverTotal: null, firstSyncDone: false }; last = null;
    ls.del(K.db); ls.del(K.queue); ls.del(K.meta); ls.del(K.last);
    emit('change'); emitStatus();
  }

  function redownload() {
    meta.cursor = 0; meta.firstSyncDone = false; ls.set(K.meta, meta);
    return sync();
  }

  // ---------- sincronización ----------
  let status = C.serverUrl ? 'idle' : 'local';
  let current = null, followUp = null, timer = null, retries = 0, progress = null;

  function mode() { return C.serverUrl ? 'server' : 'local'; }
  function sessionValid() { return !!(session && session.token && session.exp > Date.now()); }
  function getState() {
    return {
      status: status, mode: mode(), pending: queue.size, last: last, device: device,
      sessionValid: sessionValid(), sessionExp: session ? session.exp : null,
      serverTotal: meta.serverTotal, firstSyncDone: !!meta.firstSyncDone, localCount: count(), demo: !!C.demo,
      progress: progress, retries: retries
    };
  }
  function emitStatus() { emit('status', getState()); }
  function setStatus(s) { status = s; emitStatus(); }

  function schedule(ms) {
    if (mode() !== 'server') return;
    clearTimeout(timer);
    timer = setTimeout(sync, ms == null ? C.saveDebounceMs : ms);
  }

  async function call(action, payload) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const to = setTimeout(function () { if (ctrl) ctrl.abort(); }, C.timeoutMs);
    try {
      const res = await fetch(C.serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action, device: device }, payload || {})),
        redirect: 'follow',
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!res.ok) throw Object.assign(new Error('El servidor respondió ' + res.status), { code: 'http' });
      let j;
      try { j = await res.json(); }
      catch (e) {
        throw Object.assign(new Error('Respuesta no válida del servidor. Revisa la URL /exec y que el acceso sea "Cualquier usuario".'), { code: 'http' });
      }
      if (!j.ok) throw Object.assign(new Error(j.error || 'Error del servidor'), { code: j.code || 'server' });
      return j;
    } catch (e) {
      if (e.name === 'AbortError') throw Object.assign(new Error('El servidor tardó demasiado en responder.'), { code: 'net', timeout: true });
      if (!e.code) e.code = 'net';
      throw e;
    } finally { clearTimeout(to); }
  }

  async function login(key) {
    const j = await call('login', { key: String(key || '') });
    session = { token: j.token, exp: j.exp };
    ls.set(K.session, session);
    setStatus('idle');
    sync();
    return j;
  }

  function logout() { session = null; ls.del(K.session); setStatus('auth'); }

  function applyRemote(rec) {
    let v = null;
    if (!rec.d) { try { v = JSON.parse(rec.v); } catch (e) { v = rec.v; } }
    const inc = { v: v, t: Number(rec.t) || 0, d: rec.d ? 1 : 0, dv: rec.dv || '' };
    const cur = db.r[rec.k];
    if (cur && !newer(inc, cur)) return false;
    db.r[rec.k] = inc;
    queue.delete(rec.k);
    return true;
  }

  // Si ya hay una sincronización en curso, se encadena una pasada más al terminar.
  function sync() {
    if (current) {
      if (!followUp) followUp = current.then(function () { followUp = null; return sync(); });
      return followUp;
    }
    current = runSync().then(function () { current = null; }, function () { current = null; });
    return current;
  }

  async function runSync() {
    clearTimeout(timer);
    if (mode() !== 'server') { setStatus('local'); return; }
    if (!sessionValid()) { if (session) logout(); else setStatus('auth'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus('offline'); return; }
    setStatus('syncing');
    try {
      // 1) Descargar lo nuevo del servidor
      let more = true, guard = 0;
      while (more && guard++ < 60) {
        const j = await call('pull', { token: session.token, since: meta.cursor || 0, limit: 1000 });
        let touched = false;
        (j.records || []).forEach(function (r) { if (applyRemote(r)) touched = true; });
        meta.cursor = Number(j.cursor) || meta.cursor || 0;
        meta.serverTotal = j.total;
        more = !!j.more;
        ls.set(K.meta, meta);
        if (touched) { persist(); emit('change'); }
      }
      // 2) Subir la cola local
      const keys = Array.from(queue), B = Math.max(10, C.batchSize | 0);
      progress = keys.length > B ? { done: 0, total: keys.length } : null;
      for (let i = 0; i < keys.length; i += B) {
        const batch = keys.slice(i, i + B).filter((k) => db.r[k]);
        if (!batch.length) continue;
        const sent = {};
        const recs = batch.map(function (k) {
          const x = db.r[k];
          sent[k] = x.t;
          return { k: k, v: x.d ? '' : JSON.stringify(x.v), t: x.t, d: x.d ? 1 : 0 };
        });
        const j = await call('push', { token: session.token, records: recs });
        let touched = false;
        (j.results || []).forEach(function (r) {
          if (r.status === 'stale' && r.rec) { if (applyRemote(r.rec)) touched = true; }
          const cur = db.r[r.k];
          if (!cur || cur.t === sent[r.k]) queue.delete(r.k);
        });
        if (j.total != null) meta.serverTotal = j.total;
        persist();
        if (touched) emit('change');
        if (progress) { progress.done = Math.min(progress.total, i + batch.length); emitStatus(); }
      }
      progress = null; retries = 0;
      meta.firstSyncDone = true; ls.set(K.meta, meta);
      last = { at: Date.now(), ok: true }; ls.set(K.last, last);
      setStatus('ok');
    } catch (e) {
      progress = null;
      last = { at: Date.now(), ok: false, error: e.message }; ls.set(K.last, last);
      // Reintento automático: lo ya subido no se repite.
      if ((e.code === 'net' || e.code === 'http' || e.code === 'server') && retries < 5 && navigator.onLine !== false) {
        retries++;
        last.error = e.message + ' Reintentando automáticamente (' + retries + ' de 5).';
        ls.set(K.last, last);
        schedule(Math.min(60000, 4000 * Math.pow(2, retries - 1)));
      }
      if (e.code === 'auth') { session = null; ls.del(K.session); setStatus('auth'); }
      else if (e.code === 'net') setStatus(navigator.onLine === false ? 'offline' : 'error');
      else setStatus('error');
    }
  }

  async function api(action, payload) {
    if (!sessionValid()) throw Object.assign(new Error('Inicia sesión primero.'), { code: 'auth' });
    return call(action, Object.assign({ token: session.token }, payload || {}));
  }

  async function serverStatus() {
    if (!sessionValid()) throw Object.assign(new Error('Inicia sesión primero.'), { code: 'auth' });
    return call('status', { token: session.token });
  }

  if (mode() === 'server') {
    setInterval(function () { if (document.visibilityState !== 'hidden') sync(); }, C.syncIntervalMs);
    window.addEventListener('online', function () { sync(); });
    window.addEventListener('offline', function () { setStatus('offline'); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sync(); });
  }

  window.FPCU_STORE = {
    config: C, device: device,
    get: get, list: list, put: put, del: del, tx: tx, count: count,
    on: on, getState: getState, sync: sync, login: login, logout: logout, serverStatus: serverStatus, api: api,
    exportData: exportData, previewImport: previewImport, importData: importData,
    wipeLocal: wipeLocal, redownload: redownload
  };
})();

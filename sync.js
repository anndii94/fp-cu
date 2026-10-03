(() => {
'use strict';
const C=window.FPCU_CONFIG||{};
const SESSION_KEY='fpcu_auth_session_v1', META_KEY='fpcu_sync_meta_v1', QUEUE_KEY='fpcu_sync_queue_v1', LAST_KEY='fpcu_sync_last_v1', DEVICE_KEY='fpcu_device_id_v1';
let syncing=false,timer=null,booted=false;
const cfgReady=()=>C.APPS_SCRIPT_URL&&!String(C.APPS_SCRIPT_URL).startsWith('REEMPLAZAR_');
const jget=(k,fallback)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):fallback}catch{return fallback}};
const jset=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const deviceId=()=>{let x=localStorage.getItem(DEVICE_KEY);if(!x){x='dev-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);localStorage.setItem(DEVICE_KEY,x)}return x};
const session=()=>localStorage.getItem(SESSION_KEY)||'';
const setSession=v=>v?localStorage.setItem(SESSION_KEY,v):localStorage.removeItem(SESSION_KEY);
const hash=s=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h)^s.charCodeAt(i);return (h>>>0).toString(36)};
const now=()=>Date.now();
async function fetchTimeout(url,opts={},ms=20000){const ac=new AbortController(),id=setTimeout(()=>ac.abort(),ms);try{return await fetch(url,{...opts,signal:ac.signal,redirect:'follow'})}finally{clearTimeout(id)}}
async function post(body){
  const r=await fetchTimeout(C.APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)});
  const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{throw new Error('Respuesta no valida del servidor')}
  if(!j.ok)throw new Error(j.error||'Error del servidor');return j
}
function setStatus(text,kind=''){
  let b=document.getElementById('syncFloat');if(!b){b=document.createElement('div');b.id='syncFloat';b.className='sync-float';document.body.appendChild(b)}b.className='sync-float '+kind;b.textContent=text;
  const s=document.getElementById('syncSettingsStatus');if(s)s.textContent=text
}
function gate(){
  let g=document.getElementById('fpcuAuthGate');if(g)return g;
  g=document.createElement('div');g.id='fpcuAuthGate';g.className='auth-gate';
  g.innerHTML=`<div class="auth-card"><h1>FP&amp;CU</h1><p>La pagina no contiene tus datos financieros. Escribe la <strong>clave privada</strong> de FP&amp;CU para abrir y sincronizar este dispositivo.</p><div class="auth-key-row"><input id="fpcuPrivateKey" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" placeholder="Clave privada FP&CU"><button id="fpcuLoginBtn" class="btn primary" type="button">Abrir FP&amp;CU</button></div><label class="auth-show"><input id="fpcuShowKey" type="checkbox"> Mostrar clave</label><div id="authStatus" class="auth-status">Comprobando configuracion...</div><div class="auth-help">La clave nunca se guarda en GitHub. El servidor conserva solamente una huella criptografica y, tras validarla, entrega una sesion temporal.</div></div>`;
  document.body.appendChild(g);
  const input=g.querySelector('#fpcuPrivateKey'),btn=g.querySelector('#fpcuLoginBtn'),show=g.querySelector('#fpcuShowKey');
  btn.onclick=()=>loginWithPrivateKey();input.addEventListener('keydown',e=>{if(e.key==='Enter')loginWithPrivateKey()});show.onchange=()=>input.type=show.checked?'text':'password';
  return g
}
function showGate(msg){const g=gate();g.classList.remove('hidden');const s=document.getElementById('authStatus');if(s)s.textContent=msg||'Escribe tu clave privada para continuar.';setTimeout(()=>document.getElementById('fpcuPrivateKey')?.focus(),50)}
function hideGate(){gate().classList.add('hidden')}
async function loginWithPrivateKey(){
  const input=document.getElementById('fpcuPrivateKey'),btn=document.getElementById('fpcuLoginBtn'),s=document.getElementById('authStatus'),accessKey=(input?.value||'').trim();
  if(!accessKey){if(s)s.textContent='Escribe la clave privada.';return}
  if(btn)btn.disabled=true;if(s)s.textContent='Verificando clave...';
  try{const j=await post({action:'login',accessKey,device:deviceId()});setSession(j.session);if(input)input.value='';if(s)s.textContent='Acceso correcto.';hideGate();await syncNow(true)}catch(e){setSession('');if(s)s.textContent='No se pudo abrir: '+friendlyError(e.message)}finally{if(btn)btn.disabled=false}
}
function friendlyError(m){if(/clave|access/i.test(m))return 'la clave privada no coincide.';if(/fetch|network|Failed/i.test(m))return 'no se pudo contactar el servidor. Revisa internet y la URL de Apps Script.';return m}
function flatAll(){
  const m=new Map(),add=(k,v)=>m.set(k,JSON.stringify(v));
  add('core',{schema_version:state.schema_version,project:'FP&CU',currency:state.currency,timezone:state.timezone,live_start_date:state.live_start_date,account:state.account,monthly:{first_cycle:state.monthly?.first_cycle||'2026-10',default_income_label:state.monthly?.default_income_label||'Sueldo',default_income_amount:state.monthly?.default_income_amount||0},preferences:state.preferences||{},meta:{...(state.meta||{}),initialized:!!state.meta?.initialized}});
  for(const x of state.fixed_expenses||[])add('fixed:'+x.id,x);for(const x of state.pockets||[])add('pocket:'+x.id,x);for(const x of state.pocket_movements||[])add('pocketmov:'+x.id,x);for(const x of state.receivables||[])add('receivable:'+x.id,x);for(const x of state.transactions||[])add('tx:'+x.id,x);for(const x of state.debts||[])add('debt:'+x.id,x);for(const x of state.cards||[])add('card:'+x.id,x);for(const x of state.side_accounts||[])add('side:'+x.id,x);for(const [k,x] of Object.entries(state.monthly?.cycles||{}))add('cycle:'+k,x);for(const x of state.history||[])add('history:'+x.month,x);add('planning:amount',state.planning?.fixed_amount_schedule||{});add('planning:visibility',state.planning?.fixed_visibility_schedule||{});return m
}
function collectChanges(){
  if(!state?.meta?.initialized)return [];
  const flat=flatAll(),meta=jget(META_KEY,{}),queue=jget(QUEUE_KEY,[]),queued=new Map(queue.map(x=>[x.k,x])),ts=now();
  for(const [k,v] of flat){const h=hash(v),old=meta[k];if(!old||old.h!==h){const rec={k,v,t:ts,d:false};queued.set(k,rec);meta[k]={h,t:ts,d:false}}}
  for(const [k,old] of Object.entries(meta)){if(!flat.has(k)&&!old.d){const rec={k,v:'',t:ts,d:true};queued.set(k,rec);meta[k]={h:'',t:ts,d:true}}}
  jset(META_KEY,meta);const out=[...queued.values()];jset(QUEUE_KEY,out);return out
}
function upsert(arr,obj,id='id'){const i=arr.findIndex(x=>x?.[id]===obj?.[id]);if(i>=0)arr[i]=obj;else arr.push(obj)}
function remove(arr,val,id='id'){const i=arr.findIndex(x=>x?.[id]===val);if(i>=0)arr.splice(i,1)}
function applyOne(r){
  const meta=jget(META_KEY,{}),old=meta[r.k];if(old&&Number(old.t||0)>Number(r.t||0))return false;
  const del=!!r.d;let v=null;if(!del){try{v=JSON.parse(r.v)}catch{return false}}
  const [kind,...rest]=r.k.split(':'),id=rest.join(':');
  if(kind==='core'){if(!del){state.schema_version=v.schema_version||7;state.currency=v.currency||'COP';state.timezone=v.timezone||'America/Bogota';state.live_start_date=v.live_start_date||'2026-10-01';state.account=v.account||state.account;state.monthly=state.monthly||{cycles:{}};state.monthly.first_cycle=v.monthly?.first_cycle||'2026-10';state.monthly.default_income_label=v.monthly?.default_income_label||'Sueldo';state.monthly.default_income_amount=v.monthly?.default_income_amount||0;state.preferences={...(state.preferences||{}),...(v.preferences||{})};state.meta={...(state.meta||{}),...(v.meta||{}),real_mode:true}}}
  else if(kind==='fixed'){del?remove(state.fixed_expenses,id):upsert(state.fixed_expenses,v)}
  else if(kind==='pocket'){del?remove(state.pockets,id):upsert(state.pockets,v)}
  else if(kind==='pocketmov'){del?remove(state.pocket_movements,id):upsert(state.pocket_movements,v)}
  else if(kind==='receivable'){del?remove(state.receivables,id):upsert(state.receivables,v)}
  else if(kind==='tx'){del?remove(state.transactions,id):upsert(state.transactions,v)}
  else if(kind==='debt'){del?remove(state.debts,id):upsert(state.debts,v)}
  else if(kind==='card'){del?remove(state.cards,id):upsert(state.cards,v)}
  else if(kind==='side'){del?remove(state.side_accounts,id):upsert(state.side_accounts,v)}
  else if(kind==='cycle'){state.monthly.cycles=state.monthly.cycles||{};del?delete state.monthly.cycles[id]:state.monthly.cycles[id]=v}
  else if(kind==='history'){del?remove(state.history,id,'month'):upsert(state.history,v,'month')}
  else if(r.k==='planning:amount'){if(!del)state.planning.fixed_amount_schedule=v}
  else if(r.k==='planning:visibility'){if(!del)state.planning.fixed_visibility_schedule=v}
  else return false;
  meta[r.k]={h:del?'':hash(r.v),t:Number(r.t||0),d:del};jset(META_KEY,meta);return true
}
function applyRemote(records){
  let changed=false;window.FPCU_SYNC_SUSPEND=true;
  try{for(const r of records||[])changed=applyOne(r)||changed;if(changed){state=normalizeLiveState(state);syncCardAlias();localStorage.setItem(KEY,JSON.stringify(state));const hm=document.getElementById('historyMonths');if(hm)hm.dataset.done='';render();renderThemeControls?.()}}
  finally{window.FPCU_SYNC_SUSPEND=false}return changed
}
async function pull(since){return await post({action:'pull',session:session(),since:Math.max(0,Number(since||0)),device:deviceId()})}
async function pushQueue(){let q=jget(QUEUE_KEY,[]);while(q.length){const batch=q.slice(0,200),j=await post({action:'push',session:session(),device:deviceId(),records:batch});q=q.slice(batch.length);jset(QUEUE_KEY,q);if(j.serverTime)jset(LAST_KEY,{...(jget(LAST_KEY,{})),server:j.serverTime})}return true}
async function syncNow(forceFull=false){
  if(syncing||!cfgReady())return;const tok=session();if(!tok){showGate('Escribe tu clave privada para sincronizar.');return}
  syncing=true;setStatus('Sincronizando...','busy');
  try{
    let last=jget(LAST_KEY,{server:0,first:false});
    if(!last.first||forceFull){
      const first=await pull(0);
      if(first.totalRecords>0){applyRemote(first.records);last={server:first.serverTime||now(),first:true};jset(LAST_KEY,last)}
      else if(state?.meta?.initialized){collectChanges();await pushQueue();const again=await pull(0);applyRemote(again.records);last={server:again.serverTime||now(),first:true};jset(LAST_KEY,last)}
      else{last={server:first.serverTime||now(),first:true};jset(LAST_KEY,last);setStatus('Listo para importar apertura','ok');const t=document.getElementById('syncSettingsText');if(t)t.textContent='La base central esta vacia. Importa el archivo privado de apertura para iniciar.';return}
    }
    collectChanges();await pushQueue();last=jget(LAST_KEY,{server:0,first:true});const fresh=await pull(Math.max(0,Number(last.server||0)-5000));applyRemote(fresh.records);jset(LAST_KEY,{server:fresh.serverTime||now(),first:true});setStatus('Sincronizado','ok');const t=document.getElementById('syncSettingsText');if(t)t.textContent='Este dispositivo esta conectado con la copia central.'
  }catch(e){
    if(/sesion|session|autoriz/i.test(e.message)){setSession('');showGate('La sesion vencio. Escribe nuevamente la clave privada.')}
    setStatus('Sin sincronizar','bad');const t=document.getElementById('syncSettingsText');if(t)t.textContent='No se pudo sincronizar: '+friendlyError(e.message)
  }finally{syncing=false}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>syncNow(false),Number(C.SAVE_DEBOUNCE_MS)||3000)}
async function ping(){if(!session())return false;try{await post({action:'ping',session:session(),device:deviceId()});return true}catch{return false}}
function logout(){setSession('');setStatus('Sesion cerrada','');showGate('Sesion cerrada. Escribe tu clave privada para volver a abrir FP&CU.')}
async function backupNow(){if(!session())return showGate('Inicia sesion primero.');try{setStatus('Creando respaldo...','busy');const j=await post({action:'backup',session:session(),device:deviceId()});setStatus('Respaldo creado','ok');return j}catch(e){setStatus('Error de respaldo','bad');throw e}}
async function boot(){if(booted)return;booted=true;gate();if(!cfgReady()){showGate('La aplicacion esta preparada, pero falta conectar la URL de Apps Script en config.js.');return}if(await ping()){hideGate();await syncNow(true)}else{setSession('');showGate('Escribe la clave privada de FP&CU.')}}
function bind(){
  const syncBtn=document.getElementById('syncNowBtn'),logoutBtn=document.getElementById('logoutSyncBtn');
  if(syncBtn)syncBtn.onclick=()=>syncNow(true);if(logoutBtn)logoutBtn.onclick=logout;
  window.addEventListener('online',()=>syncNow(false));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncNow(false)});
  setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)syncNow(false)},Number(C.SYNC_INTERVAL_MS)||120000)
}
window.FPCUSync={schedule,syncNow,logout,backupNow,boot};window.addEventListener('load',()=>{bind();boot()});
})();
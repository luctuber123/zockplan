/* Zockplan – Verbindung zu Firebase.
   Stellt dieselbe Schnittstelle bereit, die die App aus dem Claude-Artefakt kennt
   (window.claude.use('db' | 'user' | 'assets')), nur eben mit Firebase dahinter. */
import { firebaseConfig } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, orderBy as fbOrderBy, getDoc, deleteField,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let fs;
try { fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { fs = initializeFirestore(app, {}); }

/* Wer rein darf, entscheiden allein die Firestore-Regeln in der Firebase-Konsole.
   Die App probiert nach der Anmeldung einen Schreibzugriff aufs eigene Profil:
   Lehnen die Regeln ab, gibt es „Kein Zugang“. Ohne Internet geht es offline weiter. */
async function checkAccess(u){
  const write = setDoc(doc(fs, 'profiles', u.uid), { name: u.displayName || '', photo: u.photoURL || '', at: Date.now(), seenAt: Date.now() }, { merge: true });
  try { await Promise.race([write, new Promise(r => setTimeout(r, 8000))]); return true; }
  catch (e) { return !(e && e.code === 'permission-denied'); }
}

/* ---------- Anmeldung ---------- */
let readyResolve; const ready = new Promise(r => { readyResolve = r; });
let currentUser = null;

function loginScreen(state, info){
  let el = document.getElementById('loginScreen');
  if (!el){
    el = document.createElement('div');
    el.id = 'loginScreen';
    el.className = 'overlay popwrap';
    el.innerHTML = `<div class="panel pop login" role="dialog" aria-modal="true" aria-labelledby="loginTitle">
      <div class="loginlogo">Zock<span>plan</span></div>
      <h2 id="loginTitle"></h2>
      <p class="empty-note" id="loginText"></p>
      <p class="err" id="loginErr" hidden></p>
      <div class="foot popfoot" id="loginFoot"></div>
    </div>`;
    document.body.append(el);
  }
  el.hidden = state === 'in';
  if (state === 'in') return;
  const foot = el.querySelector('#loginFoot'); foot.textContent = '';
  const btn = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; foot.append(b); return b; };
  if (state === 'out'){
    el.querySelector('#loginTitle').textContent = 'Willkommen';
    el.querySelector('#loginText').textContent = 'Melde dich mit deinem Google-Konto an. Nur ihr zwei habt Zugang.';
    btn('Mit Google anmelden', '', login);
  } else if (state === 'denied'){
    el.querySelector('#loginTitle').textContent = 'Kein Zugang';
    el.querySelector('#loginText').textContent = `Das Konto ${info} ist für Zockplan nicht freigeschaltet.`;
    btn('Anderes Konto', 'sec', () => signOut(auth));
  } else if (state === 'wait'){
    el.querySelector('#loginTitle').textContent = 'Einen Moment …';
    el.querySelector('#loginText').textContent = 'Anmeldung wird geprüft.';
  }
}
function showLoginError(msg){ const e = document.getElementById('loginErr'); if (e){ e.textContent = msg; e.hidden = !msg; } }

async function login(){
  showLoginError('');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { await signInWithPopup(auth, provider); }
  catch (e){
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')){
      try { await signInWithRedirect(auth, provider); } catch (e2){ showLoginError('Anmeldung fehlgeschlagen: ' + (e2.code || e2.message)); }
    } else if (!(e && e.code === 'auth/popup-closed-by-user')) {
      showLoginError('Anmeldung fehlgeschlagen: ' + ((e && (e.code || e.message)) || 'unbekannt'));
    }
  }
}
getRedirectResult(auth).catch(e => showLoginError('Anmeldung fehlgeschlagen: ' + (e.code || e.message)));

const start = () => loginScreen('wait');
if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

onAuthStateChanged(auth, async u => {
  if (!u){ currentUser = null; loginScreen('out'); return; }
  loginScreen('wait');
  if (!(await checkAccess(u))){ loginScreen('denied', u.email); return; }
  currentUser = u;
  loginScreen('in');
  readyResolve();
  setupPush();
});
window.zockAuth = { signOut: () => signOut(auth).then(() => location.reload()) };

/* ---------- Datenbank (gleiche Form wie im Artefakt) ---------- */
const mapErr = e => ({ code: e && e.code === 'permission-denied' ? 'invalid_argument'
  : e && e.code === 'resource-exhausted' ? 'quota_exceeded' : 'unavailable', message: (e && e.message) || '' });
const wrapDoc = s => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });
const wrapQuery = q => ({ docs: q.docs.map(wrapDoc), size: q.size, empty: q.empty, metadata: q.metadata });
const NOT_USED = new Set(['slots', 'guests']); /* gab es nur im Artefakt */

function docRef(path){
  const r = doc(fs, path);
  return {
    id: r.id, path,
    set: d => setDoc(r, d).catch(e => { throw mapErr(e); }),
    update: d => updateDoc(r, d).catch(e => { throw mapErr(e); }),
    delete: () => deleteDoc(r).catch(e => { throw mapErr(e); }),
    onSnapshot: (next, err) => onSnapshot(r, s => next(wrapDoc(s)), e => err && err(mapErr(e))),
  };
}
function colRef(path, order){
  if (NOT_USED.has(path)) return { onSnapshot: next => { setTimeout(() => next({ docs: [], size: 0, empty: true }), 0); return () => {}; }, orderBy: () => colRef(path), doc: id => docRef(path + '/' + (id || Math.random().toString(36).slice(2))) };
  const c = collection(fs, path);
  return {
    path,
    orderBy: f => colRef(path, f),
    doc: id => id ? docRef(path + '/' + id) : (() => { const r = doc(c); return docRef(path + '/' + r.id); })(),
    add: d => addDoc(c, d).then(r => ({ id: r.id })).catch(e => { throw mapErr(e); }),
    onSnapshot: (next, err) => onSnapshot(order ? query(c, fbOrderBy(order)) : c, q => next(wrapQuery(q)), e => err && err(mapErr(e))),
  };
}
const dbApi = { doc: docRef, collection: colRef };

/* ---------- Personen ---------- */
const profiles = {};
let profilesSub = null;
function watchProfiles(){
  if (profilesSub) return;
  profilesSub = onSnapshot(collection(fs, 'profiles'), q => { q.docs.forEach(d => { profiles[d.id] = d.data(); }); }, () => {});
}
const userApi = {
  id: async () => { await ready; return currentUser.uid; },
  me: async () => { await ready; return { id: currentUser.uid, name: currentUser.displayName || '', avatarUrl: currentUser.photoURL || '', color: '#888', email: null, isOwner: false, canEdit: true }; },
  can: async () => true,
  isOwner: async () => false,
  canEdit: async () => true,
  profiles: async ids => {
    await ready; watchProfiles();
    const out = {};
    for (const id of [].concat(ids)){
      const p = profiles[id] || {};
      out[id] = { id, name: p.name || '', avatarUrl: p.photo || '', color: '#888', email: null, isMe: currentUser && id === currentUser.uid, guest: false };
    }
    return out;
  },
};

/* ---------- Bilder: verkleinert direkt in der Datenbank ---------- */
async function toDataUrl(blob){
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } catch (e) {
    return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  }
}
const assetsApi = {
  upload: async blob => { const url = await toDataUrl(blob); if (url.length > 900000) throw { code: 'too_large' }; return { id: null, url, dataUrl: url }; },
  delete: async () => ({ deleted: false }),
  list: async () => ({ assets: [], usage: {} }),
};

window.claude = {
  use: async name => {
    await ready;
    if (name === 'db') return dbApi;
    if (name === 'user') return userApi;
    if (name === 'assets') return assetsApi;
    return null;
  },
};

/* ---------- Push-Benachrichtigungen ---------- */
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
let vapidKey = null, pushReady = false;

const b64ToBytes = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
const bytesToB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function deviceId(){
  try { let id = localStorage.getItem('zockplan-device'); if (!id){ id = Math.random().toString(36).slice(2, 10); localStorage.setItem('zockplan-device', id); } return id; }
  catch (e) { return 'geraet'; }
}
async function loadVapid(){
  try { const s = await getDoc(doc(fs, 'profiles', '_push')); vapidKey = s.exists() ? (s.data().vapid || null) : null; } catch (e) {}
  return vapidKey;
}
async function saveSub(sub){
  await setDoc(doc(fs, 'profiles', currentUser.uid), { push: { [deviceId()]: { ...sub.toJSON(), at: Date.now(), ua: navigator.userAgent.slice(0, 140) } } }, { merge: true });
}
async function currentSub(){
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
function pushUI(btnText, info){
  const btn = document.getElementById('pushBtn'), inf = document.getElementById('pushInfo');
  if (!btn || !inf) return;
  btn.hidden = !btnText; if (btnText) btn.textContent = btnText;
  inf.hidden = !info; inf.textContent = info || '';
}
async function renderPush(){
  if (!pushSupported){
    pushUI(null, isIOS && !standalone ? 'Für Benachrichtigungen Zockplan zuerst über Teilen → „Zum Home-Bildschirm“ hinzufügen und von dort öffnen.' : null);
    return 'unsupported';
  }
  if (Notification.permission === 'denied'){ pushUI(null, 'Benachrichtigungen sind blockiert. Du kannst sie in den Einstellungen für Zockplan wieder erlauben.'); return 'denied'; }
  let sub = null; try { sub = await currentSub(); } catch (e) {}
  if (sub && Notification.permission === 'granted'){ pushUI('Benachrichtigungen ausschalten', 'Benachrichtigungen sind an ✓'); return 'on'; }
  pushUI('Benachrichtigungen einschalten', null); return 'off';
}
async function enablePush(){
  const perm = await Notification.requestPermission();
  if (perm !== 'granted'){ await renderPush(); return false; }
  if (!vapidKey) await loadVapid();
  if (!vapidKey){ pushUI('Benachrichtigungen einschalten', 'Der Benachrichtigungs-Dienst ist noch nicht fertig eingerichtet. Versuch es in ein paar Minuten nochmal.'); return false; }
  pushUI(null, 'Wird eingeschaltet …');
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await Promise.race([
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey) }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('keine Antwort vom Push-Dienst – bitte später nochmal versuchen')), 20000)),
    ]);
    await saveSub(sub);
  } catch (e) {
    pushUI('Benachrichtigungen einschalten', 'Einschalten hat nicht geklappt: ' + ((e && e.message) || e));
    return false;
  }
  await renderPush(); return true;
}
async function disablePush(){
  try { const sub = await currentSub(); if (sub) await sub.unsubscribe(); } catch (e) {}
  try { await updateDoc(doc(fs, 'profiles', currentUser.uid), { ['push.' + deviceId()]: deleteField() }); } catch (e) {}
  await renderPush();
}
function pushBar(){
  let dismissed = false; try { dismissed = !!localStorage.getItem('zockplan-push-asked'); } catch (e) {}
  if (dismissed || document.getElementById('pushBar')) return;
  const bar = document.createElement('div');
  bar.id = 'pushBar'; bar.className = 'updbar glass'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<p>Nachricht bekommen, wenn sich bei Zockplan etwas tut?</p><button class="btn" type="button">Einschalten</button><button class="btn sec" type="button">Später</button>';
  const [on, later] = bar.querySelectorAll('button');
  const close = () => { try { localStorage.setItem('zockplan-push-asked', '1'); } catch (e) {} bar.remove(); };
  on.onclick = async () => { close(); await enablePush(); };
  later.onclick = close;
  document.body.append(bar);
}
let lastSeen = Date.now();
function markSeen(){
  if (!currentUser || Date.now() - lastSeen < 30000) return;
  lastSeen = Date.now();
  setDoc(doc(fs, 'profiles', currentUser.uid), { seenAt: lastSeen }, { merge: true }).catch(() => {});
}
async function setupPush(){
  if (pushReady) return; pushReady = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') markSeen(); });
  const btn = document.getElementById('pushBtn');
  if (btn) btn.addEventListener('click', async () => {
    if (btn.textContent.includes('ausschalten')) await disablePush(); else await enablePush();
  });
  if (!pushSupported){ renderPush(); return; }
  await loadVapid();
  /* Bestehendes Abo auffrischen; passt der Schlüssel nicht mehr, neu einschalten lassen */
  try {
    const sub = await currentSub();
    if (sub && Notification.permission === 'granted'){
      const key = sub.options && sub.options.applicationServerKey ? bytesToB64(sub.options.applicationServerKey) : null;
      if (vapidKey && key && key !== vapidKey){ await sub.unsubscribe(); }
      else await saveSub(sub);
    }
  } catch (e) {}
  const st = await renderPush();
  if (st === 'off' && Notification.permission === 'default' && vapidKey) setTimeout(pushBar, 3000);
}

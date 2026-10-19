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
  doc, collection, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, orderBy as fbOrderBy,
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
  const write = setDoc(doc(fs, 'profiles', u.uid), { name: u.displayName || '', photo: u.photoURL || '', at: Date.now() }, { merge: true });
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

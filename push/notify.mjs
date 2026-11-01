/* Zockplan – Push-Benachrichtigungen.
   Läuft alle paar Minuten bei GitHub. Vergleicht den Stand in Firestore mit dem letzten Lauf
   und schickt jeder Person eine Nachricht über das, was die anderen geändert haben.
   Benötigt das GitHub-Secret FIREBASE_SERVICE_ACCOUNT (Inhalt der Schlüsseldatei aus Firebase). */
import admin from 'firebase-admin';
import webpush from 'web-push';
import { buildSnap, diff, berlinToday } from './changes.mjs';

const APP_URL = 'https://luctuber123.github.io/zockplan/';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw || !raw.trim()){
  console.log('Noch kein Schlüssel hinterlegt (GitHub-Secret FIREBASE_SERVICE_ACCOUNT fehlt) – nichts zu tun.');
  process.exit(0);
}
let sa;
try { sa = JSON.parse(raw); }
catch (e) { console.error('FIREBASE_SERVICE_ACCOUNT ist kein gültiges JSON. Bitte den kompletten Inhalt der Schlüsseldatei einfügen.'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

/* Schlüsselpaar für Web-Push: einmal erzeugen, privat in _push/vapid (nur für den Server lesbar),
   öffentlich in profiles/_push (die App liest es von dort). */
const vref = db.doc('_push/vapid');
let vapid = (await vref.get()).data();
if (!vapid || !vapid.publicKey){ vapid = webpush.generateVAPIDKeys(); await vref.set(vapid); console.log('Neues Push-Schlüsselpaar erzeugt.'); }
const pubRef = db.doc('profiles/_push');
const pub = (await pubRef.get()).data();
if (!pub || pub.vapid !== vapid.publicKey) await pubRef.set({ vapid: vapid.publicKey, system: true });
webpush.setVapidDetails(APP_URL, vapid.publicKey, vapid.privateKey);

/* Daten laden */
const toMap = snap => Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
const [peopleS, sessionsS, gamesS, profilesS] = await Promise.all(['people', 'sessions', 'games', 'profiles'].map(c => db.collection(c).get()));
const people = toMap(peopleS), sessions = toMap(sessionsS), games = toMap(gamesS), profiles = toMap(profilesS);
delete profiles._push;

const nameOf = pid => {
  const n = (people[pid] && people[pid].nick) || (profiles[pid] && profiles[pid].name) || 'Jemand';
  return n.split(' ')[0];
};

const stateRef = db.doc('_push/state');
const state = (await stateRef.get()).data() || {};
const snap = buildSnap(people, sessions, games);
const today = berlinToday();

if (!state.snap){
  await stateRef.set({ snap, events: {}, updatedAt: Date.now() });
  console.log('Erster Lauf: Stand gespeichert, noch keine Nachrichten.');
  process.exit(0);
}

const changes = diff(state.snap, people, sessions, games, nameOf, today);
const events = state.events || {};
const now = Date.now();
let sent = 0, removed = 0;

if (changes.length){
  console.log(`${changes.length} Änderung(en):`, changes.map(c => c.text));
  for (const [uid, prof] of Object.entries(profiles)){
    const subs = prof.push || {};
    const mine = changes.filter(c => c.actor !== uid);
    if (!mine.length) continue;
    /* Liste für die Zahl am Symbol: alles seit dem letzten Öffnen der App */
    const list = (events[uid] || []).filter(e => e.at > (prof.seenAt || 0) && e.at > now - 14 * 86400000);
    for (const c of mine) list.push({ at: now, text: c.text });
    events[uid] = list.slice(-50);
    if (!Object.keys(subs).length) continue;
    const payload = JSON.stringify({
      title: 'Zockplan',
      body: mine[0].text + (mine.length > 1 ? ` (+${mine.length - 1} weitere)` : ''),
      badge: list.length,
      url: APP_URL,
      tag: 'zockplan',
    });
    for (const [dev, sub] of Object.entries(subs)){
      try {
        await webpush.sendNotification(sub, payload, { TTL: 12 * 3600, urgency: 'normal' });
        sent++;
      } catch (e){
        if (e && (e.statusCode === 404 || e.statusCode === 410)){
          await db.doc('profiles/' + uid).update({ ['push.' + dev]: admin.firestore.FieldValue.delete() });
          removed++;
        } else console.error(`Senden an ${nameOf(uid)} fehlgeschlagen:`, e && (e.statusCode || e.message), e && e.body);
      }
    }
  }
}

/* Gelesenes aufräumen und Stand speichern */
for (const [uid, list] of Object.entries(events)){
  const seen = (profiles[uid] && profiles[uid].seenAt) || 0;
  events[uid] = list.filter(e => e.at > seen);
}
await stateRef.set({ snap, events, updatedAt: now });
console.log(`Fertig: ${sent} Nachricht(en) gesendet${removed ? `, ${removed} abgelaufene Abos entfernt` : ''}.`);
process.exit(0);

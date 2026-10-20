/* Zockplan – App-Funktionen: Offline-Zwischenspeicher, Hinweis zum Installieren,
   Offline-Anzeige und Hinweis auf eine neue Version.
   VERSION muss zu version.json passen (bei jeder Änderung beide erhöhen). */
const VERSION = '2026-10-20.1';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let deferred = null;

function dismissed(){ try { return !!localStorage.getItem('zockplan-install-dismissed'); } catch (e) { return false; } }
function dismiss(){ try { localStorage.setItem('zockplan-install-dismissed', '1'); } catch (e) {} const b = document.getElementById('installBar'); if (b) b.remove(); }

function showBar(kind){
  if (standalone || dismissed() || document.getElementById('installBar')) return;
  const bar = document.createElement('div');
  bar.id = 'installBar'; bar.className = 'installbar glass'; bar.setAttribute('role', 'status');
  if (kind === 'ios'){
    bar.innerHTML = '<p>Als App nutzen: auf <b>Teilen</b> tippen, dann <b>„Zum Home-Bildschirm“</b>.</p><button class="btn sec" type="button">OK</button>';
    bar.querySelector('button').onclick = dismiss;
  } else {
    bar.innerHTML = '<p>Zockplan als App auf dem Startbildschirm installieren?</p><button class="btn" type="button">Installieren</button><button class="btn sec" type="button">Später</button>';
    const [ins, later] = bar.querySelectorAll('button');
    ins.onclick = async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (e) {} deferred = null; dismiss(); };
    later.onclick = dismiss;
  }
  document.body.append(bar);
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; showBar('android'); });
if (!standalone && isIOS) setTimeout(() => showBar('ios'), 2500);

/* ---------- Offline-Anzeige ---------- */
let netTimer = null, wasOffline = false;
function netPill(){
  let el = document.getElementById('netPill');
  if (!el){ el = document.createElement('div'); el.id = 'netPill'; el.className = 'netpill glass'; el.setAttribute('role', 'status'); el.hidden = true; document.body.append(el); }
  return el;
}
function updateNet(){
  const el = netPill(); clearTimeout(netTimer);
  if (!navigator.onLine){
    wasOffline = true; el.classList.remove('ok');
    el.textContent = 'Offline – Änderungen werden übertragen, sobald du wieder Netz hast';
    el.hidden = false;
  } else if (wasOffline){
    wasOffline = false; el.classList.add('ok');
    el.textContent = 'Wieder online';
    el.hidden = false; netTimer = setTimeout(() => { el.hidden = true; }, 2500);
    checkVersion();
  } else el.hidden = true;
}
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
if (document.body) updateNet(); else document.addEventListener('DOMContentLoaded', updateNet);

/* ---------- Neue Version ---------- */
function showUpdate(){
  if (document.getElementById('updateBar')) return;
  const bar = document.createElement('div');
  bar.id = 'updateBar'; bar.className = 'updbar glass'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<p>Es gibt eine neue Version von Zockplan.</p><button class="btn" type="button">Neu laden</button>';
  bar.querySelector('button').onclick = () => location.reload();
  document.body.append(bar);
}
async function checkVersion(){
  if (!navigator.onLine) return;
  try {
    const r = await fetch('./version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (j && j.v && j.v !== VERSION) showUpdate();
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
setInterval(checkVersion, 15 * 60 * 1000);
setTimeout(checkVersion, 4000);

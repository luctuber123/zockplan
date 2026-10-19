/* Zockplan – App-Funktionen: Offline-Zwischenspeicher und Hinweis zum Installieren */
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

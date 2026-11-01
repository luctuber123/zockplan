/* Zockplan – Service Worker: App-Dateien offline verfügbar halten.
   Eigene Dateien: erst Netz, sonst Zwischenspeicher (damit Änderungen sofort ankommen).
   Firebase-Bibliotheken: aus dem Zwischenspeicher (ändern sich nicht). */
const CACHE = 'zockplan-v6';
const SHELL = ['./', './index.html', './app.css', './app.js', './shim.js', './config.js', './pwa.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin){
    if (url.pathname.endsWith('/version.json')) return; /* immer frisch aus dem Netz */
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
  } else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')){
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
  }
});

/* Push-Nachrichten vom Zockplan-Dienst */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const jobs = [self.registration.showNotification(d.title || 'Zockplan', {
    body: d.body || 'Es gibt etwas Neues.',
    icon: './icons/icon-192.png?v=2',
    badge: './icons/icon-192.png?v=2',
    tag: d.tag || 'zockplan',
    renotify: true,
    data: { url: d.url || './' },
  })];
  if (d.badge && self.navigator && 'setAppBadge' in self.navigator) jobs.push(self.navigator.setAppBadge(d.badge).catch(() => {}));
  e.waitUntil(Promise.all(jobs));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});

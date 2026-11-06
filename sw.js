/* Zockplan – Service Worker: App-Dateien offline verfügbar halten.
   Eigene Seiten: erst Netz, sonst Zwischenspeicher (damit Änderungen sofort ankommen).
   Bibliotheken (vendor/, Firebase): aus dem Zwischenspeicher (ändern sich nicht).
   Das Spiel wird beim Installieren komplett vorgeladen, damit es auch ohne Internet läuft. */
const CACHE = 'zockplan-v7';
const SHELL = ['./', './index.html', './plan.html', './app.css', './app.js', './shim.js', './config.js', './pwa.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png?v=2', './icons/icon-512.png?v=2', './icons/apple-touch-icon.png?v=2', './icons/favicon-32.png?v=2'];
const GAME = ['./frost-grill/', './frost-grill/index.html', './frost-grill/cover.jpg',
  './vendor/fonts/fredoka.css', './vendor/fonts/fredoka-latin-500-normal.woff2', './vendor/fonts/fredoka-latin-600-normal.woff2', './vendor/fonts/fredoka-latin-700-normal.woff2',
  './vendor/three/build/three.module.js',
  './vendor/three/examples/jsm/postprocessing/EffectComposer.js', './vendor/three/examples/jsm/postprocessing/RenderPass.js', './vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js',
  './vendor/three/examples/jsm/postprocessing/OutputPass.js', './vendor/three/examples/jsm/postprocessing/ShaderPass.js', './vendor/three/examples/jsm/postprocessing/MaskPass.js',
  './vendor/three/examples/jsm/postprocessing/Pass.js', './vendor/three/examples/jsm/shaders/CopyShader.js', './vendor/three/examples/jsm/shaders/LuminosityHighPassShader.js',
  './vendor/three/examples/jsm/shaders/OutputShader.js', './vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js', './vendor/three/examples/jsm/environments/RoomEnvironment.js',
  './vendor/three/examples/jsm/objects/MarchingCubes.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll([...SHELL, ...GAME])).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin){
    if (url.pathname.endsWith('/version.json')) return; /* immer frisch aus dem Netz */
    if (url.pathname.includes('/vendor/')){
      e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
      return;
    }
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))));
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
    data: { url: d.url || './plan.html' },
  })];
  if (d.badge && self.navigator && 'setAppBadge' in self.navigator) jobs.push(self.navigator.setAppBadge(d.badge).catch(() => {}));
  e.waitUntil(Promise.all(jobs));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const target = new URL(url, self.registration.scope).href;
    for (const c of list){
      if (c.url === target && 'focus' in c) return c.focus();
    }
    const c = list.find(c => 'navigate' in c);
    if (c) return c.navigate(target).then(w => (w || c).focus());
    return self.clients.openWindow(target);
  }));
});

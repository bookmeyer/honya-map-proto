// 本屋の地図 サービスワーカー：画面の部品を覚えておく（ネット優先、切れていたら前回のもの）。地図タイル・本の情報（外部）は触らない
const VER = 'honya-map-0.5.1';
const SHELL = ['./', './index.html', './css/app.css?v=0.5.1', './js/main.js?v=0.5.1', './js/config.js', './js/util.js', './js/state.js', './js/audio.js', './js/position.js', './js/data.js', './js/map.js', './js/game.js', './js/ui.js', './js/screens.js', './js/share.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL).catch(() => {}))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { if (r && r.ok) { const copy = r.clone(); caches.open(VER).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

// 本屋の地図（試作）サービスワーカー：画面の部品だけを覚えておく。地図のタイルや本の情報は毎回ネットから取る。
const VER = 'honya-map-0.2.0';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // 地図・本の情報（外部）は触らない
  if (url.pathname.includes('/data/')) {
    // 店やラリーのデータはネット優先。つながらないときだけ前回のもの
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VER).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  // 画面の部品もネット優先（更新がすぐ届くように）。つながらないときだけ前回のもの
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VER).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});

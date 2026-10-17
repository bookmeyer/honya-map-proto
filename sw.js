// 本屋の地図 サービスワーカー
// ・版のついた部品（?v=）は覚えたものを先に使う（版が変わればURLも変わるので、古い部品は混ざらない）
// ・index.html・データ・版のないものはネット優先（必ずサーバーに確かめる）。切れていたら前回のもの
// ・地図タイル・本の情報（外部）は触らない
const V = '0.7.0';
const VER = 'honya-map-' + V;
const MODS = ['main', 'config', 'util', 'state', 'audio', 'position', 'data', 'map', 'game', 'ui', 'screens', 'share', 'journey', 'journey_ui'];
const SHELL = ['./', './index.html', `./css/app.css?v=${V}`, ...MODS.map((m) => `./js/${m}.js?v=${V}`), './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL).catch(() => {}))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });

const remember = (req, r) => { if (r && r.ok) { const copy = r.clone(); caches.open(VER).then((c) => c.put(req, copy)); } return r; };
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  if (/[?&]v=/.test(url.search)) {
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => remember(e.request, r))));
    return;
  }
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then((r) => remember(e.request, r))
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});

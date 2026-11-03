// 本めぐり サービスワーカー
// ・版のついた部品（?v=）は覚えたものを先に使う（版が変わればURLも変わるので、古い部品は混ざらない）
// ・index.html・データ・版のないものはネット優先（必ずサーバーに確かめる）。切れていたら前回のもの
// ・地図タイル・本の情報（外部）は触らない
const V = '0.21.0';
const VER = 'honya-map-' + V;
const MODS = ['main', 'audio', 'card_ui', 'checkin_ui', 'config', 'data', 'events', 'game', 'gimport', 'journey', 'map', 'map_ui', 'mission_ui', 'onboard_ui', 'position', 'profile_ui', 'radar_ui', 'reading', 'reading_ui', 'settings_ui', 'setup_ui', 'share', 'state', 'tour_ui', 'ui', 'util', 'zukan_ui'];
const SHELL = ['./', './index.html', `./css/app.css?v=${V}`, ...MODS.map((m) => `./js/${m}.js?v=${V}`), './manifest.webmanifest', './icon-192.png?v=4', './icon-512.png?v=4', './icon-maskable-512.png?v=4', './apple-touch-icon.png?v=4']; // アイコンは v0.14.8 で「本の中の地図」に。v0.14.9 で Android 用の絵を小さく（?v=3）

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL).catch(() => {}))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('honya-map-') && k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });

const remember = (req, r) => { if (r && r.ok) { const copy = r.clone(); caches.open(VER).then((c) => c.put(req, copy)); } return r; };
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  if (/[?&]v=/.test(url.search)) {
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => remember(e.request, r))));
    return;
  }
  // 開くページは、転送をそのままブラウザに返す（v0.17.1：アプリの場所を meguri.tsunagubooks.com へ移したあと、古い場所のアイコン・しおりからも新しい場所へ行けるように）
  const nav = e.request.mode === 'navigate';
  e.respondWith(fetch(e.request.url, { cache: 'no-cache', redirect: nav ? 'manual' : 'follow' }).then((r) => (r.type === 'opaqueredirect' ? r : remember(e.request, r)))
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});

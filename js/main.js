// 起動：記録を読み、データを取り、地図を出し、部品をつなぐ
import { APP_VER, TRIAL_ON, POLICY_VER } from './config.js?v=0.21.1';
import { $, on, $$, isStandalone, mobileOS, emit } from './util.js?v=0.21.1';
import { load, S, save } from './state.js?v=0.21.1';
import * as AUDIO from './audio.js?v=0.21.1';
import { POS, setPos, setFollow, jumped } from './position.js?v=0.21.1';
import { loadAll, STORES } from './data.js?v=0.21.1';
import * as MAP from './map.js?v=0.21.1';
import * as E from './events.js?v=0.21.1';
import * as J from './journey.js?v=0.21.1';
import * as R from './reading.js?v=0.21.1';
import { toast, closeSheet, refreshHud, currentView, switchView, setSub, closeModal } from './ui.js?v=0.21.1';
import { openSheet, refreshSheet, applyMapStates, updateNear, showWantAlerts, updateAreaChip, setupSearch, startAdd, locate, setTrialUI, warp } from './map_ui.js?v=0.21.1';
import * as RU from './reading_ui.js?v=0.21.1';
import { renderRadar } from './radar_ui.js?v=0.21.1';
import { renderZukan } from './zukan_ui.js?v=0.21.1';
import { renderMissions, openEventStores } from './mission_ui.js?v=0.21.1';
import { joinNotice, privacyNotice, policyNotice, homeTip, renderSettings, applyTheme } from './settings_ui.js?v=0.21.1';
import { showOnboarding } from './onboard_ui.js?v=0.21.1';
import * as UI0 from './ui.js?v=0.21.1'; // 試す入口（__honya）用
import * as MU from './map_ui.js?v=0.21.1'; // 試す入口（__honya）用
import * as CU from './checkin_ui.js?v=0.21.1'; // 試す入口（__honya）用
import * as KU from './card_ui.js?v=0.21.1'; // 試す入口（__honya）用
import * as SU from './settings_ui.js?v=0.21.1'; // 試す入口（__honya）用
import * as RAD from './radar_ui.js?v=0.21.1'; // 試す入口（__honya）用
import * as ZU from './zukan_ui.js?v=0.21.1'; // 試す入口（__honya）用
import { startTour, autoTour } from './tour_ui.js?v=0.21.1';
import { requireSetup } from './setup_ui.js?v=0.21.1';

async function boot() {
  load(); applyTheme(); // 見た目（明・暗）と着せ替え。地図はまだないので、地図の色は決めておくだけ
  const res = await loadAll();
  const join = E.takeJoinParam(); // お試しの人に渡すURLの ?join=参加コード
  const lp = S.lastPos; const center = lp ? [lp.lon, lp.lat] : [137.5, 37.3]; const zoom = lp ? 14 : 5;
  MAP.initMap({ center, zoom, theme: document.documentElement.dataset.theme || 'light',
    onStoreClick: (id) => openSheet(id),
    onReadClick: (p) => toast(`📖 ${p.label}`), // 読んだ場所の印（v0.15.0）
    onMapClick: (lngLat) => { if (POS.fake) { setPos(lngLat.lat, lngLat.lng, 15, true); toast('ここにいることにしました'); } else closeSheet(); },
    onDrag: () => { setFollow(false); $('#btn-locate').classList.remove('on'); } });
  on('map-ready', () => { MAP.setStores(STORES); applyMapStates(); MAP.setMe(POS); MAP.setReads(R.readSpots()); if (S.settings.avatar) MAP.setAvatar(S.settings.avatar); });
  on('pos', () => { MAP.setMe(POS); if (POS.follow && !POS.fake) MAP.easeTo(POS.lon, POS.lat); updateNear(); J.track(POS, jumped()); showWantAlerts(J.checkWanted(POS)); refreshHud(); });
  on('volume', (v) => { toast(`📖 歩いたページで、第${v.after}巻に入りました`, 'ok'); AUDIO.sfx.levelup(); refreshHud(); });
  let areaBound = false; on('map-ready', () => { if (!areaBound) { areaBound = true; MAP.M.map.on('moveend', updateAreaChip); } updateAreaChip(); });
  on('records', () => { refreshHud(); updateAreaChip(); RU.renderReadBtn(); MAP.setReads(R.readSpots()); if (currentView === 'zukan') renderZukan(); if (currentView === 'mission') renderMissions(); });
  on('replaced', () => { applyTheme(); MAP.setAvatar(S.settings.avatar || null); setTimeout(() => { updateNear(); emit('records'); }, 0); }); // 読み込み・すべて消すのあと（v0.16.0：地図・読書のボタン・読んだ場所が前のままだった）。店の作り直しは呼んだほうが先にする
  on('view', (v) => { if (v === 'radar') renderRadar(); if (v === 'zukan') renderZukan(); if (v === 'mission') renderMissions(); if (v === 'settings') renderSettings(); });
  on('near', () => { if (currentView === 'radar') renderRadar(); });
  on('save-error', () => toast('保存できませんでした（端末の空きを確かめてください）', 'warn'));
  // 読書（v0.14.1）：地図の大きなボタン「読書をはじめる」／読書中。スタンプのあと・カードのあとからも同じ画面へ
  on('read-start', (x) => RU.openReadStart(x || {})); on('trip', RU.renderReadBtn); on('trial', RU.renderReadBtn);
  // イベント：起動時・10分ごと・画面に戻ったとき（5分以上たっていたら）に設定を読む。記録はつながったときに送る
  on('events', () => { applyMapStates(); refreshHud(); refreshSheet(); if (currentView === 'mission') renderMissions(); }); // 店のページも（手書きのカードがある店が届く。v0.16.1）
  on('tour', () => startTour()); // 設定の「画面の案内」から（v0.19.0）
  on('evlist', (id) => openEventStores(id)); // 店のページから、イベントの参加店の一覧へ（v0.18.1）
  on('fixes', () => { MAP.setStores(STORES); applyMapStates(); updateNear(); emit('records'); }); // 運営が直した閉店・名前が届いた（v0.17.0）
  E.loadEvents(); setInterval(() => { if (document.visibilityState === 'visible') E.loadEvents(); }, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; if (Date.now() - E.EV.at > 5 * 60 * 1000) E.loadEvents(); E.flushSoon(1000); });
  window.addEventListener('online', () => E.flushSoon(500)); E.flushSoon(4000);
  setupSearch(); refreshHud(); RU.renderReadBtn();
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => { AUDIO.unlock(); switchView(b.dataset.view); }));
  $$('.segmented button').forEach((b) => b.addEventListener('click', () => setSub(b.dataset.sub)));
  $('#sheet-close').onclick = closeSheet;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#btn-add').onclick = startAdd; $('#btn-locate').onclick = locate; $('#btn-trial').hidden = !TRIAL_ON; $('#btn-trial').onclick = () => { AUDIO.unlock(); setTrialUI(!POS.fake); }; $('#btn-warp').onclick = () => warp();
  $('#btn-settings').onclick = () => switchView('settings'); $('#lv-btn').onclick = () => switchView('zukan');
  document.addEventListener('pointerdown', AUDIO.unlock, { once: true });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  window.addEventListener('online', () => { $('#offline').hidden = true; }); window.addEventListener('offline', () => { $('#offline').hidden = false; }); if (!navigator.onLine) $('#offline').hidden = false;
  if (!res.ok) toast('店のデータが読み込めませんでした。つながったら、もう一度開いてください', 'warn');
  // シートを下に引いて閉じる
  let sy = null; const sheet = $('#sheet'); sheet.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; }, { passive: true }); sheet.addEventListener('touchmove', (e) => { if (sy != null && sheet.scrollTop === 0 && e.touches[0].clientY - sy > 70) { closeSheet(); sy = null; } }, { passive: true });
  // 更新の案内（サービスワーカー）
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // 更新の流れ：新しい sw.js が入った（待機中）→ 帯を出す → 「更新」で待機中のものを有効に → 入れ替わったら読み直す
    const hadCtl = !!navigator.serviceWorker.controller; let wantReload = false, reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if ((!hadCtl && !wantReload) || reloading) return; reloading = true; location.reload(); });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const offer = (w) => { if (!w || !navigator.serviceWorker.controller) return; $('#update').hidden = false; $('#btn-update').onclick = () => { $('#btn-update').disabled = true; wantReload = true; w.postMessage('skip'); }; };
      if (reg.waiting) offer(reg.waiting); // 前に開いたときに入っていた更新
      reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); }); });
      const check = () => { reg.update().catch(() => {}); };
      setTimeout(check, 3000); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }).catch(() => {});
  }
  // ホーム画面のアイコンから開いているときは、記録を消さないよう端末に頼む（ふつうのタブでは頼まない。確かめる窓を出すブラウザがあるため）
  if (isStandalone() && navigator.storage && navigator.storage.persist) navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {});
  const afterIntro = () => { if (join && join.isNew) joinNotice(join.code); else if (!S.settings.privacyV10) privacyNotice(); else if (!S.settings.homeTip && mobileOS() && !isStandalone()) homeTip(); };
  // もう使っている人：ポリシーが新しくなっていたらお知らせ → はじめの設定がまだなら設定（v0.21.0）→ ほかのお知らせ
  const startExisting = () => { const go = () => requireSetup(afterIntro); if (S.settings.policy !== POLICY_VER) policyNotice(go); else go(); };
  if (!S.seen) showOnboarding((mode) => { S.seen = 1; S.settings.privacyV10 = join && join.isNew ? 0 : 1; save(); refreshHud(); requireSetup(() => { if (mode === 'geo') locate(); if (mode === 'trial' && TRIAL_ON) { setTrialUI(true); warp(); } if (join && join.isNew) joinNotice(join.code); autoTour(); }); }); // 最初の案内 → はじめの設定（v0.21.0）→ 地図の画面の案内（v0.19.0） // 最初の案内のあと、地図の画面の案内（v0.19.0）
  else startExisting();
  // 2回目からは、開いたときに自分のいる場所から始める（v0.13.2）。位置の許可がもうある人か、前に現在地を使った人だけ。断られている人には聞かない
  if (S.seen && !POS.fake) {
    const go = () => locate();
    if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted' || (p.state === 'prompt' && S.settings.geoOk)) go(); }).catch(() => { if (S.settings.geoOk) go(); });
    else if (S.settings.geoOk) go();
  }
  emit('view', 'map');
  // 試す入口（テストで使う）。v0.16.0 でファイルを分けたので、いくつかをまとめて見せる。S と STORES は入れかわるので、いつも今のものを返す
  const live = (...ms) => new Proxy({}, { get: (_, k) => { const x = ms.find((n) => k in n); return x ? x[k] : undefined; } });
  window.__honya = { get S() { return S; }, POS, get STORES() { return STORES; }, UI: live(UI0, MU, CU, KU, SU), MAP, J: live(J, R), JU: live(MU, RAD, ZU, SU), RU, E, audio: AUDIO, ver: APP_VER };
}
window.addEventListener('error', (e) => { console.error(e.error || e.message); });
boot().catch((e) => { console.error(e); const t = document.getElementById('toasts'); if (t) { const d = document.createElement('div'); d.className = 'toast warn'; d.textContent = '起動に失敗しました。読み込み直してください'; t.appendChild(d); } });

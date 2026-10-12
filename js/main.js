// 起動：記録を読み、データを取り、地図を出し、部品をつなぐ
import { APP_VER } from './config.js';
import { S, load, save } from './state.js';
import { loadAll, STORES } from './data.js';
import * as MAP from './map.js';
import { POS, setPos, setFollow } from './position.js';
import { unlock } from './audio.js';
import * as UI from './ui.js';
import { renderRadar, renderZukan, renderMissions, renderSettings, applyTheme, showOnboarding } from './screens.js';
import { $, $$, on, emit } from './util.js';

async function boot() {
  load(); applyThemeEarly();
  const res = await loadAll();
  const lp = S.lastPos; const center = lp ? [lp.lon, lp.lat] : [137.5, 37.3]; const zoom = lp ? 14 : 5;
  MAP.initMap({ center, zoom, theme: document.documentElement.dataset.theme || 'light',
    onStoreClick: (id) => UI.openSheet(id),
    onMapClick: (lngLat) => { if (POS.fake) { setPos(lngLat.lat, lngLat.lng, 15, true); UI.toast('ここにいることにしました'); } else UI.closeSheet(); },
    onDrag: () => { setFollow(false); $('#btn-locate').classList.remove('on'); } });
  on('map-ready', () => { MAP.setStores(STORES); UI.applyMapStates(); MAP.setMe(POS); });
  on('pos', () => { MAP.setMe(POS); if (POS.follow && !POS.fake) MAP.easeTo(POS.lon, POS.lat); UI.updateNear(); });
  on('records', () => { UI.refreshHud(); if (UI.currentView === 'zukan') renderZukan(); if (UI.currentView === 'mission') renderMissions(); });
  on('view', (v) => { if (v === 'radar') renderRadar(); if (v === 'zukan') renderZukan(); if (v === 'mission') renderMissions(); if (v === 'settings') renderSettings(); });
  on('near', () => { if (UI.currentView === 'radar') renderRadar(); });
  on('save-error', () => UI.toast('保存できませんでした（端末の空きを確かめてください）', 'warn'));
  UI.setupSearch(); UI.refreshHud();
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => { unlock(); UI.switchView(b.dataset.view); }));
  $$('.segmented button').forEach((b) => b.addEventListener('click', () => UI.setSub(b.dataset.sub)));
  $('#sheet-close').onclick = UI.closeSheet;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') UI.closeModal(); });
  $('#btn-add').onclick = UI.startAdd; $('#btn-locate').onclick = UI.locate; $('#btn-trial').onclick = () => { unlock(); UI.setTrialUI(!POS.fake); }; $('#btn-warp').onclick = () => UI.warp();
  $('#btn-settings').onclick = () => UI.switchView('settings'); $('#ink-btn').onclick = () => UI.toast(`印泥：印を押すたびに1つ使い、90分に1つ回復します`); $('#lv-btn').onclick = () => UI.switchView('zukan');
  document.addEventListener('pointerdown', unlock, { once: true });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  window.addEventListener('online', () => { $('#offline').hidden = true; }); window.addEventListener('offline', () => { $('#offline').hidden = false; }); if (!navigator.onLine) $('#offline').hidden = false;
  if (!res.ok) UI.toast('店のデータが読み込めませんでした。つながったら、もう一度開いてください', 'warn');
  // シートを下に引いて閉じる
  let sy = null; const sheet = $('#sheet'); sheet.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; }, { passive: true }); sheet.addEventListener('touchmove', (e) => { if (sy != null && sheet.scrollTop === 0 && e.touches[0].clientY - sy > 70) { UI.closeSheet(); sy = null; } }, { passive: true });
  // 更新の案内（サービスワーカー）
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then((reg) => { reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { $('#update').hidden = false; $('#btn-update').onclick = () => { w.postMessage('skip'); location.reload(); }; } }); }); }).catch(() => {});
  }
  if (!S.seen) showOnboarding((mode) => { S.seen = 1; S.tickets += 1; save(); UI.refreshHud(); UI.toast('🎟 最初のガチャ券を1枚どうぞ（お題の画面で引けます）', 'ok'); if (mode === 'geo') UI.locate(); if (mode === 'trial') { UI.setTrialUI(true); UI.warp(); } });
  emit('view', 'map');
  window.__honya = { S, POS, STORES, UI, MAP, ver: APP_VER };
}
function applyThemeEarly() { const t = S.settings.theme; const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }
window.addEventListener('error', (e) => { console.error(e.error || e.message); });
boot().catch((e) => { console.error(e); const t = document.getElementById('toasts'); if (t) { const d = document.createElement('div'); d.className = 'toast warn'; d.textContent = '起動に失敗しました。読み込み直してください'; t.appendChild(d); } });

// 起動：記録を読み、データを取り、地図を出し、部品をつなぐ
import { APP_VER } from './config.js?v=0.9.2';
import { S, load, save } from './state.js?v=0.9.2';
import { loadAll, STORES } from './data.js?v=0.9.2';
import * as MAP from './map.js?v=0.9.2';
import { POS, setPos, setFollow, jumped } from './position.js?v=0.9.2';
import * as AUDIO from './audio.js?v=0.9.2';
import * as UI from './ui.js?v=0.9.2';
import * as J from './journey.js?v=0.9.2';
import * as JU from './journey_ui.js?v=0.6.3';
import { renderRadar, renderZukan, renderMissions, renderSettings, applyTheme, showOnboarding } from './screens.js?v=0.9.2';
import { $, $$, on, emit } from './util.js?v=0.9.2';

async function boot() {
  load(); applyThemeEarly();
  const res = await loadAll();
  const lp = S.lastPos; const center = lp ? [lp.lon, lp.lat] : [137.5, 37.3]; const zoom = lp ? 14 : 5;
  MAP.initMap({ center, zoom, theme: document.documentElement.dataset.theme || 'light',
    onStoreClick: (id) => UI.openSheet(id),
    onMapClick: (lngLat) => { if (POS.fake) { setPos(lngLat.lat, lngLat.lng, 15, true); UI.toast('ここにいることにしました'); } else UI.closeSheet(); },
    onDrag: () => { setFollow(false); $('#btn-locate').classList.remove('on'); } });
  on('map-ready', () => { MAP.setStores(STORES); UI.applyMapStates(); MAP.setMe(POS); if (S.settings.avatar) MAP.setAvatar(S.settings.avatar); });
  on('pos', () => { MAP.setMe(POS); if (POS.follow && !POS.fake) MAP.easeTo(POS.lon, POS.lat); UI.updateNear(); J.track(POS, jumped()); JU.showWantAlerts(J.checkWanted(POS)); UI.refreshHud(); });
  on('volume', (v) => { UI.toast(`📖 歩いたページで、第${v.after}巻に入りました`, 'ok'); AUDIO.sfx.levelup(); UI.refreshHud(); });
  let areaBound = false; on('map-ready', () => { if (!areaBound) { areaBound = true; MAP.M.map.on('moveend', JU.updateAreaChip); } JU.updateAreaChip(); });
  on('records', () => { UI.refreshHud(); JU.updateAreaChip(); if (UI.currentView === 'zukan') renderZukan(); if (UI.currentView === 'mission') renderMissions(); });
  on('view', (v) => { if (v === 'radar') renderRadar(); if (v === 'zukan') renderZukan(); if (v === 'mission') renderMissions(); if (v === 'settings') renderSettings(); });
  on('near', () => { if (UI.currentView === 'radar') renderRadar(); });
  on('save-error', () => UI.toast('保存できませんでした（端末の空きを確かめてください）', 'warn'));
  UI.setupSearch(); UI.refreshHud();
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => { AUDIO.unlock(); UI.switchView(b.dataset.view); }));
  $$('.segmented button').forEach((b) => b.addEventListener('click', () => UI.setSub(b.dataset.sub)));
  $('#sheet-close').onclick = UI.closeSheet;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') UI.closeModal(); });
  $('#btn-add').onclick = UI.startAdd; $('#btn-locate').onclick = UI.locate; $('#btn-trial').onclick = () => { AUDIO.unlock(); UI.setTrialUI(!POS.fake); }; $('#btn-warp').onclick = () => UI.warp();
  $('#btn-settings').onclick = () => UI.switchView('settings'); $('#lv-btn').onclick = () => UI.switchView('zukan');
  document.addEventListener('pointerdown', AUDIO.unlock, { once: true });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  window.addEventListener('online', () => { $('#offline').hidden = true; }); window.addEventListener('offline', () => { $('#offline').hidden = false; }); if (!navigator.onLine) $('#offline').hidden = false;
  if (!res.ok) UI.toast('店のデータが読み込めませんでした。つながったら、もう一度開いてください', 'warn');
  // シートを下に引いて閉じる
  let sy = null; const sheet = $('#sheet'); sheet.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; }, { passive: true }); sheet.addEventListener('touchmove', (e) => { if (sy != null && sheet.scrollTop === 0 && e.touches[0].clientY - sy > 70) { UI.closeSheet(); sy = null; } }, { passive: true });
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
  if (!S.seen) showOnboarding((mode) => { S.seen = 1; save(); UI.refreshHud(); if (mode === 'geo') UI.locate(); if (mode === 'trial') { UI.setTrialUI(true); UI.warp(); } });
  emit('view', 'map');
  window.__honya = { S, POS, STORES, UI, MAP, J, JU, audio: AUDIO, ver: APP_VER };
}
function applyThemeEarly() { const t = S.settings.theme; const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }
window.addEventListener('error', (e) => { console.error(e.error || e.message); });
boot().catch((e) => { console.error(e); const t = document.getElementById('toasts'); if (t) { const d = document.createElement('div'); d.className = 'toast warn'; d.textContent = '起動に失敗しました。読み込み直してください'; t.appendChild(d); } });

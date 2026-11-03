// ちかく（view-radar）：近い店・書店員さんの1冊・行きたい店・ピンの色の見方
import { RANGE_M, TRIAL_ON } from './config.js?v=0.20.0';
import { $, esc, fmtDist, arrowOf, bearing, icon, $$, dist, prefOf, stars } from './util.js?v=0.20.0';
import { hasPos, POS } from './position.js?v=0.20.0';
import { STORES, bookTitle, pickOpen, isFeat, rarityOf } from './data.js?v=0.20.0';
import * as MAP from './map.js?v=0.20.0';
import * as G from './game.js?v=0.20.0';
import * as J from './journey.js?v=0.20.0';
import { dirLink, stopLinks, switchView, emptyBox } from './ui.js?v=0.20.0';
import { openSheet, locate, setTrialUI, warp, NEAR } from './map_ui.js?v=0.20.0';
import { hasCard, liveEvents, narrow } from './events.js?v=0.20.0';

// ---------- ちかく：行きたい店（近い順） ----------
export function renderRadarWants() {
  const el = $('#radar-wants'); if (!el) return;
  let base; if (hasPos()) base = { lat: POS.lat, lon: POS.lon, lbl: 'ここから' }; else { const c = MAP.center(); base = { lat: c.lat, lon: c.lng, lbl: '地図の真ん中から' }; }
  const list = J.wantsSorted(base.lat, base.lon);
  el.innerHTML = `<h3>行きたい店 ${list.length}店（近い順）</h3>` + (list.length ? `<div class="list">${list.slice(0, 40).map(({ st, d }) => `<div class="item" data-id="${esc(st.i)}"><div class="main"><div class="name">${esc(st.n)}</div><div class="sub">${base.lbl} ${fmtDist(d)}${hasPos() && d < 5000 ? ' ' + arrowOf(bearing(base.lat, base.lon, st.la, st.lo)) : ''}</div></div>${dirLink(st)}</div>`).join('')}</div>` : `<div class="empty">${icon('heart')}<div>店のページの「行きたい」を押すか、設定から Googleマップの★を読み込むと、ここに近い順で並びます。</div></div>`);
  stopLinks(el); $$('#radar-wants .item[data-id]').forEach((it) => it.addEventListener('click', () => openSheet(it.dataset.id)));
}
// ---------- ちかく（view-radar） ----------
const LEGEND = [['#FF6A48', '本屋'], ['#B9794A', '古書店'], ['#1B1B1B', '秘境の本屋'], ['#2F9BFF', '図書館'], ['#4FC07A', 'スタンプ済み'], ['#FFD447', '射程内（光の輪）']];
function renderLegend() {
  const el = $('#radar-legend'); if (!el) return; const ev = liveEvents().find(narrow); // 開催中のイベントの参加店の札（v0.18.1）
  el.innerHTML = '<span class="lg-t">ピンの色</span>' + LEGEND.map(([c, t]) => `<span class="lg"><i style="background:${c}"></i>${t}</span>`).join('') + (ev ? `<span class="lg"><b class="lg-tag" style="--evc:${esc(ev.frame.color)}">${esc(ev.frame.label || 'イベント')}</b>イベントの参加店</span>` : '');
}
// 書店員さんの1冊（v0.11）：近い順に3店。「すべて見る」で全部。いまは見本だけのときもある
let picksAll = false;
function renderPicks() {
  const el = $('#radar-picks'); if (!el) return;
  const all = STORES.filter((s) => s.rec); if (!all.length) { el.innerHTML = ''; return; }
  let base; if (hasPos()) base = { lat: POS.lat, lon: POS.lon, lbl: 'ここから' }; else { const c = MAP.center(); base = { lat: c.lat, lon: c.lng, lbl: '地図の真ん中から' }; }
  const real = all.filter((s) => !s.demo).length;
  const sorted = (real ? all.filter((s) => !s.demo) : all).map((s) => ({ s, d: dist(base.lat, base.lon, s.la, s.lo) })).sort((a, b) => a.d - b.d); // 本物の1冊が入ったら、見本は出さない
  const show = picksAll ? sorted : sorted.slice(0, 3);
  el.innerHTML = `<h3>書店員さんの1冊 <span class="muted small">${real ? `全国 ${real}店` : 'いまは見本だけ'}</span></h3><div class="list">${show.map(({ s, d }) => `<div class="item" data-id="${esc(s.i)}"><div class="main"><div class="name">${esc(bookTitle(s.rec.title))}</div><div class="sub">${esc(s.n)}・${esc(s.rec.who)}　${base.lbl} ${fmtDist(d)}${pickOpen(s) && hasCard(s) ? '　<span class="badge shu">カードを見た</span>' : ''}</div></div></div>`).join('')}</div>${sorted.length > 3 ? `<button class="linkish" id="pk-more">${picksAll ? '近い3店だけにする' : `すべて見る（${sorted.length}店）`}</button>` : ''}`;
  $$('#radar-picks .item').forEach((x) => x.addEventListener('click', () => openSheet(x.dataset.id)));
  if ($('#pk-more')) $('#pk-more').onclick = () => { picksAll = !picksAll; renderPicks(); };
}
export function renderRadar() {
  renderLegend(); renderRadarWants(); renderPicks();
  const st = $('#radar-status'), list = $('#radar-list');
  if (!hasPos()) { st.className = 'status-card'; st.innerHTML = `現在地がまだありません。<div class="actions"><button class="btn primary" id="rd-loc">${icon('locate')}現在地を追う</button>${TRIAL_ON ? `<button class="btn" id="rd-trial">${icon('foot')}お試し歩き</button>` : ''}</div>`; $('#rd-loc').onclick = () => { switchView('map'); locate(); }; if ($('#rd-trial')) $('#rd-trial').onclick = () => { switchView('map'); setTrialUI(true); warp(); }; list.innerHTML = ''; return; }
  st.className = 'status-card gold'; st.innerHTML = `${POS.fake ? '<span class="badge feat">お試し</span>' : '<span class="badge ao">追跡中</span>'} 射程内 <b>${NEAR.inRange.size}</b>店　<span class="muted small">${POS.acc ? `誤差 約${Math.round(POS.acc)}m　` : ''}店から${RANGE_M}m以内でスタンプが押せます</span>`;
  list.innerHTML = NEAR.list.map(({ s, d }) => `<div class="item ${d <= RANGE_M ? 'in' : ''}" data-id="${esc(s.i)}"><div class="main"><div class="name">${G.hasStamp(s.i) ? icon('check') + ' ' : ''}${isFeat(s.i) ? '<span class="crown">👑</span> ' : ''}${esc(s.n)}${s.u ? ' <span class="badge">古書店</span>' : ''}${s.t === 'l' ? ' <span class="badge lib">図書館</span>' : ''}</div><div class="sub">${esc(s.a || prefOf(s))}　<span class="stars">${stars(rarityOf(s))}</span></div></div><div class="dist">${d <= RANGE_M ? '射程内' : fmtDist(d)}<br>${arrowOf(bearing(POS.lat, POS.lon, s.la, s.lo))}</div></div>`).join('') || emptyBox('radar', '3kmの中に店がありません。');
  $$('#radar-list .item').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
}

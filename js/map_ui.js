// 地図の画面：現在地まわり（射程・いちばん近い店）・ピンの状態・現在地とお試し歩き・店のページ・さがす・店を足す・行きたい店のお知らせ
import { RANGE_M, TERRITORY_M, PG, TRIAL_ON, PREFS } from './config.js?v=0.29.0';
import { $, arrowOf, bearing, icon, fmtDist, esc, dist, $$, emit, fmtDate, gmapDir, stars, gmapPlace, prefOf } from './util.js?v=0.29.0';
import { S, save } from './state.js?v=0.29.0';
import { unlock, sfx } from './audio.js?v=0.29.0';
import { hasPos, POS, startWatch, setTrial, setPos, jumped } from './position.js?v=0.29.0';
import { STORES, BYID, isLib, isFeat, rarityOf, pickOpen, placeWord, bookTitle, stampSVG, rarityText, lookupIsbn, hideStore, renameStore, search, FEAT } from './data.js?v=0.29.0';
import * as MAP from './map.js?v=0.29.0';
import * as G from './game.js?v=0.29.0';
import * as E from './events.js?v=0.29.0';
import * as J from './journey.js?v=0.29.0';
import { dirLink, openModal, closeModal, stopLinks, toast, closeSheet, refreshHud, currentView, switchView, syncStatusCard } from './ui.js?v=0.29.0';
import { startCheckin, shareStampUI } from './checkin_ui.js?v=0.29.0';
import { startCard } from './card_ui.js?v=0.29.0';
import * as SH from './shops.js?v=0.29.0';
import { addReading } from './reading.js?v=0.29.0';
import { todayISO } from './util.js?v=0.29.0';

// ---------- 行きたい店のお知らせ（地図の下に出る帯） ----------
let waTimer = null;
export function showWantAlerts(list) {
  if (!list || !list.length) return;
  const { st, d, stage } = list[0]; const box = $('#want-alert');
  const more = list.length > 1 ? `（ほか${list.length - 1}店）` : '';
  const arrow = hasPos() ? ' ' + arrowOf(bearing(POS.lat, POS.lon, st.la, st.lo)) : '';
  box.innerHTML = `<div class="wa-main">${icon('heart')}<div><b>${stage === 2 ? 'もうすぐ' : fmtDist(d) + '先に'}、行きたい店があります${more}</b><div class="small">${esc(st.n)}　${fmtDist(d)}${arrow}</div></div><button class="icon-btn" id="wa-x" aria-label="閉じる">${icon('close')}</button></div><div class="wa-act"><button class="btn primary" id="wa-open">${icon('map')}地図で見る</button>${dirLink(st, 'Googleマップで道順')}</div>`;
  box.hidden = false; // 音と振動はなし（帯だけで知らせる）
  $('#wa-x').onclick = () => { box.hidden = true; };
  $('#wa-open').onclick = () => { box.hidden = true; openSheet(st.i); };
  clearTimeout(waTimer); waTimer = setTimeout(() => { box.hidden = true; }, 90000);
}
// ---------- 地図に映っている範囲の行きたい店（出かける前の下見に） ----------
export function updateAreaChip() {
  const chip = $('#area-chip'); const m = MAP.M.map;
  if (!chip || !m || !S.wants.length || m.getZoom() < 10) { if (chip) { chip.hidden = true; syncStatusCard(); } return; }
  const b = m.getBounds(); const list = J.wantsInBounds({ s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() });
  if (!list.length) { chip.hidden = true; syncStatusCard(); return; }
  chip.innerHTML = `${icon('heart')}<span>行きたい店 ${list.length}</span>`; chip.setAttribute('aria-label', `この辺りに行きたい店 ${list.length}店`); chip.hidden = false; syncStatusCard();
  chip.onclick = () => {
    const c = m.getCenter(); const rows = list.map((st) => ({ st, d: dist(c.lat, c.lng, st.la, st.lo) })).sort((a, b) => a.d - b.d);
    openModal(`<h2>この辺りの行きたい店</h2><p class="hint">地図に映っている範囲です。出かける前に、行き先の地図を開くだけで分かります。</p><div class="list">${rows.map(({ st, d }) => `<div class="item" data-id="${esc(st.i)}"><div class="main"><div class="name">${esc(st.n)}</div><div class="sub">地図の真ん中から ${fmtDist(d)}</div></div>${dirLink(st)}</div>`).join('')}</div><div class="actions"><button class="btn ghost wide" id="ar-close">閉じる</button></div>`);
    $('#ar-close').onclick = closeModal; stopLinks($('#modal-box'));
    $$('#modal-box .item[data-id]').forEach((el) => el.addEventListener('click', () => { closeModal(); openSheet(el.dataset.id); }));
  };
}
export const NEAR = { list: [], inRange: new Set(), glow: new Set() };
const GLOW_MAX = 3; // 地図で光の輪を付けるのは、射程内のうち近い3店まで（店の多い街で光が重なりすぎないように。v0.13）
// ---------- 現在地まわりの表示（レーダーの帯・最初のクエスト・縁の光） ----------
// 近づいたときの画面の縁の光・音・振動は使わない（2026-10-17 ぶっくまさんの指示）。射程に入ったらトーストで知らせるだけ
export function updateNear() {
  // 「いちばん近い本屋」の帯（11/3 に外した）と、下に並べていた8枚の店のチップは、v0.23.0 で札の1行目にまとめた（テストプレイの声「画面の四角が多い」）
  if (!hasPos()) { NEAR.list = []; NEAR.inRange = new Set(); NEAR.glow = new Set(); renderNearRow(); applyMapStates(); emit('near'); return; }
  const cand = []; for (const s of STORES) { if (Math.abs(s.la - POS.lat) > 0.03 || Math.abs(s.lo - POS.lon) > 0.036) continue; cand.push({ s, d: dist(POS.lat, POS.lon, s.la, s.lo) }); }
  cand.sort((a, b) => a.d - b.d); NEAR.list = cand.slice(0, 30);
  const now = new Set(NEAR.list.filter((x) => x.d <= RANGE_M).map((x) => x.s.i));
  NEAR.glow = new Set(NEAR.list.filter((x) => x.d <= RANGE_M).slice(0, GLOW_MAX).map((x) => x.s.i));
  const entered = [...now].filter((id) => !NEAR.inRange.has(id)); NEAR.inRange = now;
  if (entered.length) { const first = BYID.get(entered[0]); toast(`📍 ${first.n}${entered.length > 1 ? ` ほか${entered.length - 1}店` : ''} が射程に入りました`, 'ok'); }
  renderNearRow();
  applyMapStates(); emit('near');
  refreshSheet();
}
// 札の1行目：いちばん近い店と、あと何m（射程に入ったら黄色）。押すと店のページ。「近く○店 ›」は、ちかくの画面へ
function renderNearRow() {
  const row = $('#sc-near'), more = $('#sc-more'); if (!row || !more) return;
  const first = NEAR.list[0];
  if (!first) { row.hidden = true; more.hidden = true; syncStatusCard(); return; }
  const { s, d } = first, inR = d <= RANGE_M;
  row.className = 'sc-near' + (inR ? ' in' : ''); row.dataset.id = s.i; row.hidden = false;
  row.innerHTML = `${G.hasStamp(s.i) ? icon('check', 'ck') : icon('pin', 'pin')}<b>${isFeat(s.i) ? '👑 ' : ''}${esc(s.n)}</b><span class="d">${inR ? '射程内！' : `あと${fmtDist(d - RANGE_M)} ${arrowOf(bearing(POS.lat, POS.lon, s.la, s.lo))}`}</span>`;
  row.setAttribute('aria-label', `いちばん近い店：${s.n}。${inR ? '射程内' : `あと${fmtDist(d - RANGE_M)}`}`);
  row.onclick = () => openSheet(s.i);
  const n = Math.min(NEAR.list.length, 30); more.textContent = `近く${n}店 ›`; more.hidden = n < 2; more.onclick = () => switchView('radar');
  syncStatusCard();
}
// 札の高さに合わせて、地図の左下の文字（出典）を札の上に出す
export function watchDock() {
  const dock = $('#bottom-dock'), view = $('#view-map'); if (!dock || !view || !window.ResizeObserver) return;
  new ResizeObserver(() => { view.style.setProperty('--dock-h', `${Math.round(dock.offsetHeight)}px`); }).observe(dock);
}
// 開いている店のページを描き直す。名前の直し・閉店の確かめを開いているあいだは描き直さない（v0.16.0）
export function refreshSheet() { const sheet = $('#sheet'); if (!sheet.hidden && sheet.dataset.id && !$('#sheet-extra').childElementCount) openSheet(sheet.dataset.id, true); }
export function applyMapStates() {
  const states = new Map();
  const nev = E.liveEvents().filter(E.narrow);
  // 店ごとの記録の数・推し店・行きたいは、先に1回だけ数える（v0.16.0：位置が届くたびに 店×記録 を数え直していて、記録が増えると重くなった）
  const cnt = new Map(); for (const v of S.visits) cnt.set(v.s, (cnt.get(v.s) || 0) + 1); for (const c of S.cards) cnt.set(c.s, (cnt.get(c.s) || 0) + 1);
  const feat = new Set(FEAT.values()), wants = new Set(S.wants);
  for (const s of STORES) { const n = cnt.get(s.i) || 0; states.set(s.i, { stamp: G.hasStamp(s.i) ? 1 : 0, near: NEAR.glow.has(s.i) ? 1 : 0, feat: feat.has(s.i) ? 1 : 0, want: wants.has(s.i) ? 1 : 0, st: n === 0 ? 0 : n >= 3 ? 2 : 1 }); }
  MAP.setStates(states);
  // 開催中のイベントの参加店（v0.18.1）：ピンの下の札と、縮めたときの点。done＝このイベントでもう押した店
  const evDone = (id) => nev.some((e) => !!((((S.evLog || {})[e.id] || {}).s || {})[id]));
  MAP.setEventStores(nev.length ? STORES.filter((s) => nev.some((e) => E.isTarget(e, s))).map((s) => ({ i: s.i, la: s.la, lo: s.lo, done: evDone(s.i) })) : [], nev.length ? { color: nev[0].frame.color, label: nev[0].frame.label || 'イベント' } : null);
  MAP.setTerritory(Object.keys(S.stamps).map((id) => { const s = BYID.get(id); if (!s) return null; const rk = G.regularInfo(id).rank; return Object.assign({}, s, { rank: rk, rad: TERRITORY_M * (1 + 0.25 * Math.min(4, Math.max(0, rk - 1))) }); }).filter(Boolean));
}
// ---------- 現在地・お試し ----------
// 位置がないとき（「あとで」・許可しなかった・取れなかった）は、プロフィールの「住んでいる都道府県」の県庁のあたりから（v0.22.0。前は日本全体）
export function goPrefHome() { const c = S.profile && S.profile.a && S.profile.a.pref; const p = c ? PREFS[Number(c) - 1] : null; if (!p || hasPos()) return false; MAP.flyTo(p[2], p[1], 11); return true; }
export function locate() {
  unlock();
  if (POS.fake) { setTrialUI(false); }
  const ok = startWatch({ onFirst: (p) => { if (!S.settings.geoOk) { S.settings.geoOk = 1; save(); } MAP.flyTo(p.lon, p.lat, 15); toast(`現在地（誤差 約${Math.round(p.acc)}m）`); }, onError: (err) => { $('#btn-locate').classList.remove('on'); goPrefHome(); toast((err && err.code === 1 ? '位置の許可がありません。ブラウザの設定で許可できます' : '位置が取れませんでした。少しあとで、もう一度') + (TRIAL_ON ? '。「お試し歩き」でも試せます' : ''), 'warn'); } });
  if (!ok) { toast('この端末では位置が使えません' + (TRIAL_ON ? '。「お試し歩き」で試せます' : ''), 'warn'); return; }
  $('#btn-locate').classList.add('on'); if (hasPos()) MAP.flyTo(POS.lon, POS.lat, 15); else toast('現在地を確かめています…');
}
export function setTrialUI(onFlag) {
  if (onFlag && !TRIAL_ON) return; // 遊ぶ人には出さない（v0.18.1）
  setTrial(onFlag);
  $('#btn-trial').classList.toggle('on', onFlag); $('#btn-trial').classList.toggle('trial', onFlag); $('#trial-banner').hidden = !onFlag; $('#btn-warp').hidden = !onFlag; $('#btn-locate').classList.remove('on');
  if (onFlag) toast('お試し歩き：地図を押すと、そこにいることになります'); else { MAP.setMe(POS); updateNear(); }
}
export function warp(target) {
  let st = target; if (!st) { const pool = STORES.filter((s) => !s.demo && !G.hasStamp(s.i)); st = pool[Math.floor(Math.random() * pool.length)]; }
  const lat = st.la + 0.0004, lon = st.lo + 0.0005; MAP.jumpTo(lon, lat, 16); setPos(lat, lon, 10, true); toast(`${st.n} の近くへワープしました`);
}
// ---------- 店のシート ----------
// ---------- 書店員さんの1冊（v0.11） ----------
// 書名・著者・ひとことは誰でも見られる。手書きのカードは、その店の射程内でスタンプを押した人だけ（data.js pickOpen）
// 写真はサーバーから、押した記録がある端末にだけ届く（v0.16.1。events.js loadCard）。見本の店は絵
const DEMO_CARD = `<svg viewBox="0 0 300 186" role="img" aria-label="手書きのカードの見本"><g transform="rotate(-2 150 93)"><rect x="14" y="12" width="272" height="160" rx="6" fill="#FFFDF5" stroke="#1B1B1B" stroke-width="2"/><path d="M32 66h236M32 98h236M32 130h236" stroke="#E6DCC6" stroke-width="1.5"/><text x="150" y="50" text-anchor="middle" font-size="15" fill="#1B1B1B" font-family="'Zen Maru Gothic',sans-serif">（見本）書店員さんの手書きのカード</text><text x="150" y="88" text-anchor="middle" font-size="13" fill="#5A554D" font-family="'Zen Maru Gothic',sans-serif">ここに、お店でいただいた</text><text x="150" y="120" text-anchor="middle" font-size="13" fill="#5A554D" font-family="'Zen Maru Gothic',sans-serif">カードの写真が入ります</text></g><g transform="rotate(-8 246 150)"><rect x="216" y="137" width="60" height="26" rx="6" fill="#FF6A48" stroke="#1B1B1B" stroke-width="2"/><text x="246" y="155" text-anchor="middle" font-size="14" fill="#1B1B1B" font-family="'Mochiy Pop P One',sans-serif">見本</text></g></svg>`;
const CARD_TEXT = { stamp: 'この店で押したスタンプの記録が、まだサーバーに届いていません。次にこの店でスタンプを押すと見られます', none: '手書きのカードは、いま準備中です', net: 'いまは手書きのカードを読み込めませんでした。電波のよいところで、店のページを開き直してください' };
const cardImg = (url, p) => `<img src="${esc(url)}" alt="${esc(p.who)}の手書きのカード" draggable="false">`;
function pickHTML(st) {
  const p = st.rec; const open = pickOpen(st);
  const card = !E.hasCard(st) ? ''
    : !open ? `<div class="pick-lock">${icon('stamp')}<div>この${placeWord(st)}でスタンプを押すと、${esc(p.who)}の<b>手書きのカード</b>が見られます</div></div>`
    : p.photo === 'demo' ? `<div class="pick-card">${DEMO_CARD}</div>`
    : E.cardUrl(st.i) ? `<div class="pick-card">${cardImg(E.cardUrl(st.i), p)}</div>`
    : `<div class="pick-card" data-card="${esc(st.i)}"><div class="pick-wait">${CARD_TEXT[E.cardErr(st.i)] || '手書きのカードを読み込んでいます…'}</div></div>`;
  return `<div class="staff pick"><div class="who">${esc(p.who)}の手放せない1冊</div><div class="pick-book"><div class="pick-cover"${p.isbn ? ` data-isbn="${esc(p.isbn)}"` : ''}>${icon('book')}</div><div style="min-width:0"><div class="title">${esc(bookTitle(p.title))}</div>${p.author ? `<div class="muted small">${esc(p.author)}</div>` : ''}</div></div>${p.say ? `<div class="say">${esc(p.say)}</div>` : ''}${p.shelf ? `<div class="muted small">棚：${esc(p.shelf)}</div>` : ''}${card}</div>`;
}
// ---------- 店のページ（v0.26.0・サーバー 1.9.0）：書店員さんの1冊（来る前はヒント）・フェア・売場の写真・店の発信・確かさの印 ----------
// ぶっくまさん 11/19「Bで」（書名も来た人だけ）「複数写真」「フェア」「SNSは X・Instagram・その他」「行ったらなかったにならないように」
const mdOf = (d) => (d ? `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日` : '');
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'サイト'; } };
function trustHTML(st) { const t = SH.trustOf(st); return t ? `<div class="trust ${t.k}">${t.k === 'ok' ? '✔' : '△'} ${esc(t.t)}</div>` : ''; }
function snsHTML(st) {
  const l = (st.shop && st.shop.sns) || []; if (!l.length) return '';
  return `<div class="sns-row" aria-label="この店の発信">${l.map((x) => `<a class="sns" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${x.k === 'x' ? '𝕏 X' : x.k === 'ig' ? 'Instagram' : esc(hostOf(x.url))}</a>`).join('')}</div>`;
}
const phRow = (ids) => `<div class="ph-row">${ids.map((id) => `<img src="${esc(SH.picUrl(id))}" alt="" loading="lazy" decoding="async" data-ph>`).join('')}</div>`;
function fairsHTML(st) {
  const fs = (st.shop && st.shop.fairs) || []; if (!fs.length) return '';
  return `<div class="shop-sec"><h3>いまのフェア</h3>${fs.map((f) => `<div class="fair"><span class="fair-k">フェア</span><span class="muted small">${f.to ? mdOf(f.to) + 'まで' : ''}${f.from && f.from > todayISO() ? `（${mdOf(f.from)}から）` : ''}</span><div class="fair-t">${esc(f.name)}</div>${f.pics.length ? phRow(f.pics) : ''}${f.place ? `<div class="muted small">${esc(f.place)}</div>` : ''}${f.say ? `<div class="say">${esc(f.say)}</div>` : ''}</div>`).join('')}</div>`;
}
// 売場の写真：1枚目は店のページの表紙に（v0.27.0）。ここには2枚目から
function shelfHTML(st) { const sh = st.shop && st.shop.shelf; if (!sh) return ''; const rest = sh.pics.slice(1); return rest.length || sh.say ? `<div class="shop-sec"><h3>売場の写真</h3>${rest.length ? phRow(rest) : ''}${sh.say ? `<div class="muted small">${esc(sh.say)}</div>` : ''}</div>` : ''; }
function coverHTML(st) { const sh = st.shop && st.shop.shelf; return sh && sh.pics.length ? `<div class="shop-cover"><img src="${esc(SH.picUrl(sh.pics[0]))}" alt="${esc(st.n)}の売場" decoding="async" data-ph></div>` : ''; }
function srvPickHTML(st) {
  const p = st.rec; const open = pickOpen(st); const seen = SH.pickSeen(st); const g = SH.GENRES[p.genre] || '';
  if (!open || !seen || seen.v !== p.v) {
    return `<div class="staff pick lock" id="sheet-pick"><div class="who">書店員さんの1冊</div><div class="pick-book"><div class="pick-q" aria-hidden="true">？</div><div style="min-width:0"><div class="hint">「${esc(p.hint)}」</div>${g ? `<span class="genre">${esc(g)}</span>` : ''}</div></div>${open ? '<div class="pick-wait">書名を読み込んでいます…</div>' : `<div class="pick-lock">${icon('stamp')}<div>この${placeWord(st)}でスタンプを押すと、書名と写真が見られます</div></div>`}</div>`;
  }
  const idx = Object.keys(S.picks || {}).indexOf(st.i) + 1;
  return `<div class="staff pick" id="sheet-pick"><div class="who">${esc(seen.who || p.who)}の手放せない1冊　<span class="badge shu">出会った1冊 ${idx}店目</span></div><div class="pick-book"><div class="pick-cover"${seen.isbn ? ` data-isbn="${esc(seen.isbn)}"` : ''}>${icon('book')}</div><div style="min-width:0"><div class="title">${esc(bookTitle(seen.title))}</div>${seen.author ? `<div class="muted small">${esc(seen.author)}</div>` : ''}</div></div><div class="muted small">ヒント：「${esc(p.hint)}」</div>${seen.pics ? `<div class="ph-row" data-pick-photos="${seen.pics}"></div>` : ''}${seen.shelf ? `<div class="muted small">棚：${esc(seen.shelf)}</div>` : ''}<div class="actions"><button class="btn primary" data-pick-read>${icon('book')}いま読んでいる本に入れる</button></div></div>`;
}
function bindPick(st) {
  const el = $('#sheet-pick'); if (!el) return;
  const row = el.querySelector('[data-pick-photos]');
  if (row) { const n = +row.dataset.pickPhotos; for (let i = 0; i < n; i++) { const im = document.createElement('img'); im.alt = ''; im.setAttribute('data-ph', ''); row.appendChild(im); SH.pickPhoto(st, i).then((u) => { if (u) im.src = u; else im.remove(); }); } }
  const rd = el.querySelector('[data-pick-read]');
  if (rd) rd.onclick = () => { const seen = SH.pickSeen(st); if (!seen) return; const b = addReading({ title: seen.title, author: seen.author, isbn: seen.isbn }); if (b && !b.s) { b.s = st.i; b.sn = st.n; b.dm = todayISO(); save(); } toast(`『${seen.title}』を、いま読んでいる本に入れました`, 'ok'); };
  const cv = el.querySelector('.pick-cover[data-isbn]'); if (cv) lookupIsbn(cv.dataset.isbn).then((bk) => { if (bk && bk.cover && cv.isConnected) cv.innerHTML = `<img src="${esc(bk.cover)}" alt="" referrerpolicy="no-referrer">`; });
}
// 写真を大きく（前後の写真もめくれる）
function photoViewer(img) {
  const list = [...img.parentNode.querySelectorAll('img[data-ph]')].filter((x) => x.src); let i = Math.max(0, list.indexOf(img));
  const draw = () => { $('#pv-img').src = list[i].src; $('#pv-n').textContent = list.length > 1 ? `${i + 1} / ${list.length}` : ''; };
  openModal(`<div class="ph-view"><img id="pv-img" alt=""></div><div class="muted small" id="pv-n" style="text-align:center"></div><div class="actions">${list.length > 1 ? '<button class="btn" id="pv-prev">前へ</button><button class="btn" id="pv-next">次へ</button>' : ''}<button class="btn ghost" id="pv-close">閉じる</button></div>`);
  draw(); $('#pv-close').onclick = closeModal;
  if (list.length > 1) { $('#pv-prev').onclick = () => { i = (i + list.length - 1) % list.length; draw(); }; $('#pv-next').onclick = () => { i = (i + 1) % list.length; draw(); }; }
}
// 「地図データだけ」の店・遠い店で道順を開く前に（v0.26.0・行ったらなかったにならないように）
function dirWarn(st, d) {
  const t = SH.trustOf(st); const far = d != null && d > 10000;
  openModal(`<h2>お出かけの前に</h2><p>${t && t.k === 'map' ? 'この店は地図データだけで、本めぐりではまだ確かめられていません。' : ''}${far ? 'ここから10km以上あります。' : ''}閉店やお休みのこともあるので、Googleマップで営業しているかを見てからお出かけください。</p><div class="actions"><a class="btn primary wide" href="${gmapDir(st)}" target="_blank" rel="noopener" id="dw-go">${icon('map')}Googleマップで道順を見る</a><a class="btn wide" href="${gmapPlace(st)}" target="_blank" rel="noopener">${icon('search')}営業時間を見る</a><button class="btn ghost wide" id="dw-no">やめる</button></div>`);
  $('#dw-no').onclick = closeModal; $('#dw-go').addEventListener('click', () => setTimeout(closeModal, 300));
}
// 店の前で「お店が見つからない」（v0.26.0・射程内だけ）：怒る場所ではなく、直す場所に
function notFoundBox(st) {
  const x = $('#sheet-extra');
  x.innerHTML = `<div class="rp"><b>お店が見つかりませんか？</b><div class="muted small">教えていただくと、運営が確かめて、みんなの地図を直します。直ったら称号「地図守り」とページのおまけがあります。</div><div class="actions"><button class="btn" data-nf="closed">閉店していた</button><button class="btn" data-nf="moved">移転したみたい</button><button class="btn" data-nf="rename">名前がちがった</button><button class="btn ghost" data-nf="no">やめる</button></div></div>`;
  x.querySelectorAll('[data-nf]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.nf; if (k === 'no') { x.innerHTML = ''; return; } reportBox(st, k === 'rename' ? 'rename' : 'report', { near: true, why: k === 'moved' ? '移転したみたい' : k === 'closed' ? '閉店していた' : '' }); }));
}
// 閉店している・名前が違う（v0.17.0）：この端末の地図はすぐ直し、「運営にも知らせる」なら報告を送る（確かめてから、みんなの地図も直る）
const SEND_CHK = (what) => `<label class="chk rp-send"><input type="checkbox" id="rp-send" checked> 運営にも知らせる（確かめてから、みんなの地図も${what}）</label>`;
const NOTE_IN = (eg) => `<div class="field"><input type="text" id="rp-note" maxlength="100" placeholder="ひとこと（なくてもよい）例：${eg}" aria-label="ひとこと"></div>`;
const THANKS = '運営にも知らせました。ありがとうございます';
function reportBox(st, a, o = {}) {
  const x = $('#sheet-extra'); const pw = placeWord(st); const tag = (nt) => (o.near ? `【店の前から${o.why ? '・' + o.why : ''}】` : '') + nt; // v0.26.0
  x.innerHTML = a === 'report'
    ? `<div class="rp"><b>この${pw}を地図から外しますか？</b><div class="muted small">${isLib(st) ? '閉館した図書館' : '閉店した店・本屋ではない店'}。あなたの地図からはすぐに外れます（設定から戻せます）</div>${SEND_CHK('直します')}${NOTE_IN('10月末で閉店と貼り紙があった')}<div class="actions"><button class="btn primary" id="rp-ok">外す</button><button class="btn ghost" id="rp-no">やめる</button></div></div>`
    : `<div class="rp"><div class="field"><label for="rn-name">いまの正しい${pw === '図書館' ? '館名' : '店名'}</label><input type="text" id="rn-name" value="${esc(st.n)}" maxlength="60"></div>${SEND_CHK('直します')}${NOTE_IN('看板が変わっていた')}<div class="actions"><button class="btn primary" id="rn-ok">直す</button><button class="btn ghost" id="rn-no">やめる</button></div></div>`;
  const send = () => $('#rp-send').checked; const note = () => $('#rp-note').value.trim().slice(0, 100);
  if (a === 'report') {
    $('#rp-no').onclick = () => { x.innerHTML = ''; };
    $('#rp-ok').onclick = () => { const s = send(), nt = note(); hideStore(st); save(); if (s && !st.demo && !st.custom) E.queueReport({ kind: 'closed', store: st.i, orig: st.n, note: tag(nt) }); MAP.setStores(STORES); applyMapStates(); updateNear(); closeSheet(); toast(`${st.n} を外しました${s ? '。' + THANKS : ''}`, 'ok'); };
    return;
  }
  $('#rn-name').focus(); $('#rn-no').onclick = () => { x.innerHTML = ''; };
  $('#rn-ok').onclick = () => { const n = $('#rn-name').value.trim(); if (!n || n === st.n) { x.innerHTML = ''; return; } const s = send(), nt = note(); if (s && !st.demo && !st.custom) E.queueReport({ kind: 'rename', store: st.i, orig: st.n, name: n.slice(0, 80), note: tag(nt) }); renameStore(st, n); save(); MAP.setStores(STORES); applyMapStates(); updateNear(); toast(`名前を直しました（この端末）${s ? '。' + THANKS : ''}`, 'ok'); openSheet(st.i, true); };
}
export function openSheet(id, quiet) {
  const st = BYID.get(id); if (!st) return;
  const vs = G.visitsOf(id), cs = G.cardsOf(id), want = S.wants.includes(id), stamp = S.stamps[id], r = rarityOf(st), feat = isFeat(st.i), reg = G.regularInfo(id);  const d = hasPos() ? dist(POS.lat, POS.lon, st.la, st.lo) : null; const near = !st.closed && d != null && d <= RANGE_M && !jumped();
  const b = [];
  if (st.closed) b.push('<span class="badge">閉店（みんなの地図から外しました）</span>'); if (st.demo) b.push('<span class="badge">見本（実在しません）</span>'); if (st.custom) b.push('<span class="badge">自分で追加</span>'); if (st.fix) b.push('<span class="badge">名前を直した（この端末）</span>'); if (st.ov) b.push('<span class="badge">名前を確認ずみ</span>'); if (st.cf || st.x) b.push('<span class="badge ao">公式一覧で確認</span>');
  if (st.part && st.part.fresh) b.push(`<span class="badge part">参加店</span>${st.part.isNew ? '<span class="badge new">新しく届いた</span>' : ''}`); // v0.27.0
  if (feat) b.push(`<span class="badge feat">${icon('crown')}今週の推し店</span>`); if (st.u) b.push('<span class="badge">古書店</span>'); if (isLib(st)) b.push('<span class="badge lib">図書館</span>');
  b.push(stamp ? `<span class="badge shu">スタンプ ${fmtDate(stamp.d)}</span>${stamp.trial ? '<span class="badge trial">体験</span>' : ''}` : vs.length ? `<span class="badge sumi">記録 ${vs.length}回</span>` : '<span class="badge">まだ</span>');
  for (const e of E.liveEvents().filter((x) => E.isTarget(x, st)).slice(0, 2)) { const fr = E.frameFor(e, st); b.push(`<span class="badge evb" style="--evc:${esc(fr.color)}">${esc(fr.label || e.name)}${fr === e.special ? '（特別な枠）' : '（イベント）'}</span>`); }
  const evn = E.liveEvents().find((x) => E.narrow(x) && E.isTarget(x, st)); // 参加店の一覧へ（v0.18.1）
  const evl = evn ? `<button class="evlink" data-evlist="${evn.id}" style="--evc:${esc(evn.frame.color)}">${icon('pin')}<span>${esc(evn.frame.label || evn.name)}の参加店をすべて見る（${STORES.filter((s) => E.isTarget(evn, s)).length}店）</span><b>›</b></button>` : '';
  if (cs.length) b.push(`<span class="badge">カード${cs.length}枚</span>`); if (want) b.push(`<span class="badge gold">${icon('heart')}行きたい</span>`); if (near) b.push('<span class="badge gold">射程内</span>');
  const rec = st.rec ? (st.rec.srv ? srvPickHTML(st) : pickHTML(st)) : '';
  const warnDir = !near && !st.closed && !st.demo && !st.custom && !POS.fake && ((SH.trustOf(st) || {}).k === 'map' || (d != null && d > 10000)); // 道順の前のひとこと（v0.26.0）
  const hist = vs.length ? `<div class="muted small" style="margin-top:8px">${vs.slice(-3).reverse().map((v) => `${fmtDate(v.d)}${v.near ? '（スタンプ）' : '（記録）'}${v.memo ? '「' + esc(v.memo) + '」' : ''}`).join('<br>')}</div>` : '';
  const distText = st.closed ? '' : d == null ? '現在地なし' : jumped() ? '位置が大きく飛んだので、少し待ってから（1分）' : near ? `射程内（約${fmtDist(d)}）` : `ここから約${fmtDist(d)}（あと${fmtDist(d - RANGE_M)}で射程内）`;
  const srcLine = `情報：${st.srv ? '本めぐりの運営が追加' : st.ob ? 'SNS推し本大賞2026 展開店舗一覧' : st.x ? 'チェーンの公式店舗一覧' : 'OpenStreetMap'}${st.c ? `・${st.c.slice(0, 4)}年${Number(st.c.slice(5))}月に確認` : ''}${st.cf || st.x || st.srv ? '' : '（古いことがあります）'}`;
  // いちばん大きいボタン（v0.14.5）：射程内＝スタンプ／離れている＝道順（Googleマップ）／お試し歩き＝ワープ。「来た記録だけ」は下の段へ
  const main = st.closed ? '<div class="note">この店は閉店しました。押したスタンプと記録は、めぐり帳に残っています。</div>'
    : near ? `<button class="btn primary wide" data-act="checkin">${stamp ? `${icon('stamp')}もう一度押す（来店）` : `${icon('stamp')}スタンプを押す${feat ? `（+${PG.feat}ページ）` : ''}`}</button>`
    : POS.fake ? `<button class="btn primary wide" data-act="warp">${icon('warp')}この店へワープ</button>`
    : st.demo ? '<button class="btn primary wide" data-act="checkin">来た記録だけ（スタンプなし）</button>'
    : warnDir ? `<button class="btn primary wide" data-act="dir">${icon('map')}道順を見る</button>`
    : `<a class="btn primary wide" href="${gmapDir(st)}" target="_blank" rel="noopener">${icon('map')}道順を見る</a>`;
  $('#sheet-body').innerHTML = `${coverHTML(st)}
    <div class="sheet-head"><div class="stamp-sm">${stampSVG(st, !!stamp, 72, { rank: reg.rank, ev: stamp ? E.storeFrame(st.i) : null })}</div><div style="min-width:0"><h2>${esc(st.n)}</h2><div class="stars">${stars(r)} <span class="muted small">${esc(rarityText(st))}</span></div></div></div>
    <div style="margin-top:8px">${b.join('')}</div>${evl}
    <div class="muted small">${esc(distText)}</div>${trustHTML(st)}
    <div class="actions">${main}</div>${snsHTML(st)}${rec}${fairsHTML(st)}${shelfHTML(st)}
    <div class="actions">
      ${st.closed ? '' : `<button class="btn" data-act="card">${icon('barcode')}本と出会った</button>
      <button class="btn" data-act="want">${icon('heart')}${want ? '行きたいを外す' : '行きたい'}</button>`}
      ${stamp ? `<button class="btn" data-act="share">${icon('share')}シェア</button>` : ''}${reg.rank >= 2 ? `<button class="btn" data-act="regshare">${icon('crown')}常連度シェア</button>` : ''}
      ${st.demo || st.closed ? '' : `<a class="btn" href="${gmapPlace(st)}" target="_blank" rel="noopener">${icon('search')}営業時間</a>${near || POS.fake ? `<a class="btn" href="${gmapDir(st)}" target="_blank" rel="noopener">${icon('map')}道順</a>` : ''}`}
      ${!near && !st.closed && (POS.fake || !st.demo) ? '<button class="btn" data-act="checkin">来た記録だけ（スタンプなし）</button>' : ''}
      ${st.demo || st.closed ? '' : '<div class="muted small" style="grid-column:1/-1;width:100%">営業時間・道順は、Googleマップが開きます</div>'}
    </div>${st.demo ? '' : `<div class="reg"><div class="reg-h"><span class="badge ${reg.rank >= 3 ? 'shu' : reg.rank >= 2 ? 'gold' : ''}">常連度 ${reg.rank ? esc(reg.name) : 'まだ'}</span><span class="muted small">来店 ${reg.days}日${reg.next ? `・あと${reg.toNext}日で「${esc(reg.next.name)}」` : '・最高位'}</span></div><div class="rally" role="img" aria-label="常連度 ${G.REGULAR_NAMES.length}段階のうち${reg.rank}">${G.REGULAR_NAMES.map((nm, k) => `<i class="${k < reg.rank ? (k === G.REGULAR_NAMES.length - 1 ? 'top' : 'on') : ''}" title="${esc(nm)}">${k < reg.rank ? icon('check') : ''}</i>`).join('')}</div><div class="rally-l"><span>${esc(G.REGULAR_NAMES[0])}</span><span>${esc(G.REGULAR_NAMES[G.REGULAR_NAMES.length - 1])}</span></div></div>`}${hist}
    <div class="muted small" style="margin-top:10px">${esc(st.a || (st.custom ? '' : '住所の情報なし（地図データより）'))}　${esc(prefOf(st))}</div>${st.demo || st.custom ? '' : `<div class="muted small">${esc(srcLine)}</div>`}
    ${st.demo || st.custom || st.closed ? '' : `<div class="actions"><button class="btn ghost" data-act="report">${isLib(st) ? '閉館している' : '閉店している'}</button><button class="btn ghost" data-act="rename">名前が違う</button>${near ? '<button class="btn ghost" data-act="notfound">お店が見つからない</button>' : ''}</div>`}
    <div id="sheet-extra"></div>`;
  $$('#sheet-body [data-evlist]').forEach((x) => x.addEventListener('click', () => emit('evlist', x.dataset.evlist)));
  const pc = $('#sheet-body .pick-card[data-card]'); if (pc) E.loadCard(st.i).then((r) => { if (pc.isConnected) pc.innerHTML = r.url ? cardImg(r.url, st.rec) : `<div class="pick-wait">${CARD_TEXT[r.error] || CARD_TEXT.net}</div>`; });
  if (st.rec && st.rec.srv) { bindPick(st); if (pickOpen(st)) SH.openPick(st).then((seen) => { const el = $('#sheet-pick'); if (seen && el && el.isConnected && $('#sheet').dataset.id === st.i) { el.outerHTML = srvPickHTML(st); bindPick(st); } else if (!seen && el && el.querySelector('.pick-wait')) el.querySelector('.pick-wait').textContent = 'いまは書名を読み込めませんでした。電波のよいところで、店のページを開き直してください'; }); }
  $('#sheet-body').onclick = (e) => { const im = e.target.closest && e.target.closest('img[data-ph]'); if (im && im.src) photoViewer(im); };
  const cv = $('#sheet-body .pick-cover[data-isbn]:not(#sheet-pick .pick-cover)'); if (cv) lookupIsbn(cv.dataset.isbn).then((bk) => { if (bk && bk.cover && cv.isConnected) cv.innerHTML = `<img src="${esc(bk.cover)}" alt="" referrerpolicy="no-referrer">`; });
  $$('#sheet-body [data-act]').forEach((btn) => btn.addEventListener('click', () => { sfx.click(); const a = btn.dataset.act;
    if (a === 'checkin') startCheckin(st, near); else if (a === 'card') startCard(st); else if (a === 'share') shareStampUI(st); else if (a === 'regshare') shareStampUI(st, { regular: true }); else if (a === 'warp') warp(st);
    else if (a === 'report' || a === 'rename') reportBox(st, a);
    else if (a === 'dir') dirWarn(st, d);
    else if (a === 'notfound') notFoundBox(st);
    else { const r2 = G.toggleWant(id); applyMapStates(); refreshHud(); openSheet(id, true); r2.rewards.forEach((x) => toast(x, 'ok')); } }));
  const sheet = $('#sheet'); sheet.dataset.id = id; sheet.hidden = false;
  if (!quiet) { if (currentView !== 'map') switchView('map'); MAP.flyTo(st.lo, st.la, 14); G.noteLook(id).forEach((x) => toast(x, 'ok')); refreshHud(); }
}
// ---------- 地図の吹き出し（v0.27.0）：寄せたとき、参加店のピンから書店員さんのヒント ----------
// 画面の中で、真ん中に近い3店まで。16字で切る。動かない（本めぐりは静かに）。押すと店のページ
const BUB = new Map(); const BUB_ZOOM = 14, BUB_MAX = 3, BUB_LEN = 16;
const bubText = (t) => (t.length > BUB_LEN ? t.slice(0, BUB_LEN) + '…' : t);
export function updateBubbles() {
  const map = MAP.M.map; if (!map || !MAP.M.ready || typeof maplibregl === 'undefined') return;
  let want = [];
  if (map.getZoom() >= BUB_ZOOM) {
    const bd = map.getBounds(), c = map.getCenter();
    want = STORES.filter((s) => s.part && s.part.bubble && !s.closed && bd.contains([s.lo, s.la])).map((s) => ({ s, d: dist(c.lat, c.lng, s.la, s.lo) })).sort((a, b) => a.d - b.d).slice(0, BUB_MAX).map((x) => x.s);
  }
  const keep = new Set(want.map((s) => s.i));
  for (const [id, mk] of BUB) if (!keep.has(id)) { mk.remove(); BUB.delete(id); }
  for (const s of want) {
    const fair = !!(s.shop && s.shop.fairs && s.shop.fairs.length); const key = s.part.bubble + (fair ? '|f' : '');
    const old = BUB.get(s.i); if (old && old._key === key) continue; if (old) { old.remove(); BUB.delete(s.i); }
    const el = document.createElement('button'); el.type = 'button'; el.className = 'map-bubble';
    el.innerHTML = `<span class="mb-in"><b>1冊</b>${fair ? '<i>フェア</i>' : ''}${esc(bubText(s.part.bubble))}</span>`; // 札と文を同じ流れで2行まで
    const stop = (e) => e.stopPropagation();
    el.addEventListener('mousedown', stop); el.addEventListener('touchstart', stop, { passive: true }); el.addEventListener('dblclick', stop);
    el.addEventListener('click', (e) => { e.stopPropagation(); openSheet(s.i); });
    const mk = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -62] }).setLngLat([s.lo, s.la]).addTo(map); mk._key = key; BUB.set(s.i, mk);
    el.setAttribute('aria-label', `${s.n}　書店員さんのひとこと「${s.part.bubble}」`); // 地図の部品が「Map marker」に書きかえるので、あとで入れる
  }
}
// ---------- さがす・追加 ----------
// v0.23.0：検索窓はふだんしまっておき、右上の虫めがねで開く（テストプレイの声「画面の四角が多い」）。＋（地図にない本屋）は、見つからなかったときに出す
export function setupSearch() {
  const inp = $('#search'), res = $('#search-results'), box = $('#search-box'), btn = $('#btn-search');
  const setOpen = (on) => { box.hidden = !on; btn.classList.toggle('on', on); btn.setAttribute('aria-expanded', String(on)); btn.innerHTML = icon(on ? 'close' : 'search'); btn.setAttribute('aria-label', on ? '検索を閉じる' : '店をさがす'); if (on) inp.focus(); else { inp.value = ''; res.hidden = true; res.innerHTML = ''; inp.blur(); } };
  btn.onclick = () => setOpen(box.hidden);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  inp.addEventListener('input', () => { if (!inp.value.trim()) { res.hidden = true; res.innerHTML = ''; return; } const hits = search(inp.value);
    res.innerHTML = hits.map((s) => `<div class="item" data-id="${esc(s.i)}">${isFeat(s.i) ? '👑 ' : ''}${esc(s.n)} <span class="stars">${'★'.repeat(rarityOf(s))}</span><div class="muted small">${esc(s.a || prefOf(s))}</div></div>`).join('') || '<div class="item muted">見つかりません</div><div class="item add-link" id="sr-add">＋ 地図にない本屋を知らせる</div>'; res.hidden = false;
    $$('#search-results .item[data-id]').forEach((el) => el.addEventListener('click', () => { const st = BYID.get(el.dataset.id); setOpen(false); openSheet(st.i); MAP.flyTo(st.lo, st.la, 15); }));
    const add = $('#sr-add'); if (add) add.addEventListener('click', () => { setOpen(false); startAdd(); }); });
  inp.addEventListener('blur', () => setTimeout(() => { res.hidden = true; if (!inp.value.trim() && document.activeElement !== inp) setOpen(false); }, 200));
}
// 地図にない本屋（v0.18.1）：運営に知らせるだけ。運営が確かめて承認すると、みんなの地図に出る（11/3 ぶっくまさん「運営の承認のみにしたいです」）
// 前は、自分の地図にすぐ足していた（S.custom）。前に足した店は、その人の地図にそのまま残す
export function startAdd() {
  const c = MAP.center();
  openModal(`<h2>地図にない本屋を知らせる</h2><p class="hint">運営が確かめてから、みんなの地図に載せます（すぐには出ません）。送るのは、店の名前と場所と、書いたひとことだけです。</p>
    <div class="field"><label for="ad-name">店の名前</label><input type="text" id="ad-name" placeholder="例：○○書店 △△店"></div><label class="chk"><input type="checkbox" id="ad-used"> 古書店</label>
    <div class="field"><label>場所</label><label class="chk"><input type="radio" name="ad-pos" value="center" checked> いま地図の真ん中（${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}）</label><label class="chk"><input type="radio" name="ad-pos" value="here" ${hasPos() ? '' : 'disabled'}> いまいる場所</label></div>
    ${NOTE_IN('2階にある古本屋')}
    <div class="actions"><button class="btn primary" id="ad-save">運営に知らせる</button><button class="btn ghost" id="ad-cancel">やめる</button></div>`);
  $('#ad-cancel').onclick = closeModal; $('#ad-name').focus();
  $('#ad-save').onclick = () => { const n = $('#ad-name').value.trim(); if (!n) { toast('店の名前を入れてください', 'warn'); return; } let la = c.lat, lo = c.lng; if ($('input[name=ad-pos]:checked').value === 'here' && hasPos()) { la = POS.lat; lo = POS.lon; }
    E.queueReport({ kind: 'add', store: 'u' + Date.now(), name: n.slice(0, 80), lat: +la.toFixed(5), lon: +lo.toFixed(5), place: $('#ad-used').checked ? 'used' : 'book', note: $('#rp-note').value.trim().slice(0, 100) }); // つながらないときは、あとで送る
    closeModal(); toast('運営に知らせました。確かめてから、みんなの地図に載せます。ありがとうございます', 'ok'); };
}

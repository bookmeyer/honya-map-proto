// 地図の画面：現在地まわり（射程・いちばん近い店）・ピンの状態・現在地とお試し歩き・店のページ・さがす・店を足す・行きたい店のお知らせ
import { RANGE_M, TERRITORY_M, PG } from './config.js?v=0.17.2';
import { $, arrowOf, bearing, icon, fmtDist, esc, dist, $$, emit, fmtDate, gmapDir, stars, gmapPlace, prefOf } from './util.js?v=0.17.2';
import { S, save } from './state.js?v=0.17.2';
import { unlock, sfx } from './audio.js?v=0.17.2';
import { hasPos, POS, startWatch, setTrial, setPos, jumped } from './position.js?v=0.17.2';
import { STORES, BYID, isLib, isFeat, rarityOf, pickOpen, placeWord, bookTitle, stampSVG, rarityText, lookupIsbn, hideStore, renameStore, search, addCustom, FEAT } from './data.js?v=0.17.2';
import * as MAP from './map.js?v=0.17.2';
import * as G from './game.js?v=0.17.2';
import * as E from './events.js?v=0.17.2';
import * as J from './journey.js?v=0.17.2';
import { dirLink, openModal, closeModal, stopLinks, toast, closeSheet, refreshHud, currentView, switchView } from './ui.js?v=0.17.2';
import { startCheckin, shareStampUI } from './checkin_ui.js?v=0.17.2';
import { startCard } from './card_ui.js?v=0.17.2';

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
  if (!chip || !m || !S.wants.length || m.getZoom() < 10) { if (chip) chip.hidden = true; return; }
  const b = m.getBounds(); const list = J.wantsInBounds({ s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() });
  if (!list.length) { chip.hidden = true; return; }
  chip.innerHTML = `${icon('heart')}この辺りに行きたい店 ${list.length}店`; chip.hidden = false;
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
  const strip = $('#radar-items'), quest = $('#first-quest');
  if (!hasPos()) { NEAR.list = []; NEAR.inRange = new Set(); NEAR.glow = new Set(); strip.innerHTML = ''; quest.hidden = true; applyMapStates(); emit('near'); return; }
  const cand = []; for (const s of STORES) { if (Math.abs(s.la - POS.lat) > 0.03 || Math.abs(s.lo - POS.lon) > 0.036) continue; cand.push({ s, d: dist(POS.lat, POS.lon, s.la, s.lo) }); }
  cand.sort((a, b) => a.d - b.d); NEAR.list = cand.slice(0, 30);
  const now = new Set(NEAR.list.filter((x) => x.d <= RANGE_M).map((x) => x.s.i));
  NEAR.glow = new Set(NEAR.list.filter((x) => x.d <= RANGE_M).slice(0, GLOW_MAX).map((x) => x.s.i));
  const entered = [...now].filter((id) => !NEAR.inRange.has(id)); NEAR.inRange = now;
  if (entered.length) { const first = BYID.get(entered[0]); toast(`📍 ${first.n}${entered.length > 1 ? ` ほか${entered.length - 1}店` : ''} が射程に入りました`, 'ok'); }
  const target = NEAR.list.find((x) => !G.hasStamp(x.s.i));
  if (target && !now.size) { quest.hidden = false; quest.innerHTML = `${icon('pin')}<span>いちばん近い${isLib(target.s) ? '図書館' : '本屋'} <b>${esc(target.s.n)}</b> まで あと${fmtDist(Math.max(0, target.d - RANGE_M))} ${arrowOf(bearing(POS.lat, POS.lon, target.s.la, target.s.lo))}</span>`; quest.onclick = () => openSheet(target.s.i); } else quest.hidden = true;
  strip.innerHTML = NEAR.list.slice(0, 8).map(({ s, d }) => `<div class="rchip ${d <= RANGE_M ? 'in' : ''}" data-id="${esc(s.i)}"><div class="n">${G.hasStamp(s.i) ? icon('check') : ''}${isFeat(s.i) ? '👑 ' : ''}${esc(s.n)}</div><div class="d"><span>${d <= RANGE_M ? '射程内！' : `あと${fmtDist(d - RANGE_M)} ${arrowOf(bearing(POS.lat, POS.lon, s.la, s.lo))}`}</span><span class="stars">${'★'.repeat(rarityOf(s))}</span></div></div>`).join('');
  $$('#radar-items .rchip').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  applyMapStates(); emit('near');
  refreshSheet();
}
// 開いている店のページを描き直す。名前の直し・閉店の確かめを開いているあいだは描き直さない（v0.16.0）
export function refreshSheet() { const sheet = $('#sheet'); if (!sheet.hidden && sheet.dataset.id && !$('#sheet-extra').childElementCount) openSheet(sheet.dataset.id, true); }
export function applyMapStates() {
  const states = new Map();
  const nev = E.liveEvents().filter(E.narrow); if (nev.length) MAP.setEventRingColor(nev[0].frame.color);
  // 店ごとの記録の数・推し店・行きたいは、先に1回だけ数える（v0.16.0：位置が届くたびに 店×記録 を数え直していて、記録が増えると重くなった）
  const cnt = new Map(); for (const v of S.visits) cnt.set(v.s, (cnt.get(v.s) || 0) + 1); for (const c of S.cards) cnt.set(c.s, (cnt.get(c.s) || 0) + 1);
  const feat = new Set(FEAT.values()), wants = new Set(S.wants);
  for (const s of STORES) { const n = cnt.get(s.i) || 0; states.set(s.i, { stamp: G.hasStamp(s.i) ? 1 : 0, near: NEAR.glow.has(s.i) ? 1 : 0, feat: feat.has(s.i) ? 1 : 0, want: wants.has(s.i) ? 1 : 0, st: n === 0 ? 0 : n >= 3 ? 2 : 1, ev: nev.length && nev.some((e) => E.isTarget(e, s)) ? 1 : 0 }); }
  MAP.setStates(states);
  MAP.setTerritory(Object.keys(S.stamps).map((id) => { const s = BYID.get(id); if (!s) return null; const rk = G.regularInfo(id).rank; return Object.assign({}, s, { rank: rk, rad: TERRITORY_M * (1 + 0.25 * Math.min(4, Math.max(0, rk - 1))) }); }).filter(Boolean));
}
// ---------- 現在地・お試し ----------
export function locate() {
  unlock();
  if (POS.fake) { setTrialUI(false); }
  const ok = startWatch({ onFirst: (p) => { if (!S.settings.geoOk) { S.settings.geoOk = 1; save(); } MAP.flyTo(p.lon, p.lat, 15); toast(`現在地（誤差 約${Math.round(p.acc)}m）`); }, onError: (err) => { $('#btn-locate').classList.remove('on'); toast(err && err.code === 1 ? '位置の許可がありません。ブラウザの設定で許可できます。「お試し歩き」でも試せます' : '位置が取れませんでした。「お試し歩き」でも試せます', 'warn'); } });
  if (!ok) { toast('この端末では位置が使えません。「お試し歩き」で試せます', 'warn'); return; }
  $('#btn-locate').classList.add('on'); if (hasPos()) MAP.flyTo(POS.lon, POS.lat, 15); else toast('現在地を確かめています…');
}
export function setTrialUI(onFlag) {
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
const CARD_TEXT = { off: '手書きのカードは、設定の「参加の記録を送る」をオンにしてから、この店でスタンプを押すと見られます（押した記録で、カードを開きます）', stamp: 'この店で押したスタンプの記録が、まだサーバーに届いていません。次にこの店でスタンプを押すと見られます', none: '手書きのカードは、いま準備中です', net: 'いまは手書きのカードを読み込めませんでした。電波のよいところで、店のページを開き直してください' };
const cardImg = (url, p) => `<img src="${esc(url)}" alt="${esc(p.who)}の手書きのカード" draggable="false">`;
function pickHTML(st) {
  const p = st.rec; const open = pickOpen(st);
  const card = !E.hasCard(st) ? ''
    : !open ? `<div class="pick-lock">${icon('stamp')}<div>この${placeWord(st)}でスタンプを押すと、${esc(p.who)}の<b>手書きのカード</b>が見られます</div></div>`
    : p.photo === 'demo' ? `<div class="pick-card">${DEMO_CARD}</div>`
    : E.cardUrl(st.i) ? `<div class="pick-card">${cardImg(E.cardUrl(st.i), p)}</div>`
    : `<div class="pick-card" data-card="${esc(st.i)}"><div class="pick-wait">${S.settings.sendLog === false ? CARD_TEXT.off : CARD_TEXT[E.cardErr(st.i)] || '手書きのカードを読み込んでいます…'}</div></div>`;
  return `<div class="staff pick"><div class="who">${esc(p.who)}の手放せない1冊</div><div class="pick-book"><div class="pick-cover"${p.isbn ? ` data-isbn="${esc(p.isbn)}"` : ''}>${icon('book')}</div><div style="min-width:0"><div class="title">${esc(bookTitle(p.title))}</div>${p.author ? `<div class="muted small">${esc(p.author)}</div>` : ''}</div></div>${p.say ? `<div class="say">${esc(p.say)}</div>` : ''}${p.shelf ? `<div class="muted small">棚：${esc(p.shelf)}</div>` : ''}${card}</div>`;
}
// 閉店している・名前が違う（v0.17.0）：この端末の地図はすぐ直し、「運営にも知らせる」なら報告を送る（確かめてから、みんなの地図も直る）
const SEND_CHK = (what) => `<label class="chk rp-send"><input type="checkbox" id="rp-send" checked> 運営にも知らせる（確かめてから、みんなの地図も${what}）</label>`;
const NOTE_IN = (eg) => `<div class="field"><input type="text" id="rp-note" maxlength="100" placeholder="ひとこと（なくてもよい）例：${eg}" aria-label="ひとこと"></div>`;
const THANKS = '運営にも知らせました。ありがとうございます';
function reportBox(st, a) {
  const x = $('#sheet-extra'); const pw = placeWord(st);
  x.innerHTML = a === 'report'
    ? `<div class="rp"><b>この${pw}を地図から外しますか？</b><div class="muted small">${isLib(st) ? '閉館した図書館' : '閉店した店・本屋ではない店'}。あなたの地図からはすぐに外れます（設定から戻せます）</div>${SEND_CHK('直します')}${NOTE_IN('10月末で閉店と貼り紙があった')}<div class="actions"><button class="btn primary" id="rp-ok">外す</button><button class="btn ghost" id="rp-no">やめる</button></div></div>`
    : `<div class="rp"><div class="field"><label for="rn-name">いまの正しい${pw === '図書館' ? '館名' : '店名'}</label><input type="text" id="rn-name" value="${esc(st.n)}" maxlength="60"></div>${SEND_CHK('直します')}${NOTE_IN('看板が変わっていた')}<div class="actions"><button class="btn primary" id="rn-ok">直す</button><button class="btn ghost" id="rn-no">やめる</button></div></div>`;
  const send = () => $('#rp-send').checked; const note = () => $('#rp-note').value.trim().slice(0, 100);
  if (a === 'report') {
    $('#rp-no').onclick = () => { x.innerHTML = ''; };
    $('#rp-ok').onclick = () => { const s = send(), nt = note(); hideStore(st); save(); if (s && !st.demo && !st.custom) E.queueReport({ kind: 'closed', store: st.i, orig: st.n, note: nt }); MAP.setStores(STORES); applyMapStates(); updateNear(); closeSheet(); toast(`${st.n} を外しました${s ? '。' + THANKS : ''}`, 'ok'); };
    return;
  }
  $('#rn-name').focus(); $('#rn-no').onclick = () => { x.innerHTML = ''; };
  $('#rn-ok').onclick = () => { const n = $('#rn-name').value.trim(); if (!n || n === st.n) { x.innerHTML = ''; return; } const s = send(), nt = note(); if (s && !st.demo && !st.custom) E.queueReport({ kind: 'rename', store: st.i, orig: st.n, name: n.slice(0, 80), note: nt }); renameStore(st, n); save(); MAP.setStores(STORES); applyMapStates(); updateNear(); toast(`名前を直しました（この端末）${s ? '。' + THANKS : ''}`, 'ok'); openSheet(st.i, true); };
}
export function openSheet(id, quiet) {
  const st = BYID.get(id); if (!st) return;
  const vs = G.visitsOf(id), cs = G.cardsOf(id), want = S.wants.includes(id), stamp = S.stamps[id], r = rarityOf(st), feat = isFeat(st.i), reg = G.regularInfo(id);  const d = hasPos() ? dist(POS.lat, POS.lon, st.la, st.lo) : null; const near = !st.closed && d != null && d <= RANGE_M && !jumped();
  const b = [];
  if (st.closed) b.push('<span class="badge">閉店（みんなの地図から外しました）</span>'); if (st.demo) b.push('<span class="badge">見本（実在しません）</span>'); if (st.custom) b.push('<span class="badge">自分で追加</span>'); if (st.fix) b.push('<span class="badge">名前を直した（この端末）</span>'); if (st.ov) b.push('<span class="badge">名前を確認ずみ</span>'); if (st.cf || st.x) b.push('<span class="badge ao">公式一覧で確認</span>');
  if (feat) b.push(`<span class="badge feat">${icon('crown')}今週の推し店</span>`); if (st.u) b.push('<span class="badge">古書店</span>'); if (isLib(st)) b.push('<span class="badge lib">図書館</span>');
  b.push(stamp ? `<span class="badge shu">スタンプ ${fmtDate(stamp.d)}</span>${stamp.trial ? '<span class="badge trial">体験</span>' : ''}` : vs.length ? `<span class="badge sumi">記録 ${vs.length}回</span>` : '<span class="badge">まだ</span>');
  for (const e of E.liveEvents().filter((x) => E.isTarget(x, st)).slice(0, 2)) { const fr = E.frameFor(e, st); b.push(`<span class="badge evb" style="--evc:${esc(fr.color)}">${esc(fr.label || e.name)}${fr === e.special ? '（特別な枠）' : '（イベント）'}</span>`); }
  if (cs.length) b.push(`<span class="badge">カード${cs.length}枚</span>`); if (want) b.push(`<span class="badge gold">${icon('heart')}行きたい</span>`); if (near) b.push('<span class="badge gold">射程内</span>');
  const rec = st.rec ? pickHTML(st) : '';
  const hist = vs.length ? `<div class="muted small" style="margin-top:8px">${vs.slice(-3).reverse().map((v) => `${fmtDate(v.d)}${v.near ? '（スタンプ）' : '（記録）'}${v.memo ? '「' + esc(v.memo) + '」' : ''}`).join('<br>')}</div>` : '';
  const distText = st.closed ? '' : d == null ? '現在地なし' : jumped() ? '位置が大きく飛んだので、少し待ってから（1分）' : near ? `射程内（約${fmtDist(d)}）` : `ここから約${fmtDist(d)}（あと${fmtDist(d - RANGE_M)}で射程内）`;
  const srcLine = `情報：${st.ob ? 'SNS推し本大賞2026 展開店舗一覧' : st.x ? 'チェーンの公式店舗一覧' : 'OpenStreetMap'}${st.c ? `・${st.c.slice(0, 4)}年${Number(st.c.slice(5))}月に確認` : ''}${st.cf || st.x ? '' : '（古いことがあります）'}`;
  // いちばん大きいボタン（v0.14.5）：射程内＝スタンプ／離れている＝道順（Googleマップ）／お試し歩き＝ワープ。「来た記録だけ」は下の段へ
  const main = st.closed ? '<div class="note">この店は閉店しました。押したスタンプと記録は、めぐり帳に残っています。</div>'
    : near ? `<button class="btn primary wide" data-act="checkin">${stamp ? `${icon('stamp')}もう一度押す（来店）` : `${icon('stamp')}スタンプを押す${feat ? `（+${PG.feat}ページ）` : ''}`}</button>`
    : POS.fake ? `<button class="btn primary wide" data-act="warp">${icon('warp')}この店へワープ</button>`
    : st.demo ? '<button class="btn primary wide" data-act="checkin">来た記録だけ（スタンプなし）</button>'
    : `<a class="btn primary wide" href="${gmapDir(st)}" target="_blank" rel="noopener">${icon('map')}道順を見る</a>`;
  $('#sheet-body').innerHTML = `
    <div class="sheet-head"><div class="stamp-sm">${stampSVG(st, !!stamp, 72, { rank: reg.rank, ev: stamp ? E.storeFrame(st.i) : null })}</div><div style="min-width:0"><h2>${esc(st.n)}</h2><div class="stars">${stars(r)} <span class="muted small">${esc(rarityText(st))}</span></div></div></div>
    <div style="margin-top:8px">${b.join('')}</div>
    <div class="muted small">${esc(distText)}</div>
    <div class="actions">${main}</div>${rec}
    <div class="actions">
      ${st.closed ? '' : `<button class="btn" data-act="card">${icon('barcode')}本と出会った</button>
      <button class="btn" data-act="want">${icon('heart')}${want ? '行きたいを外す' : '行きたい'}</button>`}
      ${stamp ? `<button class="btn" data-act="share">${icon('share')}シェア</button>` : ''}${reg.rank >= 2 ? `<button class="btn" data-act="regshare">${icon('crown')}常連度シェア</button>` : ''}
      ${st.demo || st.closed ? '' : `<a class="btn" href="${gmapPlace(st)}" target="_blank" rel="noopener">${icon('search')}営業時間</a>${near || POS.fake ? `<a class="btn" href="${gmapDir(st)}" target="_blank" rel="noopener">${icon('map')}道順</a>` : ''}`}
      ${!near && !st.closed && (POS.fake || !st.demo) ? '<button class="btn" data-act="checkin">来た記録だけ（スタンプなし）</button>' : ''}
      ${st.demo || st.closed ? '' : '<div class="muted small" style="grid-column:1/-1;width:100%">営業時間・道順は、Googleマップが開きます</div>'}
    </div>${st.demo ? '' : `<div class="reg"><div class="reg-h"><span class="badge ${reg.rank >= 3 ? 'shu' : reg.rank >= 2 ? 'gold' : ''}">常連度 ${reg.rank ? esc(reg.name) : 'まだ'}</span><span class="muted small">来店 ${reg.days}日${reg.next ? `・あと${reg.toNext}日で「${esc(reg.next.name)}」` : '・最高位'}</span></div><div class="rally" role="img" aria-label="常連度 ${G.REGULAR_NAMES.length}段階のうち${reg.rank}">${G.REGULAR_NAMES.map((nm, k) => `<i class="${k < reg.rank ? (k === G.REGULAR_NAMES.length - 1 ? 'top' : 'on') : ''}" title="${esc(nm)}">${k < reg.rank ? icon('check') : ''}</i>`).join('')}</div><div class="rally-l"><span>${esc(G.REGULAR_NAMES[0])}</span><span>${esc(G.REGULAR_NAMES[G.REGULAR_NAMES.length - 1])}</span></div></div>`}${hist}
    <div class="muted small" style="margin-top:10px">${esc(st.a || (st.custom ? '' : '住所の情報なし（地図データより）'))}　${esc(prefOf(st))}</div>${st.demo || st.custom ? '' : `<div class="muted small">${esc(srcLine)}</div>`}
    ${st.demo || st.custom || st.closed ? '' : `<div class="actions"><button class="btn ghost" data-act="report">${isLib(st) ? '閉館している' : '閉店している'}</button><button class="btn ghost" data-act="rename">名前が違う</button></div>`}
    <div id="sheet-extra"></div>`;
  const pc = $('#sheet-body .pick-card[data-card]'); if (pc) E.loadCard(st.i).then((r) => { if (pc.isConnected) pc.innerHTML = r.url ? cardImg(r.url, st.rec) : `<div class="pick-wait">${CARD_TEXT[r.error] || CARD_TEXT.net}</div>`; });
  const cv = $('#sheet-body .pick-cover[data-isbn]'); if (cv) lookupIsbn(cv.dataset.isbn).then((bk) => { if (bk && bk.cover && cv.isConnected) cv.innerHTML = `<img src="${esc(bk.cover)}" alt="" referrerpolicy="no-referrer">`; });
  $$('#sheet-body [data-act]').forEach((btn) => btn.addEventListener('click', () => { sfx.click(); const a = btn.dataset.act;
    if (a === 'checkin') startCheckin(st, near); else if (a === 'card') startCard(st); else if (a === 'share') shareStampUI(st); else if (a === 'regshare') shareStampUI(st, { regular: true }); else if (a === 'warp') warp(st);
    else if (a === 'report' || a === 'rename') reportBox(st, a);
    else { const r2 = G.toggleWant(id); applyMapStates(); refreshHud(); openSheet(id, true); r2.rewards.forEach((x) => toast(x, 'ok')); } }));
  const sheet = $('#sheet'); sheet.dataset.id = id; sheet.hidden = false;
  if (!quiet) { if (currentView !== 'map') switchView('map'); MAP.flyTo(st.lo, st.la, 14); G.noteLook(id).forEach((x) => toast(x, 'ok')); refreshHud(); }
}
// ---------- さがす・追加 ----------
export function setupSearch() {
  const inp = $('#search'), res = $('#search-results');
  inp.addEventListener('input', () => { if (!inp.value.trim()) { res.hidden = true; res.innerHTML = ''; return; } const hits = search(inp.value);
    res.innerHTML = hits.map((s) => `<div class="item" data-id="${esc(s.i)}">${isFeat(s.i) ? '👑 ' : ''}${esc(s.n)} <span class="stars">${'★'.repeat(rarityOf(s))}</span><div class="muted small">${esc(s.a || prefOf(s))}</div></div>`).join('') || '<div class="item muted">見つかりません。＋ で地図に追加できます</div>'; res.hidden = false;
    $$('#search-results .item[data-id]').forEach((el) => el.addEventListener('click', () => { res.hidden = true; inp.value = ''; const st = BYID.get(el.dataset.id); openSheet(st.i); MAP.flyTo(st.lo, st.la, 15); })); });
  inp.addEventListener('blur', () => setTimeout(() => { res.hidden = true; }, 200));
}
export function startAdd() {
  const c = MAP.center();
  openModal(`<h2>地図にない本屋を追加</h2><p class="hint">追加した店は、すぐにあなたの地図に出ます。</p>
    <div class="field"><label for="ad-name">店の名前</label><input type="text" id="ad-name" placeholder="例：○○書店 △△店"></div><label class="chk"><input type="checkbox" id="ad-used"> 古書店</label>
    <div class="field"><label>場所</label><label class="chk"><input type="radio" name="ad-pos" value="center" checked> いま地図の真ん中（${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}）</label><label class="chk"><input type="radio" name="ad-pos" value="here" ${hasPos() ? '' : 'disabled'}> いまいる場所</label></div>
    <label class="chk rp-send"><input type="checkbox" id="rp-send" checked> 運営にも知らせる（確かめてから、みんなの地図に載せます。送るのは店の名前と場所だけ）</label>${NOTE_IN('2階にある古本屋')}
    <div class="actions"><button class="btn primary" id="ad-save">追加する</button><button class="btn ghost" id="ad-cancel">やめる</button></div>`);
  $('#ad-cancel').onclick = closeModal; $('#ad-name').focus();
  $('#ad-save').onclick = () => { const n = $('#ad-name').value.trim(); if (!n) { toast('店の名前を入れてください', 'warn'); return; } let la = c.lat, lo = c.lng; if ($('input[name=ad-pos]:checked').value === 'here' && hasPos()) { la = POS.lat; lo = POS.lon; }
    const st = { i: 'u' + Date.now(), n, la: +la.toFixed(5), lo: +lo.toFixed(5), u: $('#ad-used').checked ? 1 : undefined }; const s = $('#rp-send').checked;
    if (s) E.queueReport({ kind: 'add', store: st.i, name: n.slice(0, 80), lat: st.la, lon: st.lo, place: st.u ? 'used' : 'book', note: $('#rp-note').value.trim().slice(0, 100) }); // 地図にない店（v0.17.0）
    addCustom(st); save(); MAP.setStores(STORES); applyMapStates(); updateNear(); closeModal(); toast(`追加しました${s ? '。' + THANKS : ''}`, 'ok'); openSheet(st.i); };
}

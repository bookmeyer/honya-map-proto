// 読書・いま読んでいる本・1冊の旅の画面（v0.14。v0.14.7 で「移動読書」から「読書」に：止まって読む人もいるので）
// 地図の大きなボタン「ここから読む」で時間を計りはじめ（本も読みかたも選ばない）、読み終えたら「しおりをはさむ」で止める（v0.14.4・名前は v0.24.0）。読んだ時間だけページが増える
// v0.24.0（ぶっくまさん 11/18。mekuru との違いは「どこで」）：1km以上動いて読んだ記録は「移動読書」。しおりをはさんだあとは「どこで」を大きく。読み終えたら「1冊の旅」
// アプリは閉じてよい（時刻で計る）。読んでいる本は、読書中のボタンを押したときに、えらびたい人だけえらぶ
import { esc, icon, $, $$, fmtDate, fmtMin, fmtDist, todayISO, emit } from './util.js?v=0.32.0';
import { READ } from './config.js?v=0.32.0';
import { S, save } from './state.js?v=0.32.0';
import { POS } from './position.js?v=0.32.0';
import * as R from './reading.js?v=0.32.0';
import { closeModal, toast, openModal, stopScan, scanIsbn, searchBook, confirmBox, dirLink, currentView } from './ui.js?v=0.32.0';
import { BYID } from './data.js?v=0.32.0';
import { tabiImage, shareBlob } from './share.js?v=0.32.0';
import { noteShare } from './game.js?v=0.32.0';
import { queueAct } from './events.js?v=0.32.0';

const cover = (b) => `<div class="rcover">${b.cover ? `<img src="${esc(b.cover)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : icon('book')}</div>`;
const hm = (t) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const tripBook = (tr) => (tr && tr.book ? (S.reading || []).find((x) => x.id === tr.book) : null);
// ---------- 地図の大きなボタン：「ここから読む」（前回の本があれば、下に小さく「『○○』のつづき」）／読書中＋「しおりをはさむ」 ----------
let tick = null; // 読書中は、経った時間を30秒ごとに書きかえる（開いているときだけ）
export function renderReadBtn() {
  const el = $('#read-btn'); if (!el) return;
  const tr = R.activeTrip(); const b = tripBook(tr);
  if (tr && !tick) tick = setInterval(() => { if (document.visibilityState === 'visible') renderReadBtn(); }, 30000); else if (!tr && tick) { clearInterval(tick); tick = null; }
  if (POS.fake) { el.hidden = true; return; } // お試し歩きでは出さない
  el.hidden = false; const m = R.tripMin(tr); const nb = tr ? null : R.nextBook();
  // 2行目：読んでいる本。えらんでいないときは「本をえらぶ ›」（v0.14.6：本をどこでえらぶのか、わかるように）
  el.innerHTML = tr ? `<button class="rb-main" id="rb-main"><span class="rb-i">📖</span><span class="rb-t"><b>読書中</b><span class="rb-b${b ? '' : ' pick'}">${b ? `『${esc(b.title)}』 ›` : '本をえらぶ ›'}</span></span><span class="rb-s">${m < 1 ? 'はじめたところ' : fmtMin(m)}</span></button><button class="rb-end two" id="rb-end" aria-label="しおりをはさむ（読書をおえる）">しおりを<br>はさむ</button>` : `<button class="rb-go" id="rb-go"><span class="rb-i">📖</span><span class="rb-t${nb ? ' two' : ''}">ここから読む${nb ? `<small>『${esc(nb.title)}』のつづき</small>` : ''}</span></button>`;
  if (tr) { $('#rb-main').onclick = openTrip; $('#rb-end').onclick = finishTrip; } else $('#rb-go').onclick = () => openReadStart();
}
// 「しおりをはさむ」：読んだ時間を記録して、ページを足す。12時間を過ぎていたら、いつまで読んだかを聞く（v0.23.0）
export function finishTrip() {
  const tr = R.activeTrip(); if (tr && R.tripStale(tr)) { openForgot(tr); return; }
  const r = R.endTrip(); closeModal();
  if (r && r.min >= 1) showShiori(r); else toast('1分より短かったので、記録しませんでした');
}
// ---------- しおりをはさんだあと（v0.24.0）：「どこで」を大きく（移動読書 6.2km／○○書店のそばで／その場で）、時間とページは小さく。数秒で消える（押しても消える） ----------
// 前は上に細い帯で「読書 32分 +32ページ（移動しながら 6km）」。地図の画面でないときは、これまでどおり帯で
let sdTimer = null;
export function showShiori(r) {
  clearInterval(sdTimer); const old = $('#shiori-done'); if (old) old.remove();
  const dock = $('#bottom-dock');
  if (currentView !== 'map' || !dock) { toast(`📖 ${r.pl ? R.placeText(r.pl) : '読書'}　${fmtMin(r.min)}　+${r.pg}ページ`, 'ok'); return; }
  const el = document.createElement('div'); el.id = 'shiori-done'; el.className = 'shiori-done'; el.setAttribute('role', 'status');
  let pl0 = r.pl;
  const draw = () => {
    const pl = r.pl, t = r.book ? R.bookTrip(r.book) : null;
    const big = !pl ? `読書 <b>${fmtMin(r.min)}</b>` : pl.k === 'move' ? `移動読書 <b>${fmtDist(pl.m)}</b>` : pl.k === 'store' ? `<b>${esc(pl.n)}</b>のそばで` : 'その場で';
    const nth = t ? (pl && pl.k === 'move' ? `移動読書 ${t.move}回目` : `読書 ${t.n}回目`) : '';
    el.innerHTML = `<div class="k">🔖 しおりをはさみました</div><div class="big${pl && pl.k === 'store' ? ' st' : ''}">${big}</div><div class="sub">${hm(r.t0)}〜${hm(r.t1)}・${fmtMin(r.min)}　+${r.pg}ページ</div>${r.title ? `<div class="tabi">『${esc(r.title)}』${nth ? `　${nth}` : ''}</div>` : ''}`;
  };
  draw(); dock.insertBefore(el, dock.firstChild);
  const close = () => { clearInterval(sdTimer); el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  el.onclick = close;
  // しおりをはさんだ所の位置が、押したあとに届いたとき（reading.js の p1wait）は、届いた位置で書き直す
  let n = 0; sdTimer = setInterval(() => { n++; if (r.pl !== pl0) { pl0 = r.pl; draw(); } if (n >= 8) close(); }, 1000);
}
// ---------- 「しおりをはさむ」の押し忘れ（v0.23.0 テストプレイの声「終わるのを忘れてしまいます」） ----------
// 読書をはじめて1時間を過ぎてからアプリを開くと「読書中のままでした」と出し、読んだ長さを、だいたいで選んでもらう。
// 「まだ読んでいる」なら、そのまま続ける（それから1時間は聞かない）。12時間を過ぎていても消さずに聞く（このときは「いままで」と「まだ読んでいる」を出さない）
const ASK_AFTER = 60 * 60000, ASK_AGAIN = 60 * 60000;
const lenText = (m) => (m < 60 ? `${m}分` : m % 60 === 0 ? `${m / 60}時間` : m % 60 === 30 ? `${Math.floor(m / 60)}時間半` : `${Math.floor(m / 60)}時間${m % 60}分`);
const busy = () => !!$('#setup') || !$('#modal').hidden || !$('#onboard').hidden || !!$('#tour') || !!document.querySelector('.capture:not([hidden])');
export function checkForgot(tries = 0) {
  const tr = R.activeTrip(); if (!tr || POS.fake) return;
  const el = Date.now() - tr.t; if (el < ASK_AFTER) return;
  if (!R.tripStale(tr) && tr.askAt && Date.now() - tr.askAt < ASK_AGAIN) return;
  if (busy()) { if (tries < 90) setTimeout(() => checkForgot(tries + 1), 1000); return; } // はじめの設定・お知らせ・画面の案内が閉じてから
  openForgot(tr);
}
export function openForgot(tr) {
  const elMin = Math.floor((Date.now() - tr.t) / 60000), stale = R.tripStale(tr);
  tr.askAt = Date.now(); save(); // 閉じただけのときも、1時間は聞かない
  const opts = [15, 30, 45, 60, 90, 120, 180].filter((m) => m < elMin).slice(0, stale ? 6 : 5);
  const now = Math.min(elMin, READ.maxMin);
  const opt = (m) => `<button class="btn" data-m="${m}"><b>${lenText(m)}</b><small>${hm(tr.t + m * 60000)}まで</small></button>`;
  openModal(`<h2>📖 読書中のままでした</h2><div class="muted small">${stale ? `${fmtDate(todayISO(new Date(tr.t)))} ` : ''}${hm(tr.t)} から、${lenText(elMin)}たっています</div>
    <p class="hint" style="margin-top:10px">「しおりをはさむ」を押し忘れていませんか？ 読んだ長さを、だいたいで選んでください。その分だけ記録して、ページを足します。</p>
    <div class="fq">${opts.map(opt).join('')}${stale ? '' : `<button class="btn now" data-m="${now}"><b>いままで</b><small>${lenText(now)}${elMin > READ.maxMin ? 'まで' : ''}</small></button>`}</div>
    <div class="actions">${stale ? '' : '<button class="btn wide" id="fg-keep">まだ読んでいる</button>'}<button class="btn ghost wide" id="fg-drop">記録しない</button></div>`);
  $$('#modal-box .fq [data-m]').forEach((b) => b.addEventListener('click', () => {
    const m = Number(b.dataset.m); const r = R.endTrip(tr.t + m * 60000, false, false, true); closeModal();
    if (r && r.min >= 1) showShiori(r);
  }));
  if ($('#fg-keep')) $('#fg-keep').onclick = () => { closeModal(); toast('📖 読書をつづけます。読み終えたら「しおりをはさむ」を押してください'); };
  $('#fg-drop').onclick = () => { R.cancelTrip(); closeModal(); toast('読書をやめました（記録していません）'); };
}
// ---------- ここから読む：押すだけで始まる。はじめての時だけ、使い方を1回 ----------
export function openReadStart({ book = '' } = {}) {
  const go = () => { R.startTrip(book); closeModal(); const b = tripBook(R.activeTrip()); toast(b ? `📖『${b.title}』を、ここから読みます（本を変えるときは、読書中のボタンを押す）` : '📖 ここから読みます。読み終えたら「しおりをはさむ」を押してください', 'ok'); };
  if (S.settings.readTip) { go(); return; }
  openModal(`<h2>ここから読む</h2><ul class="plain"><li>本を読む時間を計ります。電車やバスの中でも、カフェでも。耳で聞くのも</li><li>読み終えたら「<b>しおりをはさむ</b>」を押します。そこで読書がおわり、読んだ時間だけページが増えます（1分で1ページ）</li><li>はじめた所から1km以上はなれた所でしおりをはさむと「<b>移動読書</b>」になります</li><li>しおりをはさんだ所には、地図にしおりの印が残ります（この端末の中だけ）</li><li>読んでいる本は、読書中のボタンの「本をえらぶ」から（えらばなくても大丈夫です）</li><li>歩くあいだは、しまってください。アプリは閉じて大丈夫です</li><li>押し忘れても大丈夫です。1時間を過ぎてから開くと、読んだ長さを聞きます</li></ul>
    <div class="actions"><button class="btn primary wide" id="rs-go">📖 はじめる</button><button class="btn ghost wide" id="rs-close">やめる</button></div>`);
  $('#rs-close').onclick = closeModal; $('#rs-go').onclick = () => { S.settings.readTip = 1; save(); go(); };
}
// 読書中（ボタンの左を押したとき）：読んでいる本をえらぶ（えらばなくてよい。ここで足すこともできる）・しおりをはさむ・記録せずにやめる
export function openTrip() {
  const tr = R.activeTrip(); if (!tr) return; const b = tripBook(tr); const m = R.tripMin(tr);
  const books = R.reading().slice().sort((x, y) => (y.t || 0) - (x.t || 0));
  openModal(`<h2>読書中</h2><div class="muted small">${tr.fn ? `${esc(tr.fn)}から・` : ''}${hm(tr.t)}〜（${m < 1 ? 'はじめたところ' : fmtMin(m)}）</div>
    <h3>読んでいる本</h3><p class="hint">えらばなくても大丈夫です。えらぶと、本ごとに読んだ時間が残ります。</p>
    ${books.length ? `<div class="list rlist">${books.map((x) => `<div class="item rbook${b && b.id === x.id ? ' sel' : ''}" data-b="${esc(x.id)}">${cover(x)}<div class="main"><div class="name">${esc(x.title)}</div>${b && b.id === x.id ? '<div class="sub">この本を読んでいます（もう一度押すと外す）</div>' : ''}</div></div>`).join('')}</div>` : ''}
    ${b ? `<div class="actions"><button class="btn wide" id="tp-done">📕『${esc(b.title)}』を読み終えた</button></div><p class="hint">ここまでの時間を残して、めぐり帳の「読み終えた本」に入れます。物語と「1冊の旅」に残ります</p>` : ''}
    <div class="actions"><button class="btn wide" id="tp-add">${icon('barcode')}${books.length ? 'ほかの本を足す' : '読んでいる本を足す'}</button></div>
    <div class="note">読み終えたら「しおりをはさむ」を押してください。読んだ時間だけページが増えます（1分で1ページ）。歩くあいだは、しまってください。</div>
    <div class="actions"><button class="btn primary wide" id="tp-end">🔖 しおりをはさむ（記録する）</button><button class="btn danger" id="tp-stop">記録せずにやめる</button><button class="btn ghost" id="tp-close">閉じる</button></div>`);
  $('#tp-close').onclick = closeModal; $('#tp-end').onclick = finishTrip; $('#tp-stop').onclick = () => { R.cancelTrip(); closeModal(); toast('読書をやめました（記録していません）'); };
  if ($('#tp-done')) $('#tp-done').onclick = () => { const res = R.finishReading(b.id); closeModal(); if (res && res.book) openTabi(res.book.id, { just: res }); }; // 読み終えた（v0.15.1：読書中の画面からも）→ 1冊の旅（v0.24.0）
  $('#tp-add').onclick = () => startReadingAdd((nb) => { R.setTripBook(nb.id); toast(`『${nb.title}』を読んでいます`, 'ok'); });
  $$('#modal-box [data-b]').forEach((el) => el.addEventListener('click', () => { const id = b && b.id === el.dataset.b ? '' : el.dataset.b; R.setTripBook(id); closeModal(); }));
}
// ---------- いま読んでいる本の登録（めぐり帳「本」と、読書中の画面から） ----------
let afterAdd = null; // 読書中の画面から足したときは、その本で読んでいることにする
export function startReadingAdd(onAdded = null) {
  afterAdd = onAdded;
  const cands = S.cards.slice().reverse().filter((c) => !R.inReading(c)).slice(0, 12);
  const cancel = () => { stopScan(); closeModal(); };
  openModal(`<h2>いま読んでいる本を登録</h2><p class="hint">記録はこの端末の中だけです。読み終わったら、めぐり帳の物語に残ります。</p>
    <div class="actions"><button class="btn primary wide" id="cd-scan">${icon('camera')}本の裏のバーコードを読む</button><button class="btn" id="cd-search">${icon('search')}書名でさがす</button><button class="btn" id="cd-free">名前を自分で書く</button>${cands.length ? '<button class="btn wide" id="ra-cards">出会った本（カード）から選ぶ</button>' : ''}<button class="btn ghost wide" id="cd-cancel">やめる</button></div><div id="cd-area"></div>`);
  const found = (b) => { stopScan(); if (b && b.title) confirmAdd(b, cancel); else freeTitle(b); };
  $('#cd-cancel').onclick = cancel; $('#cd-scan').onclick = () => scanIsbn(found); $('#cd-search').onclick = () => searchBook(found); $('#cd-free').onclick = () => freeTitle(null);
  if ($('#ra-cards')) $('#ra-cards').onclick = () => {
    stopScan();
    $('#cd-area').innerHTML = `<div class="list rlist">${cands.map((c) => `<div class="item rbook" data-c="${esc(c.id)}">${cover(c)}<div class="main"><div class="name">${esc(c.title)}</div><div class="sub">${esc(c.sn)}・${fmtDate(c.d)}</div></div></div>`).join('')}</div>`;
    $$('#cd-area [data-c]').forEach((el) => el.addEventListener('click', () => { const c = S.cards.find((x) => x.id === el.dataset.c); if (c) added(R.readingFromCard(c)); }));
  };
}
function added(b) { const cb = afterAdd; afterAdd = null; closeModal(); if (cb) cb(b); else toast(`『${b.title}』を、いま読んでいる本に入れました`, 'ok'); }
function confirmAdd(b, cancel) {
  openModal(`<h2>この本を登録しますか</h2><div class="card-full"><div class="cover">${b.cover ? `<img src="${esc(b.cover)}" alt="" referrerpolicy="no-referrer">` : '<div class="notitle">表紙なし</div>'}</div><div style="flex:1;min-width:0"><div><b>${esc(b.title)}</b></div><div class="muted small">${esc(b.author || '')}${b.publisher ? '／' + esc(b.publisher) : ''}</div></div></div>
    <div class="actions"><button class="btn primary" id="ra-ok">いま読んでいる本に入れる</button><button class="btn ghost" id="ra-no">やめる</button></div>`);
  $('#ra-no').onclick = cancel; $('#ra-ok').onclick = () => added(R.addReading(b));
}
function freeTitle(b0) {
  stopScan();
  const area = $('#cd-area'); if (!area) return;
  area.innerHTML = `<div class="field"><label for="ra-title">本の名前</label><input type="text" id="ra-title" maxlength="80" placeholder="書名（わかれば著者も）"></div><div class="actions"><button class="btn primary wide" id="ra-ok2">いま読んでいる本に入れる</button></div>`;
  $('#ra-title').focus();
  $('#ra-ok2').onclick = () => { const t = $('#ra-title').value.trim(); if (!t) { toast('本の名前を入れてください', 'warn'); return; } added(R.addReading(Object.assign({ isbn: '', author: '', cover: '' }, b0 || {}, { title: t }))); };
}
// ---------- めぐり帳「本」：いま読んでいる本・読み終えた本（その下に出会った本のカード） ----------
export function renderReading() {
  const el = $('#reading'); if (!el) return;
  const now = R.reading().slice().sort((x, y) => (y.t || 0) - (x.t || 0)), done = R.finished(), tr = R.activeTrip();
  const reads = (b) => R.tripCountText(R.bookTrip(b.id)); // v0.24.0：「移動読書 3回・ほか 1回」
  const meta = (b) => [b.sn ? `${b.sn}で出会った` : '', `${fmtDate(b.d)}から`, reads(b), tr && tr.book === b.id ? '読書中' : ''].filter(Boolean).join('・');
  el.innerHTML = `<h3>いま読んでいる本</h3>${now.length ? `<p class="hint">読み終えたら「読み終わった」を押すと「読み終えた本」に入り、どこで出会って、どこで何回読んだかが「1冊の旅」の1枚になります</p>` : ''}${now.length ? `<div class="list rlist">${now.map((b) => `<div class="item rbook">${cover(b)}<div class="main"><div class="name">${esc(b.title)}</div><div class="sub">${esc(meta(b))}</div><div class="ract"><button class="btn" data-done="${esc(b.id)}">読み終わった</button><button class="btn ghost" data-drop="${esc(b.id)}">外す</button></div></div></div>`).join('')}</div>` : '<p class="muted small">まだありません。読み終わったら、めぐり帳の物語に残ります。</p>'}
    <div class="actions"><button class="btn" id="rd-add">${icon('barcode')}いま読んでいる本を登録</button></div><div id="rd-out"></div>
    ${done.length ? `<details class="chap rdone"><summary><b>読み終えた本</b><span class="muted small">${done.length}冊</span></summary><div class="list rlist">${done.map((b) => `<div class="item rbook">${cover(b)}<div class="main"><div class="name">${esc(b.title)}</div><div class="sub">${esc([`${fmtDate(b.done)}に読み終えた`, b.sn ? `${b.sn}で出会った` : '', reads(b)].filter(Boolean).join('・'))}</div><div class="ract"><button class="btn primary" data-tabi="${esc(b.id)}">1冊の旅 ›</button><button class="btn ghost" data-undone="${esc(b.id)}">読みかけに戻す</button></div></div></div>`).join('')}</div></details>` : ''}
    <h3>出会った本（カード）</h3>`;
  $('#rd-add').onclick = () => startReadingAdd(); // クリックの出来事を「足したあと」の関数と取りちがえないように（v0.16.0：めぐり帳から登録すると止まっていた）
  $$('#reading [data-done]').forEach((x) => x.addEventListener('click', () => { const res = R.finishReading(x.dataset.done); if (res && res.book) openTabi(res.book.id, { just: res }); })); // 読み終えたら「1冊の旅」（v0.24.0）
  $$('#reading [data-tabi]').forEach((x) => x.addEventListener('click', () => openTabi(x.dataset.tabi)));
  $$('#reading [data-undone]').forEach((x) => x.addEventListener('click', () => R.unfinishReading(x.dataset.undone)));
  $$('#reading [data-drop]').forEach((x) => x.addEventListener('click', () => { const b = R.reading().find((y) => y.id === x.dataset.drop); confirmBox($('#rd-out'), `『${b ? b.title : ''}』を、いま読んでいる本から外しますか？（カードと物語は残ります）`, () => R.dropReading(x.dataset.drop), '外す'); }));
}

// ---------- 1冊の旅（v0.24.0）：出会った店 → どこで何回読んだか → 読み終えた。里帰りのお誘い・シェア・地図で見る（自分だけ） ----------
// 出るとき：「読み終えた」を押したとき（just＝finishReading の結果）と、めぐり帳の「読み終えた本」の「1冊の旅 ›」から
const md = (iso) => { const [, m, d] = String(iso).split('-').map(Number); return `${m}月${d}日`; };
export function openTabi(id, { just = null } = {}) {
  const t = R.bookTrip(id); if (!t) return; const b = t.b; const st = b.s ? BYID.get(b.s) : null;
  queueAct({ k: 'tabi', sub: 'open', id: 't' + Date.now() }); // 1冊の旅を開いた（回数だけ。v0.25.0）
  const rows = [];
  if (b.dm) rows.push(`<li><i class="shu"></i><b>${md(b.dm)}　出会った</b>${b.sn ? `<div>${esc(b.sn)}</div>` : ''}</li>`);
  if (t.move) rows.push(`<li><i class="pink"></i><b>移動読書　${t.move}回</b><div>あわせて ${fmtDist(t.moveM)}</div></li>`);
  if (t.store) rows.push(`<li><i class="pink"></i><b>本屋のそばで　${t.store}回</b>${t.storeNames.length ? `<div>${esc(t.storeNames.slice(0, 2).join('・'))}${t.storeNames.length > 2 ? ' ほか' : ''}</div>` : ''}</li>`);
  if (t.stay) rows.push(`<li><i class="pink"></i><b>その場で　${t.stay}回</b></li>`);
  if (t.other) rows.push(`<li><i class="pink"></i><b>${t.move || t.store || t.stay ? 'ほか' : '読書'}　${t.other}回</b><div>場所の記録なし</div></li>`);
  rows.push(b.done ? `<li><i class="gold"></i><b>${md(b.done)}　読み終えた</b>${t.n ? `<div>読書 ${t.n}回・あわせて ${fmtMin(t.min)}</div>` : ''}</li>` : '<li><i></i><b>読んでいるところ</b></li>');
  const head = !b.done ? '読んでいるところ' : t.days > 0 ? `出会ってから${t.days}日で読み終えた` : t.days === 0 ? '出会ったその日に読み終えた' : `${fmtDate(b.done)}に読み終えた`;
  const sato = !b.done || !st ? '' : b.sato ? `<div class="tb-sato">🔖 ${md(b.sato)}に、${esc(b.sn)}へ里帰りしました。</div>`
    : `<div class="tb-sato">🔖 <b>${esc(b.sn)}</b>に、また行ってみませんか。この本と出会った店でスタンプを押すと「里帰り」のスタンプになります。${st.demo || st.closed ? '' : `<div class="actions">${dirLink(st, '道順')}</div>`}</div>`;
  const note = just ? `<p class="hint">読み終えた本に入れました${just.read ? `（読書 ${fmtMin(just.read.min)}　+${just.read.pg}ページ）` : ''}。物語にも書きました。</p>` : '';
  openModal(`<h2>1冊の旅</h2>${note}<div class="tb-head">${cover(b)}<div><b>『${esc(b.title)}』</b><div class="muted small">${head}</div></div></div><ol class="tb-line">${rows.join('')}</ol>${sato}
    <div class="actions"><button class="btn primary wide" id="tb-share">${icon('share')}シェアする</button>${t.pts.length ? '<button class="btn wide" id="tb-map">地図で見る（自分だけ）</button>' : ''}<button class="btn ghost wide" id="tb-close">閉じる</button></div><div id="tb-out"></div>`);
  $('#tb-close').onclick = closeModal;
  $('#tb-share').onclick = () => shareTabi(t, st);
  if ($('#tb-map')) $('#tb-map').onclick = () => { closeModal(); emit('fit-reads', t.pts); };
}
// シェアの1枚：地図は入れない（場所は端末の中だけ）。文は「『○○』を読み終えた。○○書店で出会って12日、移動読書5回 #本めぐり」
async function shareTabi(t, st) {
  try {
    const b = t.b; const blob = await tabiImage(t, st);
    const text = `『${b.title}』を${b.done ? '読み終えた' : '読んでいる'}。${b.sn ? `${b.sn}で出会って${t.days > 0 ? `${t.days}日` : 'その日'}、` : ''}${t.move ? `移動読書${t.move}回` : `読書${t.n}回`} #本めぐり`;
    const r = await shareBlob(blob, `tabi-${b.id}.png`, `${b.title}　1冊の旅`, text);
    if (r !== 'cancel') { noteShare('tabi', b.s || '', r); queueAct({ k: 'tabi', sub: 'share', id: 'u' + Date.now() }); toast(r === 'saved' ? '画像を保存しました' : 'シェアしました', 'ok'); }
  } catch (e) { const o = $('#tb-out'); if (o) o.innerHTML = '<p class="muted small">画像にできませんでした。</p>'; }
}

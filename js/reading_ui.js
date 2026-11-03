// 読書・いま読んでいる本の画面（v0.14。v0.14.7 で「移動読書」から「読書」に：止まって読む人もいるので）
// 地図の大きなボタン「読書をはじめる」で時間を計りはじめ（本も読みかたも選ばない）、読み終えたら「おわる」で止める（v0.14.4）。読んだ時間だけページが増える
// アプリは閉じてよい（時刻で計る）。読んでいる本は、読書中のボタンを押したときに、えらびたい人だけえらぶ
import { esc, icon, $, $$, fmtDate, fmtMin } from './util.js?v=0.20.1';
import { S, save } from './state.js?v=0.20.1';
import { POS } from './position.js?v=0.20.1';
import * as R from './reading.js?v=0.20.1';
import { closeModal, toast, openModal, stopScan, scanIsbn, searchBook, confirmBox } from './ui.js?v=0.20.1';

const cover = (b) => `<div class="rcover">${b.cover ? `<img src="${esc(b.cover)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : icon('book')}</div>`;
const hm = (t) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const tripBook = (tr) => (tr && tr.book ? (S.reading || []).find((x) => x.id === tr.book) : null);
// ---------- 地図の大きなボタン：「読書をはじめる」／読書中＋「おわる」 ----------
let tick = null; // 読書中は、経った時間を30秒ごとに書きかえる（開いているときだけ）
export function renderReadBtn() {
  const el = $('#read-btn'); if (!el) return;
  const tr = R.activeTrip(); const b = tripBook(tr);
  if (tr && !tick) tick = setInterval(() => { if (document.visibilityState === 'visible') renderReadBtn(); }, 30000); else if (!tr && tick) { clearInterval(tick); tick = null; }
  if (POS.fake) { el.hidden = true; return; } // お試し歩きでは出さない
  el.hidden = false; const m = R.tripMin(tr);
  // 2行目：読んでいる本。えらんでいないときは「本をえらぶ ›」（v0.14.6：本をどこでえらぶのか、わかるように）
  el.innerHTML = tr ? `<button class="rb-main" id="rb-main"><span class="rb-i">📖</span><span class="rb-t"><b>読書中</b><span class="rb-b${b ? '' : ' pick'}">${b ? `『${esc(b.title)}』 ›` : '本をえらぶ ›'}</span></span><span class="rb-s">${m < 1 ? 'はじめたところ' : fmtMin(m)}</span></button><button class="rb-end" id="rb-end">おわる</button>` : '<button class="rb-go" id="rb-go"><span class="rb-i">📖</span><span class="rb-t">読書をはじめる</span></button>';
  if (tr) { $('#rb-main').onclick = openTrip; $('#rb-end').onclick = finishTrip; } else $('#rb-go').onclick = () => openReadStart();
}
// 「おわる」：読んだ時間を記録して、ページを足す
export function finishTrip() {
  const r = R.endTrip(); closeModal();
  if (r && r.min >= 1) toast(`📖 読書 ${fmtMin(r.min)}　+${r.pg}ページ${r.pl ? `（${R.placeText(r.pl)}）` : ''}`, 'ok'); else toast('1分より短かったので、記録しませんでした');
}
// ---------- 読書をはじめる：押すだけで始まる。はじめての時だけ、使い方を1回 ----------
export function openReadStart({ book = '' } = {}) {
  const go = () => { R.startTrip(book); closeModal(); const b = tripBook(R.activeTrip()); toast(b ? `📖『${b.title}』の読書をはじめました（本を変えるときは、読書中のボタンを押す）` : '📖 読書をはじめました。読み終えたら「おわる」を押してください', 'ok'); };
  if (S.settings.readTip) { go(); return; }
  openModal(`<h2>読書をはじめる</h2><ul class="plain"><li>本を読む時間を計ります。電車の中でも、カフェでも。耳で聞くのも</li><li>読み終えたら「おわる」を押します。読んだ時間だけページが増えます（1分で1ページ）</li><li>読んでいる本は、読書中のボタンの「本をえらぶ」から（えらばなくても大丈夫です）</li><li>歩くあいだは、しまってください。アプリは閉じて大丈夫です</li></ul>
    <div class="actions"><button class="btn primary wide" id="rs-go">📖 はじめる</button><button class="btn ghost wide" id="rs-close">やめる</button></div>`);
  $('#rs-close').onclick = closeModal; $('#rs-go').onclick = () => { S.settings.readTip = 1; save(); go(); };
}
// 読書中（ボタンの左を押したとき）：読んでいる本をえらぶ（えらばなくてよい。ここで足すこともできる）・おわる・記録せずにやめる
export function openTrip() {
  const tr = R.activeTrip(); if (!tr) return; const b = tripBook(tr); const m = R.tripMin(tr);
  const books = R.reading().slice().sort((x, y) => (y.t || 0) - (x.t || 0));
  openModal(`<h2>読書中</h2><div class="muted small">${tr.fn ? `${esc(tr.fn)}から・` : ''}${hm(tr.t)}〜（${m < 1 ? 'はじめたところ' : fmtMin(m)}）</div>
    <h3>読んでいる本</h3><p class="hint">えらばなくても大丈夫です。えらぶと、本ごとに読んだ時間が残ります。</p>
    ${books.length ? `<div class="list rlist">${books.map((x) => `<div class="item rbook${b && b.id === x.id ? ' sel' : ''}" data-b="${esc(x.id)}">${cover(x)}<div class="main"><div class="name">${esc(x.title)}</div>${b && b.id === x.id ? '<div class="sub">この本を読んでいます（もう一度押すと外す）</div>' : ''}</div></div>`).join('')}</div>` : ''}
    ${b ? `<div class="actions"><button class="btn wide" id="tp-done">📕『${esc(b.title)}』を読み終えた</button></div><p class="hint">ここまでの時間を残して、めぐり帳の「読み終えた本」に入れます。物語にも残ります</p>` : ''}
    <div class="actions"><button class="btn wide" id="tp-add">${icon('barcode')}${books.length ? 'ほかの本を足す' : '読んでいる本を足す'}</button></div>
    <div class="note">読み終えたら「おわる」を押してください。読んだ時間だけページが増えます（1分で1ページ）。歩くあいだは、しまってください。</div>
    <div class="actions"><button class="btn primary wide" id="tp-end">おわる（記録する）</button><button class="btn danger" id="tp-stop">記録せずにやめる</button><button class="btn ghost" id="tp-close">閉じる</button></div>`);
  $('#tp-close').onclick = closeModal; $('#tp-end').onclick = finishTrip; $('#tp-stop').onclick = () => { R.cancelTrip(); closeModal(); toast('読書をやめました（記録していません）'); };
  if ($('#tp-done')) $('#tp-done').onclick = () => { const res = R.finishReading(b.id); closeModal(); const fb = res && res.book, r = res && res.read; if (fb) toast(`📕『${fb.title}』を読み終えた本に入れました${r ? `（読書 ${fmtMin(r.min)} +${r.pg}ページ）` : ''}。物語にも書きました`, 'ok'); }; // 読み終えた（v0.15.1：読書中の画面からも）
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
  const reads = (b) => (R.readTimes(b.id) ? `読書${R.readTimes(b.id)}回${R.readMinOf(b.id) ? `・${fmtMin(R.readMinOf(b.id))}` : ''}` : '');
  const meta = (b) => [b.sn ? `${b.sn}で出会った` : '', `${fmtDate(b.d)}から`, reads(b), tr && tr.book === b.id ? '読書中' : ''].filter(Boolean).join('・');
  el.innerHTML = `<h3>いま読んでいる本</h3>${now.length ? `<p class="hint">読み終えたら「読み終わった」を押すと「読み終えた本」に入り、どこで出会って何回読んだかが物語に残ります</p>` : ''}${now.length ? `<div class="list rlist">${now.map((b) => `<div class="item rbook">${cover(b)}<div class="main"><div class="name">${esc(b.title)}</div><div class="sub">${esc(meta(b))}</div><div class="ract"><button class="btn" data-done="${esc(b.id)}">読み終わった</button><button class="btn ghost" data-drop="${esc(b.id)}">外す</button></div></div></div>`).join('')}</div>` : '<p class="muted small">まだありません。読み終わったら、めぐり帳の物語に残ります。</p>'}
    <div class="actions"><button class="btn" id="rd-add">${icon('barcode')}いま読んでいる本を登録</button></div><div id="rd-out"></div>
    ${done.length ? `<details class="chap rdone"><summary><b>読み終えた本</b><span class="muted small">${done.length}冊</span></summary><div class="list rlist">${done.map((b) => `<div class="item rbook">${cover(b)}<div class="main"><div class="name">${esc(b.title)}</div><div class="sub">${esc([`${fmtDate(b.done)}に読み終えた`, b.sn ? `${b.sn}で出会った` : '', reads(b)].filter(Boolean).join('・'))}</div><div class="ract"><button class="btn ghost" data-undone="${esc(b.id)}">読みかけに戻す</button></div></div></div>`).join('')}</div></details>` : ''}
    <h3>出会った本（カード）</h3>`;
  $('#rd-add').onclick = () => startReadingAdd(); // クリックの出来事を「足したあと」の関数と取りちがえないように（v0.16.0：めぐり帳から登録すると止まっていた）
  $$('#reading [data-done]').forEach((x) => x.addEventListener('click', () => { const res = R.finishReading(x.dataset.done); const b = res && res.book; if (b) toast(`『${b.title}』を読み終えた本に入れました（今日の物語にも書きました）`, 'ok'); }));
  $$('#reading [data-undone]').forEach((x) => x.addEventListener('click', () => R.unfinishReading(x.dataset.undone)));
  $$('#reading [data-drop]').forEach((x) => x.addEventListener('click', () => { const b = R.reading().find((y) => y.id === x.dataset.drop); confirmBox($('#rd-out'), `『${b ? b.title : ''}』を、いま読んでいる本から外しますか？（カードと物語は残ります）`, () => R.dropReading(x.dataset.drop), '外す'); }));
}

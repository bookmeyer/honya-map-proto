// 移動読書・いま読んでいる本の画面（v0.14）
// 地図の大きなボタン「今から移動読書」→ 読む本を選んで「はじめる」→ アプリは閉じてよい → 次の本屋でスタンプを押すと記録（v0.14.1）。ページ数は聞かない
import { READ } from './config.js?v=0.14.1';
import { S } from './state.js?v=0.14.1';
import * as J from './journey.js?v=0.14.1';
import { POS } from './position.js?v=0.14.1';
import { toast, openModal, closeModal, confirmBox, scanIsbn, manualIsbn, stopScan } from './ui.js?v=0.14.1';
import { $, $$, esc, fmtDate, todayISO, icon } from './util.js?v=0.14.1';

const cover = (b) => `<div class="rcover">${b.cover ? `<img src="${esc(b.cover)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : icon('book')}</div>`;
const hm = (t) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const RULE = `乗り物の中や、座れるところで読みます。歩くあいだは、しまってください（耳で聞くのは、歩きながらでも）。アプリは閉じて大丈夫です。次の本屋でスタンプを押すと記録され、5分以上なら +${READ.pages}ページ。`;

// ---------- 地図の大きなボタン：「今から移動読書」／移動読書中 ----------
export function renderReadBtn() {
  const el = $('#read-btn'); if (!el) return;
  if (POS.fake) { el.hidden = true; return; } // お試し歩きでは数えないので出さない
  const tr = J.activeTrip(); const b = tr ? (S.reading || []).find((x) => x.id === tr.book) : null;
  el.hidden = false; el.classList.toggle('on', !!b);
  el.innerHTML = b ? `<span class="rb-i">📖</span><span class="rb-t"><b>移動読書中</b>『${esc(b.title)}』</span><span class="rb-s">${hm(tr.t)}〜</span>` : '<span class="rb-i">📖</span><span class="rb-t">今から移動読書</span>';
  el.setAttribute('aria-label', b ? `移動読書中：${b.title}` : '今から移動読書');
  el.onclick = () => (b ? openTrip() : openReadStart());
}

// ---------- 今から移動読書：読む本と読みかたを選ぶ ----------
// 読む本の候補：いま読んでいる本と、今日出会った本（まだ入れていないもの）。'b:本のid' か 'c:カードのid'
function bookChoices() {
  const out = J.reading().slice().sort((x, y) => (y.t || 0) - (x.t || 0)).map((b) => ({ key: 'b:' + b.id, title: b.title, cover: b.cover, sub: b.sn ? `${b.sn}で出会った` : `${fmtDate(b.d)}から` }));
  for (const c of S.cards.filter((x) => x.d === todayISO()).reverse()) if (!J.inReading(c)) out.push({ key: 'c:' + c.id, title: c.title, cover: c.cover, sub: `今日、${c.sn}で出会った` });
  return out;
}
export function openReadStart({ book } = {}) {
  const books = bookChoices();
  if (!books.length) { startReadingAdd((b) => openReadStart({ book: b.id }), null, { title: '今から移動読書', hint: 'まず、読む本を登録してください。次からは、選ぶだけではじめられます。' }); return; }
  const want = book ? 'b:' + book : ''; const pick = books.some((x) => x.key === want) ? want : books[0].key;
  let mode = S.settings.readMode === 'ear' ? 'ear' : 'eye';
  openModal(`<h2>今から移動読書</h2><p class="hint">読む本</p>
    <div class="list dp-books">${books.map((b) => `<label class="item rbook"><input type="radio" name="rs-book" value="${esc(b.key)}"${b.key === pick ? ' checked' : ''}>${cover(b)}<div class="main"><div class="name">${esc(b.title)}</div><div class="sub">${esc(b.sub)}</div></div></label>`).join('')}</div>
    <button class="linkish" id="rs-add">＋ ほかの本を登録</button>
    <div class="mode-sw" role="group" aria-label="読みかた"><button data-m="eye" class="${mode === 'eye' ? 'on' : ''}">本で読む</button><button data-m="ear" class="${mode === 'ear' ? 'on' : ''}">耳で聞く</button></div>
    <div class="actions"><button class="btn primary wide" id="rs-go">📖 はじめる</button><button class="btn ghost wide" id="rs-close">やめる</button></div>
    <div class="note">${RULE}</div>`);
  $$('.mode-sw button').forEach((x) => x.addEventListener('click', () => { mode = x.dataset.m; $$('.mode-sw button').forEach((y) => y.classList.toggle('on', y === x)); }));
  $('#rs-add').onclick = () => startReadingAdd((b) => openReadStart({ book: b.id }), () => openReadStart({ book }));
  $('#rs-close').onclick = closeModal;
  $('#rs-go').onclick = () => {
    const r = $('#modal-box input[name="rs-book"]:checked'); if (!r) { toast('読む本を選んでください', 'warn'); return; }
    const [k, id] = r.value.split(':'); let b = k === 'b' ? J.reading().find((x) => x.id === id) : null;
    if (k === 'c') { const c = S.cards.find((x) => x.id === id); if (c) b = J.readingFromCard(c); }
    if (!b) return; J.startTrip(b.id, mode); closeModal();
    toast(`📖 移動読書をはじめました。次の本屋でスタンプを押してください`, 'ok');
  };
}
// 移動読書中（地図のボタンを押したとき）
export function openTrip() {
  const tr = J.activeTrip(); if (!tr) return; const b = (S.reading || []).find((x) => x.id === tr.book); if (!b) return;
  openModal(`<h2>移動読書中</h2><div class="rbook-one">${cover(b)}<div style="min-width:0"><b>${esc(b.title)}</b><div class="muted small">${tr.fn ? `${esc(tr.fn)}から・` : ''}${hm(tr.t)}〜・${tr.mode === 'ear' ? '耳で聞く' : '本で読む'}</div></div></div>
    <div class="note">次の本屋でスタンプを押すと記録されます（5分以上なら +${READ.pages}ページ）。アプリは閉じて大丈夫です。</div>
    <div class="actions"><button class="btn" id="tp-change">本を変える</button><button class="btn danger" id="tp-stop">やめる</button><button class="btn ghost wide" id="tp-close">閉じる</button></div>`);
  $('#tp-close').onclick = closeModal; $('#tp-stop').onclick = () => { J.cancelTrip(); closeModal(); toast('移動読書をやめました'); };
  $('#tp-change').onclick = () => openReadStart({ book: tr.book });
}

// ---------- いま読んでいる本の登録 ----------
// after(b)：登録できたあと。back()：やめたとき（移動読書の画面から来たときは、そこへ戻る）
export function startReadingAdd(after, back, { title = 'いま読んでいる本を登録', hint = '登録した本は、移動読書で選べます。記録はこの端末の中だけです。' } = {}) {
  const cands = S.cards.slice().reverse().filter((c) => !J.inReading(c)).slice(0, 12);
  const cancel = () => { stopScan(); if (back) back(); else closeModal(); };
  openModal(`<h2>${esc(title)}</h2><p class="hint">${esc(hint)}</p>
    <div class="actions"><button class="btn primary wide" id="cd-scan">${icon('camera')}本の裏のバーコードを読む</button><button class="btn" id="cd-manual">ISBNを入力</button><button class="btn" id="cd-free">名前を自分で書く</button>${cands.length ? '<button class="btn wide" id="ra-cards">出会った本（カード）から選ぶ</button>' : ''}<button class="btn ghost wide" id="cd-cancel">やめる</button></div><div id="cd-area"></div>`);
  const found = (b) => { stopScan(); if (b && b.title) confirmAdd(b, after, cancel); else freeTitle(after, b); };
  $('#cd-cancel').onclick = cancel; $('#cd-scan').onclick = () => scanIsbn(found); $('#cd-manual').onclick = () => manualIsbn(found); $('#cd-free').onclick = () => freeTitle(after, null);
  if ($('#ra-cards')) $('#ra-cards').onclick = () => {
    $('#cd-area').innerHTML = `<div class="list rlist">${cands.map((c) => `<div class="item rbook" data-c="${esc(c.id)}">${cover(c)}<div class="main"><div class="name">${esc(c.title)}</div><div class="sub">${esc(c.sn)}・${fmtDate(c.d)}</div></div></div>`).join('')}</div>`;
    $$('#cd-area [data-c]').forEach((el) => el.addEventListener('click', () => { const c = S.cards.find((x) => x.id === el.dataset.c); if (c) added(J.readingFromCard(c), after); }));
  };
}
function added(b, after) { toast(`『${b.title}』を、いま読んでいる本に入れました`, 'ok'); if (after) after(b); else closeModal(); }
function confirmAdd(b, after, cancel) {
  openModal(`<h2>この本を登録しますか</h2><div class="card-full"><div class="cover">${b.cover ? `<img src="${esc(b.cover)}" alt="" referrerpolicy="no-referrer">` : '<div class="notitle">表紙なし</div>'}</div><div style="flex:1;min-width:0"><div><b>${esc(b.title)}</b></div><div class="muted small">${esc(b.author || '')}${b.publisher ? '／' + esc(b.publisher) : ''}</div></div></div>
    <div class="actions"><button class="btn primary" id="ra-ok">いま読んでいる本に入れる</button><button class="btn ghost" id="ra-no">やめる</button></div>`);
  $('#ra-no').onclick = cancel; $('#ra-ok').onclick = () => added(J.addReading(b), after);
}
function freeTitle(after, b0) {
  const area = $('#cd-area'); if (!area) return;
  area.innerHTML = `<div class="field"><label for="ra-title">本の名前</label><input type="text" id="ra-title" maxlength="80" placeholder="書名（わかれば著者も）"></div><div class="actions"><button class="btn primary wide" id="ra-ok2">いま読んでいる本に入れる</button></div>`;
  $('#ra-title').focus();
  $('#ra-ok2').onclick = () => { const t = $('#ra-title').value.trim(); if (!t) { toast('本の名前を入れてください', 'warn'); return; } added(J.addReading(Object.assign({ isbn: '', author: '', cover: '' }, b0 || {}, { title: t })), after); };
}

// ---------- めぐり帳「本」：いま読んでいる本・読み終えた本（その下に出会った本のカード） ----------
export function renderReading() {
  const el = $('#reading'); if (!el) return;
  const now = J.reading().slice().sort((x, y) => (y.t || 0) - (x.t || 0)), done = J.finished(), tr = J.activeTrip();
  const meta = (b) => [b.sn ? `${b.sn}で出会った` : '', `${fmtDate(b.d)}から`, J.readTimes(b.id) ? `移動読書${J.readTimes(b.id)}回` : '', tr && tr.book === b.id ? '移動読書中' : ''].filter(Boolean).join('・');
  el.innerHTML = `<h3>いま読んでいる本</h3>${now.length ? `<div class="list rlist">${now.map((b) => `<div class="item rbook">${cover(b)}<div class="main"><div class="name">${esc(b.title)}</div><div class="sub">${esc(meta(b))}</div><div class="ract"><button class="btn" data-done="${esc(b.id)}">読み終わった</button><button class="btn ghost" data-drop="${esc(b.id)}">外す</button></div></div></div>`).join('')}</div>` : '<p class="muted small">まだありません。登録すると、移動読書で選べます。</p>'}
    <div class="actions"><button class="btn" id="rd-add">${icon('barcode')}いま読んでいる本を登録</button></div><div id="rd-out"></div>
    ${done.length ? `<details class="chap rdone"><summary><b>読み終えた本</b><span class="muted small">${done.length}冊</span></summary><div class="list rlist">${done.map((b) => `<div class="item rbook">${cover(b)}<div class="main"><div class="name">${esc(b.title)}</div><div class="sub">${esc([`${fmtDate(b.done)}に読み終えた`, b.sn ? `${b.sn}で出会った` : '', J.readTimes(b.id) ? `移動読書${J.readTimes(b.id)}回` : ''].filter(Boolean).join('・'))}</div><div class="ract"><button class="btn ghost" data-undone="${esc(b.id)}">読みかけに戻す</button></div></div></div>`).join('')}</div></details>` : ''}
    <h3>出会った本（カード）</h3>`;
  $('#rd-add').onclick = () => startReadingAdd(null);
  $$('#reading [data-done]').forEach((x) => x.addEventListener('click', () => { const b = J.finishReading(x.dataset.done); if (b) toast(`『${b.title}』を読み終えた本に入れました（今日の物語にも書きました）`, 'ok'); }));
  $$('#reading [data-undone]').forEach((x) => x.addEventListener('click', () => J.unfinishReading(x.dataset.undone)));
  $$('#reading [data-drop]').forEach((x) => x.addEventListener('click', () => { const b = J.reading().find((y) => y.id === x.dataset.drop); confirmBox($('#rd-out'), `『${b ? b.title : ''}』を、いま読んでいる本から外しますか？（カードと物語は残ります）`, () => J.dropReading(x.dataset.drop), '外す'); }));
}

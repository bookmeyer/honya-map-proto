// 画面の共通の部品：トースト・モーダル・確かめの箱・タブの切りかえ・見出し帯・地図の下のチケット・バーコードの読み取り・書名でさがす・道順のボタン
import { pagesForVol } from './config.js?v=0.21.2';
import { gmapDir, $$, icon, $, esc, emit } from './util.js?v=0.21.2';
import { S } from './state.js?v=0.21.2';
import { haptic } from './audio.js?v=0.21.2';
import { lookupIsbn, lookupBook, searchBooks, coversOf } from './data.js?v=0.21.2';
import * as MAP from './map.js?v=0.21.2';
import * as G from './game.js?v=0.21.2';
import * as E from './events.js?v=0.21.2';

export const dirLink = (st, label = '道順') => `<a class="btn" href="${gmapDir(st)}" target="_blank" rel="noopener" data-stop>${label}</a>`;
export const stopLinks = (root) => $$('[data-stop]', root).forEach((a) => a.addEventListener('click', (e) => e.stopPropagation()));
export const emptyBox = (ic, text) => `<div class="empty">${icon(ic)}<div>${text}</div></div>`;
export let currentView = 'map';
export let currentSub = 'stamps';
let scanStopper = null;
// ---------- 小物 ----------
export function toast(msg, kind = '') { const box = $('#toasts'); const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; box.appendChild(t); while (box.children.length > 1) box.firstChild.remove(); /* お知らせは同時に1つだけ（v0.13） */ setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2600); }
export function openModal(html) { $('#modal-box').innerHTML = html; $('#modal').hidden = false; $('#modal-box').scrollTop = 0; }
export function closeModal() { stopScan(); $('#modal').hidden = true; $('#modal-box').innerHTML = ''; }
export function confirmBox(container, msg, onYes, yesLabel = '消す') { container.innerHTML = `<div class="status-card sumi">${esc(msg)}</div><div class="actions"><button class="btn danger" id="cf-yes">${esc(yesLabel)}</button><button class="btn ghost" id="cf-no">やめる</button></div>`; $('#cf-no', container).onclick = () => { container.innerHTML = ''; }; $('#cf-yes', container).onclick = () => { container.innerHTML = ''; onYes(); }; }
export function switchView(v) {
  currentView = v; if (v !== 'map') closeSheet();
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'map') MAP.resize();
  emit('view', v);
}
export function setSub(s) { currentSub = s; emit('view', currentView); }
export function refreshHud() {
  const vol = G.volume(), pg = G.storyPages(), cur = pagesForVol(vol), next = pagesForVol(vol + 1);
  $('#lv-label').textContent = `第${vol}巻`; $('#xp-fill').style.width = `${Math.round(((pg - cur) / (next - cur)) * 100)}%`; $('#lv-btn').title = `第${vol}巻 ${pg}ページ（あと${next - pg}ページで第${vol + 1}巻）`;
  $('#brand-title').textContent = S.settings.handle || G.currentTitle() || '本屋あるき見習い';
  renderMissionChip(); renderEventChip();
}
// 開催中のイベントのチケット（地図の下）。押すとラリーの画面のイベントへ
export function renderEventChip() {
  const el = $('#event-chip'); if (!el) return;
  const e = E.liveEvents()[0]; if (!e) { el.hidden = true; return; }
  const n = E.evCount(e.id); el.hidden = false; el.style.setProperty('--evc', e.frame.color);
  el.innerHTML = `<span class="stub">開催中</span><span class="body"><span class="l">あと${E.daysLeft(e)}日${E.liveEvents().length > 1 ? `・ほか${E.liveEvents().length - 1}つ` : ''}</span><span class="m">${esc(e.name)}${e.goal ? `　${Math.min(n, e.goal.count)}/${e.goal.count}軒` : ''}</span></span>`;
  el.onclick = () => { switchView('mission'); setTimeout(() => { const c = $('#event-list'); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60); };
}
// きょうのお題のチケット（地図の下）。押すとお題の画面へ
export function renderMissionChip() {
  const el = $('#mission-chip'); if (!el) return;
  let ms; try { ms = G.dailyMissions(); } catch (e) { el.hidden = true; return; }
  if (!ms || !ms.length) { el.hidden = true; return; }
  const done = ms.filter((m) => m.cur >= m.goal).length; const nxt = ms.find((m) => m.cur < m.goal);
  el.hidden = false; el.classList.toggle('done', !nxt);
  el.innerHTML = `<span class="stub">${done}/${ms.length}</span><span class="body"><span class="l">きょうのお題</span><span class="m">${nxt ? `${esc(nxt.name)}・あと ${Math.max(0, nxt.goal - nxt.cur)}` : 'ぜんぶ達成！'}</span></span>`;
  el.onclick = () => switchView('mission');
}
export function closeSheet() { const s = $('#sheet'); s.hidden = true; s.dataset.id = ''; }
// バーコードの読み取り・書名でさがすは、カードといま読んでいる本の登録で使う（見つかった本を done に渡す。v0.14）
export function stopScan() { if (scanStopper) { try { scanStopper(); } catch (e) {} scanStopper = null; } }
// 書名でさがす（v0.16.2。ISBN を打たせない）：書名・著者名で国立国会図書館サーチをさがし、選んだ本を done に渡す。ISBN を入れても引ける。見つからないときは、書いた名前のまま使える
export function searchBook(done) {
  stopScan(); // カメラで読んでいる途中なら止める（v0.16.0）
  $('#cd-area').innerHTML = `<div class="field"><label for="bk-q">書名や著者名</label><input type="search" id="bk-q" maxlength="80" enterkeyhint="search" autocomplete="off" placeholder="例：成瀬は天下を取りにいく"></div><div class="actions"><button class="btn primary wide" id="bk-go">${icon('search')}さがす</button></div><div id="bk-out"></div>`;
  const inp = $('#bk-q'); inp.focus(); let seq = 0;
  const chosen = (b) => { if (!$('#modal').hidden) done(b); };
  const go = async () => {
    const t = inp.value.trim(); const out = $('#bk-out'); if (!t) { inp.focus(); return; }
    const my = ++seq; inp.blur(); /* キーボードを閉じて結果を見やすく */ out.innerHTML = '<div class="muted small bk-wait">国立国会図書館サーチでさがしています…</div>';
    const tail = `<button class="linkish bk-use" id="bk-use">見つからないときは、「${esc(t)}」のまま使う</button>`;
    const src = '<div class="muted small bk-src">出典：<a href="https://ndlsearch.ndl.go.jp/" target="_blank" rel="noopener">国立国会図書館サーチ</a>（国立国会図書館の書誌データ・CC BY 4.0）</div>';
    const bind = (items) => {
      $('#bk-use').onclick = () => chosen({ isbn: '', title: t, author: '', publisher: '', cover: '' });
      $$('#bk-out [data-k]').forEach((el) => el.addEventListener('click', async () => {
        const b = items[+el.dataset.k]; const ob = b.isbn ? await lookupIsbn(b.isbn) : null; // 書名・著者は一覧で見たとおりに。表紙だけ openBD から
        chosen({ isbn: b.isbn, title: b.title, author: b.author || (ob && ob.author) || '', publisher: b.publisher || (ob && ob.publisher) || '', pubdate: b.year ? String(b.year) : '', cover: (ob && ob.cover) || '' });
      }));
      const isb = items.map((b) => b.isbn).filter(Boolean);
      if (isb.length) coversOf(isb).then((m) => $$('#bk-out .rcover[data-isbn]').forEach((c) => { const u = m.get(c.dataset.isbn); if (u && c.isConnected && !c.querySelector('img')) c.innerHTML = `<img src="${esc(u)}" alt="" referrerpolicy="no-referrer" loading="lazy">`; }));
    };
    const render = (items, more) => {
      if (my !== seq || !out.isConnected) return;
      out.innerHTML = `<p class="hint">この本ですか？（押すと選べます）</p><div class="list rlist bk-list">${items.map((b, k) => `<div class="item rbook" data-k="${k}"><div class="rcover" data-isbn="${esc(b.isbn)}">${icon('book')}</div><div class="main"><div class="name">${esc(b.title)}</div><div class="sub">${esc([b.author, b.publisher, b.year ? b.year + '年' : ''].filter(Boolean).join('・'))}</div></div></div>`).join('')}</div>`
        + (more ? '<div class="muted small bk-wait">まだ さがしています…</div>' : '') + tail + src;
      bind(items);
    };
    const r = await searchBooks(t, render);
    if (my !== seq || !out.isConnected) return;
    if (r.isbn) { if (r.items.length) { chosen(r.items[0]); return; } out.innerHTML = '<div class="muted small">この ISBN の本は見つかりませんでした。「名前を自分で書く」で続けられます。</div>'; return; }
    if (r.items.length) { render(r.items, false); return; }
    out.innerHTML = (r.ok ? '<div class="muted small">見つかりませんでした。書名を短くするか、著者名でさがしてみてください。</div>' : '<div class="muted small">さがせませんでした（国立国会図書館サーチが混んでいるか、電波が弱いようです）。少しあとで、もう一度さがしてください。</div>') + tail + (r.ok ? src : '');
    bind([]);
  };
  $('#bk-go').onclick = go; inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
}
export async function scanIsbn(done) {
  stopScan(); // 2回押したときに、前のカメラが残らないように（v0.16.0）
  const area = $('#cd-area'); area.innerHTML = `<video id="scanner" playsinline muted autoplay></video><div id="cd-msg" class="muted small">バーコード（978か979で始まる方）をカメラに向けてください</div><div class="actions"><button class="btn ghost wide" id="cd-stop">カメラを止める</button></div>`;
  const video = $('#scanner'); const msg = $('#cd-msg'); let stopped = false, stream = null, reader = null;
  const stop = () => { stopped = true; try { if (reader && reader.reset) reader.reset(); } catch (e) {} if (stream) stream.getTracks().forEach((t) => t.stop()); };
  scanStopper = stop; $('#cd-stop').onclick = () => { stop(); area.innerHTML = ''; };
  const onCode = async (code) => { code = String(code).replace(/[^0-9]/g, ''); if (!/^97[89]\d{10}$/.test(code)) return false; stop(); haptic(40); msg.textContent = `読み取り：${code}。本の情報をさがしています…`; const b = await lookupBook(code); if ($('#modal').hidden) return true; done(b || { isbn: code, title: '', author: '', publisher: '', cover: '' }); return true; };
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); video.srcObject = stream; await video.play(); }
  catch (e) { msg.textContent = 'カメラが使えませんでした（https でないか、許可されていません）。「書名でさがす」で続けられます。'; return; }
  if ('BarcodeDetector' in window) { try { const det = new window.BarcodeDetector({ formats: ['ean_13'] }); const loop = async () => { if (stopped) return; try { const codes = await det.detect(video); for (const c of codes) { if (await onCode(c.rawValue)) return; } } catch (e) {} requestAnimationFrame(loop); }; loop(); return; } catch (e) {} }
  try { if (!window.ZXing) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'; s.integrity = 'sha384-BzBxP10ZE72aitqj5UMmUsbKFliP/DZqA8Wq+BNNhlIJDGoEd1tpkMYXOg9+n6sB'; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const hints = new Map(); hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [window.ZXing.BarcodeFormat.EAN_13]); reader = new window.ZXing.BrowserMultiFormatReader(hints, 300); reader.decodeFromStream(stream, video, (result) => { if (result && !stopped) onCode(result.getText()); });
  } catch (e) { msg.textContent = '読み取りの部品を読み込めませんでした。「書名でさがす」で続けられます。'; }
}

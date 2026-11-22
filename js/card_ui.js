// 本のカード：本と出会った（バーコード・書名でさがす・名前）→ カードの画面
import { PG } from './config.js?v=0.35.5';
import { esc, icon, $, fmtDate, todayISO, emit } from './util.js?v=0.35.5';
import { S } from './state.js?v=0.35.5';
import { sfx, haptic } from './audio.js?v=0.35.5';
import { POS } from './position.js?v=0.35.5';
import { placeWord, isLib, BYID } from './data.js?v=0.35.5';
import * as G from './game.js?v=0.35.5';
import * as E from './events.js?v=0.35.5';
import { cardImage, shareBlob } from './share.js?v=0.35.5';
import * as R from './reading.js?v=0.35.5';
import { openModal, closeModal, searchBook, scanIsbn, stopScan, toast, refreshHud, setSub, switchView, confirmBox } from './ui.js?v=0.35.5';
import { applyMapStates, openSheet } from './map_ui.js?v=0.35.5';

// ---------- カード ----------
// カードをシェアする（v0.23.0：カードができた画面からも。テストプレイの声「この書店でこの本を買いました、を共有したい」・ぶっくまさん「シェアしやすい形が良い」）
// イベントの店で出会った本は、イベントのハッシュタグも入れる（スタンプのシェアと同じ）。アプリのURLは、まだ入れない（決まった方だけに見せている時期）
async function shareCard(c, out) {
  try {
    const st = BYID.get(c.s), fr = E.storeFrame(c.s); // スタンプを押したイベント＋いま開催中で、この店が対象のイベント
    const evTags = st ? E.liveEvents().filter((e) => E.isTarget(e, st)).map((e) => e.hashtag || '') : [];
    const tags = [...new Set(['#本めぐり', ...[(fr && fr.hashtag) || '', ...evTags].join(' ').split(/\s+/).filter(Boolean)])].join(' ');
    const blob = await cardImage(c, { tags }); const r = await shareBlob(blob, `card-${c.d}.png`, c.title, `${c.sn}で『${c.title}』と出会った ${tags}`);
    if (r !== 'cancel') { G.noteShare('card', c.s, r); toast(r === 'saved' ? '画像を保存しました' : 'シェアしました', 'ok'); }
  } catch (e) { if (out) out.innerHTML = '<p class="muted small">画像にできませんでした（表紙の画像が外部のため、ブラウザが書き出しを止めることがあります）。</p>'; }
}
export function startCard(st) {
  openModal(`<h2>この${placeWord(st)}で本と出会った</h2><p class="hint">${esc(st.n)}${isLib(st) ? '　借りた本も、裏のバーコードで読めます' : ''}</p>
    <div class="note">カードは +${PG.card}ページ。今日この店でスタンプを押していれば「店で出会った」+${PG.cardInStore}ページ。</div>
    <div class="actions"><button class="btn primary wide" id="cd-scan">${icon('camera')}本の裏のバーコードを読む</button><button class="btn" id="cd-search">${icon('search')}書名でさがす</button><button class="btn" id="cd-free">名前を自分で書く</button><button class="btn ghost wide" id="cd-cancel">やめる</button></div><div id="cd-area"></div>`);
  $('#cd-cancel').onclick = closeModal; $('#cd-search').onclick = () => searchBook((b) => cardForm(st, b)); $('#cd-free').onclick = () => cardForm(st, null); $('#cd-scan').onclick = () => scanIsbn((b) => cardForm(st, b));
}
function cardForm(st, b) {
  stopScan();
  const has = !!b && !!b.title; const { inStore, total } = G.cardBonus(st);
  openModal(`<h2>カードを作る</h2>
    <div class="card-full"><div class="cover">${b && b.cover ? `<img src="${esc(b.cover)}" alt="" referrerpolicy="no-referrer">` : '<div class="notitle">表紙なし</div>'}</div>
      <div style="flex:1;min-width:0">${has ? `<div><b>${esc(b.title)}</b></div><div class="muted small">${esc(b.author)}${b.publisher ? '／' + esc(b.publisher) : ''}</div>` : `<div class="field"><label for="cd-title">本の名前</label><input type="text" id="cd-title" placeholder="書名（わかれば著者も）"></div>`}
      <div class="muted small" style="margin-top:6px">${esc(st.n)}　${fmtDate(todayISO())}</div><div class="muted small">${inStore ? '🏪 店で出会った +' + PG.cardInStore + 'ページ' : ''}</div></div></div>
    <div class="field"><label for="cd-why">なぜ手に取ったか（任意・100字まで）</label><textarea id="cd-why" maxlength="100" placeholder="例：表紙の青に目がとまった。店員さんの手書きPOPに「泣いた」とあった"></textarea></div>
    <input type="checkbox" id="cd-pub" hidden>
    <div class="note">表紙はopenBDから毎回表示するだけで、保存しません。記録はこの端末の中だけに残ります。</div>
    <div class="actions"><button class="btn primary" id="cd-save">カードにする（+${total}ページ）</button><button class="btn ghost" id="cd-cancel2">やめる</button></div>`);
  $('#cd-cancel2').onclick = closeModal;
  $('#cd-save').onclick = () => { const title = has ? b.title : ($('#cd-title') ? $('#cd-title').value.trim() : ''); if (!title) { toast('本の名前を入れてください', 'warn'); return; }
    const book = Object.assign({ isbn: '', author: '', publisher: '', cover: '' }, b || {}, { title }); const res = G.makeCard(st, book, $('#cd-why').value.trim(), $('#cd-pub').checked);
    closeModal(); applyMapStates(); refreshHud(); sfx.reveal(); haptic([30, 40, 30]); res.rewards.forEach((x) => toast(x, 'ok')); cardDone(st, S.cards[S.cards.length - 1], res, inStore); };
}
// カードができたあと（v0.14）：この本を、ここから読む／いま読んでいる本に入れる／めぐり帳で見る
function cardDone(st, c, res, inStore) {
  const go = inStore && !POS.fake && !st.demo && !R.activeTrip(); const inR = R.inReading(c);
  openModal(`<h2>カードができました</h2><div class="card-full"><div class="cover">${c.cover ? `<img src="${esc(c.cover)}" alt="" referrerpolicy="no-referrer">` : '<div class="notitle">表紙なし</div>'}</div><div style="flex:1;min-width:0"><div><b>${esc(c.title)}</b></div><div class="muted small">${esc(c.sn)}　${fmtDate(c.d)}</div><div class="gain-s">+${res.total}ページ${res.lv.after > res.lv.before ? `　📖 第${res.lv.after}巻に入った！` : ''}</div></div></div>
    <div class="actions">${go ? `<button class="btn primary wide" id="cs-go">📖 この本を、ここから読む</button>` : ''}<button class="btn ${go ? '' : 'primary '}wide" id="cs-read"${inR ? ' disabled' : ''}>${inR ? 'いま読んでいる本に入っています' : 'いま読んでいる本に入れる'}</button><button class="btn wide" id="cs-share">${icon('share')}シェアする</button><button class="btn wide" id="cs-see">めぐり帳で見る</button><button class="btn ghost wide" id="cs-close">閉じる</button></div><div id="cs-out"></div>`);
  $('#cs-close').onclick = closeModal; $('#cs-share').onclick = () => shareCard(c, $('#cs-out'));
  $('#cs-see').onclick = () => { closeModal(); setSub('cards'); switchView('zukan'); };
  if (!inR) $('#cs-read').onclick = () => { R.readingFromCard(c); $('#cs-read').disabled = true; $('#cs-read').textContent = 'いま読んでいる本に入れました'; };
  if (go) $('#cs-go').onclick = () => { const b = R.readingFromCard(c); closeModal(); emit('read-start', { book: b.id }); };
}
export function openCard(id) {
  const c = S.cards.find((x) => x.id === id); if (!c) return;
  openModal(`<h2>カード</h2><div class="card-full"><div class="cover">${c.cover ? `<img src="${esc(c.cover)}" alt="" referrerpolicy="no-referrer">` : '<div class="notitle">表紙なし</div>'}</div>
      <div style="flex:1;min-width:0"><div><b>${esc(c.title)}</b></div><div class="muted small">${esc(c.author)}${c.publisher ? '／' + esc(c.publisher) : ''}</div><div style="margin-top:8px">${esc(c.sn)}</div><div class="muted small">${fmtDate(c.d)}・自分だけ</div>${c.why ? `<div class="why">${esc(c.why)}</div>` : ''}</div></div>
    <div class="actions"><button class="btn primary" id="cv-img">${icon('share')}画像にする</button><button class="btn" id="cv-store">店を地図で見る</button><button class="btn danger" id="cv-del">${icon('trash')}消す</button><button class="btn ghost" id="cv-close">閉じる</button></div><div id="cv-out"></div>`);
  $('#cv-close').onclick = closeModal; $('#cv-store').onclick = () => { closeModal(); openSheet(c.s); };
  $('#cv-del').onclick = () => confirmBox($('#cv-out'), 'このカードを消しますか？ 戻せません。', () => { G.deleteCard(id); closeModal(); toast('消しました'); });
  $('#cv-img').onclick = () => shareCard(c, $('#cv-out'));
}

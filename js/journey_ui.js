// 旅の記録の画面：行きたい店のお知らせ・この辺りの行きたい店・今日の物語・月のふり返り・投稿の記録・Googleマップの★の読み込み
import { S, save } from './state.js?v=0.7.0';
import { STORES, BYID, addCustom } from './data.js?v=0.7.0';
import * as J from './journey.js?v=0.7.0';
import * as G from './game.js?v=0.7.0';
import * as MAP from './map.js?v=0.7.0';
import { POS, hasPos } from './position.js?v=0.7.0';
import { sfx, haptic } from './audio.js?v=0.7.0';
import { storyImage, shareBlob } from './share.js?v=0.7.0';
import { toast, openModal, closeModal, openSheet, applyMapStates, updateNear, refreshHud } from './ui.js?v=0.7.0';
import { $, $$, esc, fmtDist, todayISO, icon, arrowOf, bearing, dist, gmapDir } from './util.js?v=0.7.0';

const dirLink = (st, label = '道順') => `<a class="btn" href="${gmapDir(st)}" target="_blank" rel="noopener" data-stop>${label}</a>`;
const stopLinks = (root) => $$('[data-stop]', root).forEach((a) => a.addEventListener('click', (e) => e.stopPropagation()));

// ---------- 行きたい店のお知らせ（地図の下に出る帯） ----------
let waTimer = null;
export function showWantAlerts(list) {
  if (!list || !list.length) return;
  const { st, d, stage } = list[0]; const box = $('#want-alert');
  const more = list.length > 1 ? `（ほか${list.length - 1}店）` : '';
  const arrow = hasPos() ? ' ' + arrowOf(bearing(POS.lat, POS.lon, st.la, st.lo)) : '';
  box.innerHTML = `<div class="wa-main">${icon('star')}<div><b>${stage === 2 ? 'もうすぐ' : fmtDist(d) + '先に'}、行きたい店があります${more}</b><div class="small">${esc(st.n)}　${fmtDist(d)}${arrow}</div></div><button class="icon-btn" id="wa-x" aria-label="閉じる">${icon('close')}</button></div><div class="wa-act"><button class="btn primary" id="wa-open">${icon('map')}地図で見る</button>${dirLink(st, 'Googleマップで道順')}</div>`;
  box.hidden = false; sfx.reveal(); haptic([40, 60, 40]);
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
  chip.innerHTML = `${icon('star')}この辺りに行きたい店 ${list.length}店`; chip.hidden = false;
  chip.onclick = () => {
    const c = m.getCenter(); const rows = list.map((st) => ({ st, d: dist(c.lat, c.lng, st.la, st.lo) })).sort((a, b) => a.d - b.d);
    openModal(`<h2>この辺りの行きたい店</h2><p class="hint">地図に映っている範囲です。出かける前に、行き先の地図を開くだけで分かります。</p><div class="list">${rows.map(({ st, d }) => `<div class="item" data-id="${esc(st.i)}"><div class="main"><div class="name">${esc(st.n)}</div><div class="sub">地図の真ん中から ${fmtDist(d)}</div></div>${dirLink(st)}</div>`).join('')}</div><div class="actions"><button class="btn ghost wide" id="ar-close">閉じる</button></div>`);
    $('#ar-close').onclick = closeModal; stopLinks($('#modal-box'));
    $$('#modal-box .item[data-id]').forEach((el) => el.addEventListener('click', () => { closeModal(); openSheet(el.dataset.id); }));
  };
}

// ---------- レーダー：行きたい店（近い順） ----------
export function renderRadarWants() {
  const el = $('#radar-wants'); if (!el) return;
  let base; if (hasPos()) base = { lat: POS.lat, lon: POS.lon, lbl: 'ここから' }; else { const c = MAP.center(); base = { lat: c.lat, lon: c.lng, lbl: '地図の真ん中から' }; }
  const list = J.wantsSorted(base.lat, base.lon);
  el.innerHTML = `<h3>行きたい店 ${list.length}店（近い順）</h3>` + (list.length ? `<div class="list">${list.slice(0, 40).map(({ st, d }) => `<div class="item" data-id="${esc(st.i)}"><div class="main"><div class="name">${esc(st.n)}</div><div class="sub">${base.lbl} ${fmtDist(d)}${hasPos() && d < 5000 ? ' ' + arrowOf(bearing(base.lat, base.lon, st.la, st.lo)) : ''}</div></div>${dirLink(st)}</div>`).join('')}</div>` : `<div class="empty">${icon('star')}<div>店のページの「行きたい」を押すか、設定から Googleマップの★を読み込むと、ここに近い順で並びます。</div></div>`);
  stopLinks(el); $$('#radar-wants .item[data-id]').forEach((it) => it.addEventListener('click', () => openSheet(it.dataset.id)));
}

// ---------- 今日の物語 ----------
function chapterHTML(ch) {
  const body = ch.empty ? `<p class="muted">${esc(ch.blank)}</p>` : ch.lines.map((l) => `<p>${esc(l.s)}${l.url ? ` <a href="${esc(l.url)}" target="_blank" rel="noopener">投稿を見る</a>` : ''}</p>`).join('');
  const stats = [`${icon('book')}${ch.pages}ページ`, `${ch.km}km`, `歩数の目安 ${J.stepsOf(ch.m).toLocaleString()}歩`, ch.nStores ? `本屋 ${ch.nStores}店` : '', ch.nCards ? `出会った本 ${ch.nCards}冊` : '', ch.v >= 1000 ? `乗り物 ${J.kmOf(ch.v)}km` : ''].filter(Boolean);
  return `<div class="story"><div class="ch-sub">本屋の地図　その日の物語</div><div class="ch-title">${esc(ch.title)}</div><div class="story-body">${body}</div><div class="story-stats">${stats.map((s) => `<span>${s}</span>`).join('')}</div></div>`;
}
async function shareChapter(date) { try { const ch = J.chapter(date); const blob = await storyImage(ch, S.settings.avatar); const r = await shareBlob(blob, `story-${date}.png`, ch.title, `${ch.title}　${ch.pages}ページ歩いて、本屋${ch.nStores}店 #本屋の地図`); if (r !== 'cancel') { G.noteShare('story', '', r); toast(r === 'saved' ? '画像を保存しました' : 'シェアしました', 'ok'); renderStory(); } } catch (e) { toast('画像にできませんでした', 'warn'); } }
export function renderStory() {
  const box = $('#story-today'), list = $('#chapters'); if (!box) return;
  const ch = J.chapter(todayISO());
  box.innerHTML = chapterHTML(ch) + `<div class="actions"><button class="btn primary" id="sy-share">${icon('share')}今日の物語をシェア</button><button class="btn" id="sy-post">${icon('pen')}Xの投稿を記録</button></div><div class="note">歩いた距離は、アプリを開いて現在地を追っているあいだだけ数えます（100mで1ページ）。歩数は距離からの目安です。</div>`;
  $('#sy-share').onclick = () => shareChapter(todayISO()); $('#sy-post').onclick = postModal;
  const past = J.chapters(40).filter((c) => c.date !== todayISO());
  list.innerHTML = past.length ? past.map((c) => `<details class="chap"><summary><b>${esc(c.title)}</b><span class="muted small">${c.pages}ページ${c.nStores ? `・本屋${c.nStores}店` : ''}${c.nCards ? `・本${c.nCards}冊` : ''}</span></summary>${chapterHTML(c)}<div class="actions"><button class="btn" data-share="${c.date}">${icon('share')}この日の物語をシェア</button></div></details>`).join('') : '<div class="muted small">まだ前の章はありません。歩いた日・本屋に行った日ごとに、1章ずつ増えていきます。</div>';
  $$('#chapters [data-share]').forEach((b) => b.addEventListener('click', () => shareChapter(b.dataset.share)));
}
function postModal() {
  const today = todayISO(); const ids = [...new Set(S.visits.filter((v) => v.d === today).map((v) => v.s))]; const opts = ids.map((id) => BYID.get(id)).filter(Boolean);
  const mine = (S.posts || []).filter((p) => p.d === today);
  openModal(`<h2>Xの投稿を記録</h2><p class="hint">投稿のURLを貼ると、今日の物語に「投稿を見る」が付きます。この端末の中だけに残ります。</p>
    <div class="field"><label for="po-url">投稿のURL</label><input type="text" id="po-url" inputmode="url" placeholder="https://x.com/…/status/…"></div>
    <div class="field"><label for="po-text">ひとこと（任意・60字まで）</label><input type="text" id="po-text" maxlength="60" placeholder="例：常連の店の新刊台を紹介した"></div>
    ${opts.length ? `<div class="field"><label for="po-store">どの店の話？（任意）</label><select id="po-store"><option value="">えらばない</option>${opts.map((s) => `<option value="${esc(s.i)}">${esc(s.n)}</option>`).join('')}</select></div>` : ''}
    <div class="actions"><button class="btn primary" id="po-save">記録する</button><button class="btn ghost" id="po-cancel">やめる</button></div>
    ${mine.length ? `<h3>今日の記録</h3><div class="list">${mine.map((p) => `<div class="item"><div class="main"><div class="name">${esc(p.text || 'Xの投稿')}</div><div class="sub">${esc(p.url)}</div></div><button class="btn ghost" data-del="${esc(p.id)}">${icon('trash')}</button></div>`).join('')}</div>` : ''}`);
  $('#po-cancel').onclick = closeModal;
  $$('#modal-box [data-del]').forEach((b) => b.addEventListener('click', () => { J.deletePost(b.dataset.del); postModal(); renderStory(); }));
  $('#po-save').onclick = () => {
    const url = $('#po-url').value.trim(), text = $('#po-text').value.trim();
    if (!url && !text) { toast('URLか、ひとことを入れてください', 'warn'); return; }
    if (url && !/^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\//i.test(url)) { toast('XのURL（https://x.com/…）を貼ってください', 'warn'); return; }
    J.addPost({ url, text, sid: $('#po-store') ? $('#po-store').value : '' }); closeModal(); toast('記録しました。今日の物語に入ります', 'ok'); renderStory();
  };
}

// ---------- 月のふり返り ----------
export function renderMonth() {
  const el = $('#month'); if (!el) return;
  const months = J.monthsBack(6); const stats = months.map((ym) => J.periodStats(ym)); const cur = stats[5], prev = stats[4];
  const [y, m] = months[5].split('-').map(Number); const yr = J.periodStats(String(y));
  const diff = (a, b) => (a === b ? '先月と同じ' : a > b ? `先月より +${a - b}` : `先月より −${b - a}`);
  const tile = (l, n, s) => `<div class="mtile"><div class="l">${l}</div><div class="n">${n}</div><div class="s">${s || '&nbsp;'}</div></div>`;
  const max = Math.max(1, ...stats.map((s) => s.visitDays));
  el.innerHTML = `<h3>${y}年${m}月のふり返り</h3>
    <div class="mtiles">${tile('本屋に行った日', cur.visitDays + '日', diff(cur.visitDays, prev.visitDays))}${tile('本屋に行った回数', cur.visits + '回', diff(cur.visits, prev.visits))}${tile('行った店', cur.stores + '店', `新しいスタンプ ${cur.stampsNew}`)}${tile('歩いたページ', cur.pages + 'ページ', `${J.kmOf(cur.m)}km・歩数の目安 ${J.stepsOf(cur.m).toLocaleString()}歩`)}</div>
    <h3>月ごとの「本屋に行った日」</h3>
    <div class="mbars">${stats.map((s) => `<div class="mb"><div class="bw"><div class="bar" style="height:${Math.round((s.visitDays / max) * 100)}%"><span>${s.visitDays}</span></div></div><div class="lbl">${+s.prefix.slice(5)}月</div></div>`).join('')}</div>
    <h3>今月よく行った店</h3>
    ${cur.top.length ? `<div class="list">${cur.top.map((t, i) => `<div class="item" data-id="${esc(t.st.i)}"><div class="main"><div class="name">${i + 1}. ${esc(t.st.n)}</div><div class="sub">今月 ${t.days}日${t.reg.rank ? `・常連度「${esc(t.reg.name)}」（通算 ${t.reg.days}日）` : ''}</div></div></div>`).join('')}</div>` : '<div class="muted small">今月はまだ本屋の記録がありません。</div>'}
    <div class="note">${y}年は、ここまで ${yr.visitDays}日 本屋に行っています（${yr.visits}回・${yr.stores}店・出会った本 ${yr.cards}冊・歩いて ${yr.pages}ページ）。</div>`;
  $$('#month .item[data-id]').forEach((it) => it.addEventListener('click', () => openSheet(it.dataset.id)));
}

// ---------- Googleマップの★を読み込む ----------
export function googleHelp() {
  openModal(`<h2>Googleマップの★を読み込む</h2>
    <p class="hint">Googleマップで★（スター）や保存リストに入れた本屋を、このアプリの「行きたい」にまとめて入れます。</p>
    <ol class="steps"><li><a href="https://takeout.google.com/" target="_blank" rel="noopener">Google データエクスポート（Takeout）</a>を開きます</li><li>「選択をすべて解除」を押し、「マップ（マイプレイス）」と「保存済み」にだけチェックを入れます</li><li>いちばん下の「次のステップ」→「エクスポートを作成」。準備ができるとメールが届きます</li><li>届いたzipを開くと、★は「Saved Places.json」（マップ（マイプレイス）の中）か、「保存済み」フォルダの「スター付き」のCSVに入っています。ほかの保存リストもCSVで入っています</li><li>設定の「Googleマップの★」→「読み込む」で、そのファイルを選びます（いくつでも選べます）</li></ol>
    <div class="note">Googleマップと自動でつなぐ口はGoogleが用意していないため、ファイルで受け渡します。ファイルはこの端末の中で読むだけで、どこにも送りません。ファイル名は時期によって少し違うことがあります。</div>
    <div class="actions"><button class="btn ghost wide" id="gh-close">閉じる</button></div>`);
  $('#gh-close').onclick = closeModal;
}
export async function importGoogleFiles(files) {
  let places = [], bad = 0;
  for (const f of files) { try { places = places.concat(J.parseGoogle(await f.text())); } catch (e) { bad++; } }
  if (!places.length) { toast(bad ? '読めませんでした（Googleデータエクスポートの .json か .csv を選んでください）' : '場所が見つかりませんでした', 'warn'); return; }
  const r = J.matchGoogle(places); const addable = r.misses.filter((p) => p.bookish && p.lat != null); const others = r.misses.filter((p) => !(p.bookish && p.lat != null));
  openModal(`<h2>Googleマップの保存リスト</h2><p class="hint">${places.length}件のうち、本屋の地図にある店 ${r.hits.length}件${addable.length ? `・地図にない本屋らしい店 ${addable.length}件` : ''}</p>
    ${r.hits.length ? `<div class="list gi">${r.hits.map((h, i) => `<label class="item"><input type="checkbox" data-h="${i}" ${h.want ? 'checked disabled' : 'checked'}><div class="main"><div class="name">${esc(h.st.n)}</div><div class="sub">Google：${esc(h.p.name || '（名前なし）')}${h.d != null ? '・' + fmtDist(h.d) : ''}${h.want ? '・すでに行きたい' : ''}</div></div></label>`).join('')}</div>` : ''}
    ${addable.length ? `<h3>地図にない本屋らしい店</h3><p class="hint">チェックした店を自分の地図に足して「行きたい」にします（この端末だけ）。</p><div class="list gi">${addable.map((p, i) => `<label class="item"><input type="checkbox" data-a="${i}" checked><div class="main"><div class="name">${esc(p.name)}</div><div class="sub">${esc(p.address || '')}</div></div></label>`).join('')}</div>` : ''}
    ${others.length ? `<details class="chap"><summary><span>本屋の地図に見当たらない ${others.length}件</span></summary><div class="muted small">${others.slice(0, 120).map((p) => esc(p.name || '（名前なし）')).join('、')}${others.length > 120 ? '…' : ''}</div></details>` : ''}
    <div class="actions"><button class="btn primary wide" id="gi-ok" ${r.hits.length || addable.length ? '' : 'disabled'}>${icon('star')}行きたいに入れる</button><button class="btn ghost wide" id="gi-cancel">やめる</button></div>`);
  $('#gi-cancel').onclick = closeModal;
  $('#gi-ok').onclick = () => {
    let n = 0;
    $$('#modal-box [data-h]').forEach((cb) => { const h = r.hits[+cb.dataset.h]; if (cb.checked && !cb.disabled && !S.wants.includes(h.st.i)) { S.wants.push(h.st.i); n++; } });
    let k = 0; $$('#modal-box [data-a]').forEach((cb) => { if (!cb.checked) return; const p = addable[+cb.dataset.a]; const st = { i: 'u' + Date.now().toString(36) + (k++), n: p.name, la: +p.lat.toFixed(5), lo: +p.lon.toFixed(5), a: p.address || undefined }; addCustom(st); S.wants.push(st.i); n++; });
    S.gimport = { at: Date.now(), n }; save(); MAP.setStores(STORES); applyMapStates(); updateNear(); refreshHud(); closeModal(); updateAreaChip();
    toast(`${n}店を「行きたい」に入れました`, 'ok');
  };
}

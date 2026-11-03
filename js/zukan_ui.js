// めぐり帳（view-zukan）：スタンプ・本・物語・月のふり返り・県
import { pagesForVol, frameOf, PREFS } from './config.js?v=0.17.2';
import { esc, icon, $, todayISO, $$, fmtDate, prefOf, fmtMin } from './util.js?v=0.17.2';
import { S, save } from './state.js?v=0.17.2';
import { BYID, rarityOf, STORES, stampSVG } from './data.js?v=0.17.2';
import * as G from './game.js?v=0.17.2';
import * as E from './events.js?v=0.17.2';
import { storyImage, shareBlob, profileImage } from './share.js?v=0.17.2';
import * as J from './journey.js?v=0.17.2';
import * as R from './reading.js?v=0.17.2';
import { toast, openModal, closeModal, currentSub, emptyBox } from './ui.js?v=0.17.2';
import { openSheet } from './map_ui.js?v=0.17.2';
import { openCard } from './card_ui.js?v=0.17.2';
import { renderReading } from './reading_ui.js?v=0.17.2';
import { nameModal } from './settings_ui.js?v=0.17.2';

// ---------- 今日の物語 ----------
function chapterHTML(ch) {
  const body = ch.empty ? `<p class="muted">${esc(ch.blank)}</p>` : ch.lines.map((l) => `<p>${esc(l.s)}${l.url && /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\//i.test(l.url) ? ` <a href="${esc(l.url)}" target="_blank" rel="noopener">投稿を見る</a>` : ''}</p>`).join('');
  const walked = ch.m >= 100;
  const stats = [`${icon('book')}この日 +${ch.earned}ページ`, walked ? `歩いて${ch.pages}ページ・${ch.km}km` : '', walked ? `歩数の目安 ${J.stepsOf(ch.m).toLocaleString()}歩` : '', ch.nStores ? `訪ねた場所 ${ch.nStores}か所` : '', ch.nCards ? `出会った本 ${ch.nCards}冊` : '', ch.nRead ? `読書 ${ch.nRead}回${ch.readMin ? `・${fmtMin(ch.readMin)}` : ''}` : '', ch.v >= 1000 ? `乗り物 ${J.kmOf(ch.v)}km` : ''].filter(Boolean);
  return `<div class="story"><div class="ch-sub">本めぐり　${S.settings.handle ? esc(S.settings.handle) + 'の物語' : 'その日の物語'}</div><div class="ch-title">${esc(ch.title)}</div><div class="story-body">${body}</div><div class="story-stats">${stats.map((s) => `<span>${s}</span>`).join('')}</div></div>`;
}
async function shareChapter(date) { try { const ch = J.chapter(date); const blob = await storyImage(ch, S.settings.avatar, S.settings.handle); const r = await shareBlob(blob, `story-${date}.png`, ch.title, `${ch.title}　+${ch.earned}ページ・${ch.nStores}か所 #本めぐり`); if (r !== 'cancel') { G.noteShare('story', '', r); toast(r === 'saved' ? '画像を保存しました' : 'シェアしました', 'ok'); renderStory(); } } catch (e) { toast('画像にできませんでした', 'warn'); } }
export function renderStory() {
  const box = $('#story-today'), list = $('#chapters'); if (!box) return;
  const ch = J.chapter(todayISO());
  box.innerHTML = chapterHTML(ch) + `<div class="actions"><button class="btn primary" id="sy-share">${icon('share')}今日の物語をシェア</button><button class="btn" id="sy-post">${icon('pen')}Xの投稿を記録</button></div><div class="note">歩いた距離は、現在地を追っているあいだと、店と店のあいだを数えます（100mで1ページ）。閉じて歩いた分は、次の店でスタンプを押したときに、前の店からのまっすぐの距離で足します。歩数は距離からの目安です。</div>`;
  $('#sy-share').onclick = () => shareChapter(todayISO()); $('#sy-post').onclick = postModal;
  const past = J.chapters(40).filter((c) => c.date !== todayISO());
  list.innerHTML = past.length ? past.map((c) => `<details class="chap"><summary><b>${esc(c.title)}</b><span class="muted small">${c.pages}ページ${c.nStores ? `・${c.nStores}か所` : ''}${c.nCards ? `・本${c.nCards}冊` : ''}</span></summary>${chapterHTML(c)}<div class="actions"><button class="btn" data-share="${esc(c.date)}">${icon('share')}この日の物語をシェア</button></div></details>`).join('') : '<div class="muted small">まだ前の章はありません。歩いた日・本屋に行った日ごとに、1章ずつ増えていきます。</div>';
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
    <div class="mtiles">${tile('本めぐりした日', cur.visitDays + '日', diff(cur.visitDays, prev.visitDays))}${tile('本めぐりの回数', cur.visits + '回', diff(cur.visits, prev.visits))}${tile('行った場所', cur.stores + 'か所', `新しいスタンプ ${cur.stampsNew}`)}${tile('増えたページ', cur.earned + 'ページ', `うち歩いて ${cur.pages}ページ・${J.kmOf(cur.m)}km`)}</div>${cur.readN ? `<div class="note">📖 読書 ${cur.readN}回・${fmtMin(cur.readMin)}${prev.readN ? `（先月は ${prev.readN}回・${fmtMin(prev.readMin)}）` : ''}</div>` : ''}
    <h3>月ごとの「本めぐりした日」</h3>
    <div class="mbars">${stats.map((s) => `<div class="mb"><div class="bw"><div class="bar" style="height:${Math.round((s.visitDays / max) * 100)}%"><span>${s.visitDays}</span></div></div><div class="lbl">${+s.prefix.slice(5)}月</div></div>`).join('')}</div>
    <h3>今月よく行った場所</h3>
    ${cur.top.length ? `<div class="list">${cur.top.map((t, i) => `<div class="item" data-id="${esc(t.st.i)}"><div class="main"><div class="name">${i + 1}. ${esc(t.st.n)}</div><div class="sub">今月 ${t.days}日${t.reg.rank ? `・常連度「${esc(t.reg.name)}」（通算 ${t.reg.days}日）` : ''}</div></div></div>`).join('')}</div>` : '<div class="muted small">今月はまだ本めぐりの記録がありません。</div>'}
    <div class="note">${y}年は、ここまで ${yr.visitDays}日 本めぐりしています（${yr.visits}回・${yr.stores}か所・出会った本 ${yr.cards}冊・増えたページ ${yr.earned}）。</div>`;
  $$('#month .item[data-id]').forEach((it) => it.addEventListener('click', () => openSheet(it.dataset.id)));
}
// ---------- めぐり帳（view-zukan） ----------
export function renderZukan() {
  const st = G.stats(); const lv = G.volume(); const pgs = G.storyPages(); const title = G.currentTitle();
  $('#profile').innerHTML = `<div class="ph">${S.settings.avatar ? `<img class="avatar big" src="${esc(S.settings.avatar)}" alt="">` : ''}<div class="lvbig"><small>第</small>${lv}<small>巻</small></div><div style="min-width:0"><div class="tt">${S.settings.handle ? `${esc(S.settings.handle)}<button class="icon-btn sm" id="pf-name" aria-label="名前を変える">${icon('pen')}</button>` : `<button class="linkish" id="pf-name">${icon('pen')}名前を付ける</button>`}</div><div class="t">称号「${esc(title || '本屋あるき見習い')}」</div><div class="t">📖 ${pgs}ページ（あと${pagesForVol(lv + 1) - pgs}ページで第${lv + 1}巻）${st.streak ? `　🔥 ${st.streak}週連続` : ''}<br>うち歩いて ${st.pages}ページ</div></div><button class="btn" id="pf-share" style="margin-left:auto">${icon('share')}</button></div>
    ${S.settings.pfOpen ? `<div class="stats">${[['スタンプ', st.stamps], ['行きつけ', st.regulars], ['カード', st.cards], ['県', `${st.prefs}/47`]].map(([l, n]) => `<div class="s"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('')}</div>
    <div class="titles">${(() => { const all = G.titles(); const got = all.filter((t) => t.ok); const next = all.filter((t) => !t.ok).slice(0, 3); const rest = all.length - got.length - next.length; return [...got.map((t) => t.name), ...(S.evTitles || []).map((t) => t.name)].map((n) => `<span class="t">🏅 ${esc(n)}</span>`).join('') + next.map((t) => `<span class="t off" title="${esc(t.need)}">${esc(t.name)}（${esc(t.need)}）</span>`).join('') + (rest > 0 ? `<span class="t off">ほか${rest}</span>` : ''); })()}</div>` : `<div class="pf-sum">スタンプ ${st.stamps}・行きつけ ${st.regulars}・カード ${st.cards}・県 ${st.prefs}/47</div>`}
    <button class="linkish pf-toggle" id="pf-toggle">${S.settings.pfOpen ? 'たたむ' : '称号とくわしい数字を見る'}</button>`;
  $('#pf-name').onclick = () => nameModal(renderZukan);
  $('#pf-toggle').onclick = () => { S.settings.pfOpen = !S.settings.pfOpen; save(); renderZukan(); }; // 上の枠は、ふだんはたたんでおく（スタンプを上に。v0.13）
  $('#pf-share').onclick = async () => { try { const ids = Object.keys(S.stamps); const top = ids.map((id) => BYID.get(id)).filter(Boolean).sort((a, b) => rarityOf(b) - rarityOf(a)); const blob = await profileImage({ level: lv, title, st, topStamps: top, avatar: S.settings.avatar, handle: S.settings.handle }); const r = await shareBlob(blob, 'honya-profile.png', '本めぐり', `${S.settings.handle ? S.settings.handle + '　' : ''}第${lv}巻 ${title} スタンプ${st.stamps} #本めぐり`); if (r !== 'cancel') G.noteShare('profile', '', r); if (r !== 'cancel') toast(r === 'saved' ? '画像を保存しました' : 'シェアしました', 'ok'); } catch (e) { toast('画像にできませんでした', 'warn'); } };
  $$('.segmented button').forEach((b) => b.classList.toggle('active', b.dataset.sub === currentSub));
  $$('.sub[id^="sub-"]').forEach((el) => el.classList.toggle('active', el.id === 'sub-' + currentSub));
  const fr = frameOf(lv); const ids = Object.keys(S.stamps);
  const stamped = ids.map((id) => ({ st: BYID.get(id), d: S.stamps[id].d, trial: S.stamps[id].trial })).filter((x) => x.st).sort((a, b) => b.d.localeCompare(a.d));
  $('#stamp-grid').innerHTML = stamped.length ? `<div class="hint" style="grid-column:1/-1">${fr ? `第${lv}巻の額縁：${['', '銅', '銀', '金'][fr]}` : '第3巻になるとスタンプに額縁が付きます'}　スタンプは全部で ${STORES.length.toLocaleString()}種類</div>` + stamped.map(({ st, d, trial }) => { const reg = G.regularInfo(st.i); return `<div class="st f${fr}" data-id="${esc(st.i)}">${stampSVG(st, true, 76, { rank: reg.rank, ev: E.storeFrame(st.i) })}<div class="n">${esc(st.n)}</div>${reg.rank >= 2 ? `<div class="n reg">${esc(reg.name)}・${reg.days}日</div>` : `<div class="n">${fmtDate(d)}${trial ? '・体験' : ''}</div>`}</div>`; }).join('') : emptyBox('stamp', '店の射程内（120m）で「スタンプを押す」と、ここに並びます。家で試すなら お試し歩き → ワープ。');
  $$('#stamp-grid .st').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  // 本：いま読んでいる本・読み終えた本（v0.14）と、出会った本のカード
  renderReading();
  const g = $('#card-grid'); g.innerHTML = S.cards.length ? S.cards.slice().reverse().map((c) => `<div class="card" data-id="${esc(c.id)}"><div class="cover">${c.cover ? `<img src="${esc(c.cover)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : `<div class="notitle">${esc(c.title)}</div>`}</div><div class="stampmark">出会</div><div class="meta"><b>${esc(c.title)}</b>${esc(c.sn)}<br>${fmtDate(c.d)}${c.pub ? '・公開' : ''}</div></div>`).join('') : emptyBox('barcode', '店のページで「本と出会った」を押すと、ここに増えます。');
  $$('#card-grid .card').forEach((el) => el.addEventListener('click', () => openCard(el.dataset.id)));
  // 帳
  const md = todayISO().slice(5), y = new Date().getFullYear();
  const past = [...S.visits.filter((v) => v.d.slice(5) === md && +v.d.slice(0, 4) < y).map((v) => ({ y: +v.d.slice(0, 4), text: `${(BYID.get(v.s) || {}).n || v.n}に行った` })), ...S.cards.filter((c) => c.d.slice(5) === md && +c.d.slice(0, 4) < y).map((c) => ({ y: +c.d.slice(0, 4), text: `${c.sn}で『${c.title}』と出会った` }))];
  $('#anniv').innerHTML = past.length ? past.map((p) => `<div>${y - p.y}年前の今日、${esc(p.text)}</div>`).join('') : '<span class="muted">まだありません。来年のこの日に、今日の記録がここに出ます。</span>';
  const rows = [...S.visits.map((v) => ({ t: v.t, d: v.d, id: v.s, html: `<div class="main"><div class="name">${esc((BYID.get(v.s) || {}).n || v.n)} <span class="badge ${v.near ? 'shu' : 'sumi'}">${v.near ? 'スタンプ' : '記録'}</span>${v.trial ? '<span class="badge trial">体験</span>' : ''}</div>${v.memo ? `<div class="sub">${esc(v.memo)}</div>` : ''}</div>` })), ...S.cards.map((c) => ({ t: c.t, d: c.d, id: c.s, html: `<div class="main"><div class="name">${esc(c.sn)} <span class="badge">カード</span></div><div class="sub">『${esc(c.title)}』</div></div>` }))].sort((a, b) => b.t - a.t);
  let last = '', html = ''; for (const r of rows) { if (r.d !== last) { html += `<div class="date">${fmtDate(r.d)}</div>`; last = r.d; } html += `<div class="item" data-id="${esc(r.id)}">${r.html}</div>`; }
  $('#visit-list').innerHTML = html || emptyBox('map', 'まだ記録はありません。');
  $$('#visit-list .item').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  renderStory(); renderMonth();
  // 県
  const pc = {}; ids.forEach((id) => { const s = BYID.get(id); if (s) { const p = prefOf(s); pc[p] = (pc[p] || 0) + 1; } });
  $('#prefs').innerHTML = PREFS.map(([n]) => { const c = pc[n] || 0; return `<div class="p ${c >= 3 ? 'v2' : c ? 'v1' : ''}" title="${esc(n)} ${c}">${esc(n.replace(/[都府県]$/, ''))}</div>`; }).join('');
}

// 画面：レーダー・図鑑・お題・設定・最初の案内
import { APP_VER, RANGE_M, PG, pagesForVol, frameOf, PREFS, INK } from './config.js?v=0.8.4';
import { S, save, exportJSON, parseImport, replace, reset } from './state.js?v=0.8.4';
import { STORES, BYID, FEAT, RALLIES, isFeat, rarityOf, rarityText, stampSVG, unhideAll, rebuild, DATA_DATE } from './data.js?v=0.8.4';
import * as G from './game.js?v=0.8.4';
import * as MAP from './map.js?v=0.8.4';
import { POS, hasPos } from './position.js?v=0.8.4';
import { sfx, haptic } from './audio.js?v=0.8.4';
import { profileImage, shareBlob } from './share.js?v=0.8.4';
import { toast, openModal, closeModal, confirmBox, openSheet, openCard, switchView, setSub, refreshHud, applyMapStates, updateNear, locate, setTrialUI, warp, devRefillInk, makeAvatar, nameModal, cleanHandle, NEAR, currentSub } from './ui.js?v=0.8.4';
import * as JU from './journey_ui.js?v=0.6.3';
import { $, $$, esc, dist, bearing, arrowOf, fmtDist, fmtDate, todayISO, prefOf, stars, icon, weekKey } from './util.js?v=0.8.4';

const empty = (ic, text) => `<div class="empty">${icon(ic)}<div>${text}</div></div>`;

// ---------- レーダー ----------
const LEGEND = [['#d6452b', '本屋'], ['#8a5a3c', '古書店'], ['#2a221d', '秘境の本屋'], ['#2a8576', '図書館'], ['#3b4a8a', 'スタンプ済み'], ['#e8a51e', '射程内']];
function renderLegend() { const el = $('#radar-legend'); if (el) el.innerHTML = '<span class="lg-t">ピンの色</span>' + LEGEND.map(([c, t]) => `<span class="lg"><i style="background:${c}"></i>${t}</span>`).join(''); }
export function renderRadar() {
  renderLegend(); JU.renderRadarWants();
  const st = $('#radar-status'), list = $('#radar-list');
  if (!hasPos()) { st.className = 'status-card'; st.innerHTML = `現在地がまだありません。<div class="actions"><button class="btn primary" id="rd-loc">${icon('locate')}現在地を追う</button><button class="btn" id="rd-trial">${icon('foot')}お試し歩き</button></div>`; $('#rd-loc').onclick = () => { switchView('map'); locate(); }; $('#rd-trial').onclick = () => { switchView('map'); setTrialUI(true); warp(); }; list.innerHTML = ''; return; }
  st.className = 'status-card gold'; st.innerHTML = `${POS.fake ? '<span class="badge feat">お試し</span>' : '<span class="badge ao">追跡中</span>'} 射程内 <b>${NEAR.inRange.size}</b>店　<span class="muted small">${POS.acc ? `誤差 約${Math.round(POS.acc)}m　` : ''}店から${RANGE_M}m以内でスタンプが押せます</span>`;
  list.innerHTML = NEAR.list.map(({ s, d }) => `<div class="item ${d <= RANGE_M ? 'in' : ''}" data-id="${esc(s.i)}"><div class="main"><div class="name">${G.hasStamp(s.i) ? '🔴 ' : ''}${isFeat(s.i) ? '<span class="crown">👑</span> ' : ''}${esc(s.n)}${s.u ? ' <span class="badge">古書店</span>' : ''}${s.t === 'l' ? ' <span class="badge lib">図書館</span>' : ''}</div><div class="sub">${esc(s.a || prefOf(s))}　<span class="stars">${stars(rarityOf(s))}</span></div></div><div class="dist">${d <= RANGE_M ? '射程内' : fmtDist(d)}<br>${arrowOf(bearing(POS.lat, POS.lon, s.la, s.lo))}</div></div>`).join('') || empty('radar', '3kmの中に店がありません。');
  $$('#radar-list .item').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
}

// ---------- 図鑑 ----------
export function renderZukan() {
  const st = G.stats(); const lv = G.volume(); const pgs = G.storyPages(); const title = G.currentTitle();
  $('#profile').innerHTML = `<div class="ph">${S.settings.avatar ? `<img class="avatar big" src="${S.settings.avatar}" alt="">` : ''}<div class="lvbig"><small>第</small>${lv}<small>巻</small></div><div style="min-width:0"><div class="tt">${S.settings.handle ? `${esc(S.settings.handle)}<button class="icon-btn sm" id="pf-name" aria-label="名前を変える">${icon('pen')}</button>` : `<button class="linkish" id="pf-name">${icon('pen')}名前を付ける</button>`}</div><div class="t">称号「${esc(title || '本屋あるき見習い')}」</div><div class="t">📖 ${pgs}ページ（あと${pagesForVol(lv + 1) - pgs}ページで第${lv + 1}巻）${st.streak ? `　🔥 ${st.streak}週連続` : ''}<br>うち歩いて ${st.pages}ページ</div></div><button class="btn" id="pf-share" style="margin-left:auto">${icon('share')}</button></div>
    <div class="stats">${[['スタンプ', st.stamps], ['行きつけ', st.regulars], ['カード', st.cards], ['県', `${st.prefs}/47`]].map(([l, n]) => `<div class="s"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('')}</div>
    <div class="titles">${(() => { const all = G.titles(); const got = all.filter((t) => t.ok); const next = all.filter((t) => !t.ok).slice(0, 3); const rest = all.length - got.length - next.length; return got.map((t) => `<span class="t">🏅 ${esc(t.name)}</span>`).join('') + next.map((t) => `<span class="t off" title="${esc(t.need)}">${esc(t.name)}（${esc(t.need)}）</span>`).join('') + (rest > 0 ? `<span class="t off">ほか${rest}</span>` : ''); })()}</div>`;
  $('#pf-name').onclick = () => nameModal(renderZukan);
  $('#pf-share').onclick = async () => { try { const ids = Object.keys(S.stamps); const top = ids.map((id) => BYID.get(id)).filter(Boolean).sort((a, b) => rarityOf(b) - rarityOf(a)); const blob = await profileImage({ level: lv, title, st, topStamps: top, avatar: S.settings.avatar, handle: S.settings.handle }); const r = await shareBlob(blob, 'honya-profile.png', '本めぐり', `${S.settings.handle ? S.settings.handle + '　' : ''}第${lv}巻 ${title} スタンプ${st.stamps} #本めぐり`); if (r !== 'cancel') G.noteShare('profile', '', r); if (r !== 'cancel') toast(r === 'saved' ? '画像を保存しました' : 'シェアしました', 'ok'); } catch (e) { toast('画像にできませんでした', 'warn'); } };
  $$('.segmented button').forEach((b) => b.classList.toggle('active', b.dataset.sub === currentSub));
  $$('.sub').forEach((el) => el.classList.toggle('active', el.id === 'sub-' + currentSub));
  const fr = frameOf(lv); const ids = Object.keys(S.stamps);
  const stamped = ids.map((id) => ({ st: BYID.get(id), d: S.stamps[id].d, trial: S.stamps[id].trial })).filter((x) => x.st).sort((a, b) => b.d.localeCompare(a.d));
  $('#stamp-grid').innerHTML = stamped.length ? `<div class="hint" style="grid-column:1/-1">${fr ? `第${lv}巻の額縁：${['', '銅', '銀', '金'][fr]}` : '第3巻になるとスタンプに額縁が付きます'}　スタンプは全部で ${STORES.length.toLocaleString()}種類</div>` + stamped.map(({ st, d, trial }) => { const reg = G.regularInfo(st.i); return `<div class="st f${fr}" data-id="${esc(st.i)}">${stampSVG(st, true, 76, { rank: reg.rank })}<div class="n">${esc(st.n)}</div>${reg.rank >= 2 ? `<div class="n reg">${esc(reg.name)}・${reg.days}日</div>` : `<div class="n">${fmtDate(d)}${trial ? '・体験' : ''}</div>`}</div>`; }).join('') : empty('ink', '店の射程内（120m）で「スタンプを押す」と、ここに並びます。家で試すなら お試し歩き → ワープ。');
  $$('#stamp-grid .st').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  // カード
  const g = $('#card-grid'); g.innerHTML = S.cards.length ? S.cards.slice().reverse().map((c) => `<div class="card" data-id="${esc(c.id)}"><div class="cover">${c.cover ? `<img src="${esc(c.cover)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : `<div class="notitle">${esc(c.title)}</div>`}</div><div class="stampmark">出会</div><div class="meta"><b>${esc(c.title)}</b>${esc(c.sn)}<br>${fmtDate(c.d)}${c.pub ? '・公開' : ''}</div></div>`).join('') : empty('barcode', '店のページで「本と出会った」を押すと、ここに増えます。');
  $$('#card-grid .card').forEach((el) => el.addEventListener('click', () => openCard(el.dataset.id)));
  // 帳
  const md = todayISO().slice(5), y = new Date().getFullYear();
  const past = [...S.visits.filter((v) => v.d.slice(5) === md && +v.d.slice(0, 4) < y).map((v) => ({ y: +v.d.slice(0, 4), text: `${(BYID.get(v.s) || {}).n || v.n}に行った` })), ...S.cards.filter((c) => c.d.slice(5) === md && +c.d.slice(0, 4) < y).map((c) => ({ y: +c.d.slice(0, 4), text: `${c.sn}で『${c.title}』と出会った` }))];
  $('#anniv').innerHTML = past.length ? past.map((p) => `<div>${y - p.y}年前の今日、${esc(p.text)}</div>`).join('') : '<span class="muted">まだありません。来年のこの日に、今日の記録がここに出ます。</span>';
  const rows = [...S.visits.map((v) => ({ t: v.t, d: v.d, id: v.s, html: `<div class="main"><div class="name">${esc((BYID.get(v.s) || {}).n || v.n)} <span class="badge ${v.near ? 'shu' : 'sumi'}">${v.near ? 'スタンプ' : '記録'}</span>${v.trial ? '<span class="badge trial">体験</span>' : ''}</div>${v.memo ? `<div class="sub">${esc(v.memo)}</div>` : ''}</div>` })), ...S.cards.map((c) => ({ t: c.t, d: c.d, id: c.s, html: `<div class="main"><div class="name">${esc(c.sn)} <span class="badge">カード</span></div><div class="sub">『${esc(c.title)}』</div></div>` }))].sort((a, b) => b.t - a.t);
  let last = '', html = ''; for (const r of rows) { if (r.d !== last) { html += `<div class="date">${fmtDate(r.d)}</div>`; last = r.d; } html += `<div class="item" data-id="${esc(r.id)}">${r.html}</div>`; }
  $('#visit-list').innerHTML = html || empty('map', 'まだ記録はありません。');
  $$('#visit-list .item').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  JU.renderStory(); JU.renderMonth();
  // 県
  const pc = {}; ids.forEach((id) => { const s = BYID.get(id); if (s) { const p = prefOf(s); pc[p] = (pc[p] || 0) + 1; } });
  $('#prefs').innerHTML = PREFS.map(([n]) => { const c = pc[n] || 0; return `<div class="p ${c >= 3 ? 'v2' : c ? 'v1' : ''}" title="${esc(n)} ${c}">${esc(n.replace(/[都府県]$/, ''))}</div>`; }).join('');
}

// ---------- お題 ----------
export function renderMissions() {
  const wk = weekKey(), d = todayISO(); const cw = S.claimedW[wk] || [], cd = S.claimedD[d] || [];
  $('#day-label').textContent = `${fmtDate(d)}`; $('#week-label').textContent = `${wk}・月曜から`;
  const mrow = (m, claimed, xp) => { const done = m.cur >= m.goal; return `<div class="m ${done ? 'done' : ''}"><div class="h"><b>${done ? '✅ ' : ''}${esc(m.name)}</b><span class="muted small">${Math.min(m.cur, m.goal)}/${m.goal}${claimed.includes(m.id) ? `　+${xp}ページ` : ''}</span></div><div class="bar"><i style="width:${Math.min(100, Math.round((m.cur / m.goal) * 100))}%"></i></div><div class="sub">${esc(m.sub)}</div></div>`; };
  $('#daily-list').innerHTML = G.dailyMissions().map((m) => mrow(m, cd, PG.daily)).join('');
  $('#mission-list').innerHTML = G.weeklyMissions().map((m) => mrow(m, cw, PG.weekly)).join('');
  let feats = [...FEAT.entries()].map(([p, id]) => ({ p, s: BYID.get(id) })).filter((x) => x.s);
  if (hasPos()) feats.sort((a, b) => dist(POS.lat, POS.lon, a.s.la, a.s.lo) - dist(POS.lat, POS.lon, b.s.la, b.s.lo)); else feats.sort((a, b) => PREFS.findIndex((x) => x[0] === a.p) - PREFS.findIndex((x) => x[0] === b.p));
  $('#feat-list').innerHTML = feats.slice(0, 6).map(({ p, s }) => `<div class="item" data-id="${esc(s.i)}"><div class="main"><div class="name"><span class="crown">👑</span> ${esc(s.n)}${(S.featDone[wk] || []).includes(s.i) ? ' <span class="badge shu">済</span>' : ''}</div><div class="sub">${esc(p)}　${esc(s.a || '')}</div></div><div class="dist">${hasPos() ? fmtDist(dist(POS.lat, POS.lon, s.la, s.lo)) : ''}</div></div>`).join('') + (feats.length > 6 ? `<div class="hint" style="padding:8px 4px 0">ほか${feats.length - 6}県。地図では紫の輪で出ます。</div>` : '');
  $$('#feat-list .item').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  $('#rally-list').innerHTML = G.rallyProgress().map((r) => `<div class="m ${r.done ? 'done' : ''}"><div class="h"><b>${r.done ? '🏆 ' : ''}${esc(r.name)}</b><span class="muted small">${r.got}/${r.stores.length}</span></div><div class="bar"><i style="width:${Math.round((r.got / r.stores.length) * 100)}%"></i></div><div class="sub">${esc(r.desc)}　称号「${esc(r.title)}」</div><div class="sub" style="margin-top:6px">${r.stores.map((id) => { const s = BYID.get(id); return s ? `<span class="badge ${G.hasStamp(id) ? 'shu' : ''}">${esc(s.n)}</span>` : ''; }).join('')}</div><div class="actions"><button class="btn" data-go="${esc(r.id)}">${icon('map')}地図で見る</button></div></div>`).join('') || empty('flag', 'ラリーのデータがありません。');
  $$('#rally-list [data-go]').forEach((b) => b.addEventListener('click', () => { const r = RALLIES.find((x) => x.id === b.dataset.go); if (r) { switchView('map'); MAP.flyTo(r.lo, r.la, 14.5, { zoom: 14.5 }); } }));
  $('#ach-list').innerHTML = G.achievements().map((a) => `<div class="m ${a.ok ? 'done' : ''}"><div class="h"><b>${a.ok ? '🏅 ' : ''}${esc(a.name)}</b><span class="muted small">${a.cur}/${a.n}</span></div><div class="bar"><i style="width:${Math.round((a.cur / a.n) * 100)}%"></i></div><div class="sub">${esc(a.desc)}</div></div>`).join('');
}

// ---------- 設定 ----------
export function renderSettings() {
  const s = S.settings; const hid = Object.keys(S.hidden);
  $('#settings-pane').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><button class="icon-btn" id="st-back" aria-label="戻る" style="transform:rotate(180deg)">${icon('chevron')}</button><h2 style="margin:0">設定</h2></div>
    <div class="setting"><div><div class="l">見た目</div><div class="s">自動は端末の設定に合わせます</div></div><div class="seg3" id="st-theme">${['auto', 'light', 'dark'].map((t) => `<button data-t="${t}" class="${s.theme === t ? 'active' : ''}">${{ auto: '自動', light: '明', dark: '暗' }[t]}</button>`).join('')}</div></div>
    <div class="setting"><div><div class="l">ハンドルネーム</div><div class="s">${S.settings.handle ? esc(S.settings.handle) : 'まだありません。見出し・プロフィール・シェアする画像に出ます'}</div></div><button class="btn" id="st-name">${S.settings.handle ? '変える' : '付ける'}</button></div>
    <div class="setting"><div><div class="l">自分のアイコン</div><div class="s">地図の現在地に出ます。写真はこの端末の中だけに置き、どこにも送りません</div></div><div class="avatar-ctl">${s.avatar ? `<img class="avatar" src="${s.avatar}" alt="">` : ''}<label class="btn">${s.avatar ? '替える' : '選ぶ'}<input type="file" id="st-avatar" accept="image/*" hidden></label>${s.avatar ? '<button class="btn ghost" id="st-avatar-del">外す</button>' : ''}</div></div>
    <div class="setting"><div><div class="l">図書館も地図に出す</div><div class="s">全国の公共図書館（約3,500館）。大学・学校の図書館は入っていません</div></div><button class="switch ${s.showLib !== false ? 'on' : ''}" id="st-lib" role="switch" aria-checked="${s.showLib !== false}" aria-label="図書館も地図に出す"></button></div>
    <div class="setting"><div><div class="l">行きたい店のお知らせ</div><div class="s">行きたい店に近づくと、地図の下でお知らせします（アプリを開いて現在地を追っているあいだ）</div></div><button class="switch ${s.wantAlert !== false ? 'on' : ''}" id="st-want" role="switch" aria-checked="${s.wantAlert !== false}" aria-label="行きたい店のお知らせ"></button></div>
    ${s.wantAlert !== false ? `<div class="setting"><div><div class="l">お知らせする距離</div><div class="s">この距離に入ったときと、500mに入ったとき</div></div><div class="seg3" id="st-want-m">${[1000, 2000, 5000].map((m) => `<button data-m="${m}" class="${(s.wantAlertM || 2000) === m ? 'active' : ''}">${m / 1000}km</button>`).join('')}</div></div>` : ''}
    <div class="setting stack"><div><div class="l">Googleマップの★</div><div class="s">Googleマップで★を付けた本屋を「行きたい」にまとめて入れます${S.gimport ? `（前回 ${S.gimport.n}店）` : ''}</div></div><div class="avatar-ctl"><button class="btn ghost" id="st-ghelp">読み込み方</button><label class="btn">読み込む<input type="file" id="st-gimport" accept=".json,.csv,application/json,text/csv" multiple hidden></label></div></div>
    <div class="setting"><div><div class="l">音</div><div class="s">スタンプを押したとき・巻が進んだとき（近づいたときは鳴りません）</div></div><button class="switch ${s.sound ? 'on' : ''}" id="st-sound" role="switch" aria-checked="${s.sound}" aria-label="音"></button></div>
    <div class="setting"><div><div class="l">お試し歩き</div><div class="s">地図を押した場所に自分がいることにする（家で試す用）</div></div><button class="switch ${POS.fake ? 'on' : ''}" id="st-trial" role="switch" aria-checked="${POS.fake}" aria-label="お試し歩き"></button></div>
    <h3>記録</h3>
    <div class="setting"><div><div class="l">書き出す</div><div class="s">スタンプ・カード・ページをファイルに</div></div><button class="btn" id="st-export">書き出す</button></div>
    <div class="setting"><div><div class="l">読み込む</div><div class="s">書き出したファイルから置き換え</div></div><label class="btn">読み込む<input type="file" id="st-import" accept="application/json" hidden></label></div>
    <div class="setting"><div><div class="l">店の情報の報告</div><div class="s">${hid.length || Object.keys(S.renames || {}).length ? `閉店 ${hid.length}件・名前の直し ${Object.keys(S.renames || {}).length}件（書き出しに含まれます）` : 'まだありません（店のページの「閉店している」「名前が違う」から）'}</div></div><button class="btn" id="st-unhide" ${hid.length || Object.keys(S.renames || {}).length ? '' : 'disabled'}>戻す</button></div>
    <div class="setting"><div><div class="l">すべて消す</div><div class="s">この端末の記録を消します。戻せません</div></div><button class="btn danger" id="st-clear">消す</button></div>
    <div id="st-area"></div>
    <h3>試作のための道具</h3>
    <div class="setting"><div><div class="l">インクを満タンに</div><div class="s">インクは${INK.max}まで、${INK.rechargeMs / 60000}分に1つ回復</div></div><button class="btn" id="st-ink">満タン</button></div>
    <div class="setting"><div><div class="l">端末の確認</div><div class="s">位置・カメラ・保存が使えるか</div></div><button class="btn" id="st-diag">確認</button></div>
    <div id="st-diag-out"></div>
    <h3>このアプリについて</h3>
    <div class="about">本めぐり v${APP_VER}（試作）。本屋と図書館をめぐる位置ゲーム。<br>位置はこの端末の中で距離を出すためだけに使い、どこにも送りません。記録はこの端末の中だけに残ります。<br><br>
      店の位置：© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors（ODbL）。地図：<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>・<a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>。本の情報と表紙：<a href="https://openbd.jp/" target="_blank" rel="noopener">openBD</a>（表紙は紹介のための参照表示で、保存しません）。地図の描画：MapLibre GL JS。文字：Google Fonts。<br>
      店のデータは ${DATA_DATE} 時点の OpenStreetMap（有志が作る地図）で、閉店や名前の変更が反映されていない店があります。店のページの「閉店している」で外せ、「名前が違う」で直せます（この端末だけ。記録の書き出しに含まれます）。</div>`;
  $('#st-back').onclick = () => switchView('map');
  $$('#st-theme button').forEach((b) => b.addEventListener('click', () => { s.theme = b.dataset.t; save(); applyTheme(); renderSettings(); }));
  $('#st-avatar').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const url = await makeAvatar(f); s.avatar = url; save(); await MAP.setAvatar(url); toast('アイコンを設定しました。地図の現在地に出ます', 'ok'); } catch (err) { toast('この画像は使えませんでした（別の写真でお試しください）', 'warn'); } e.target.value = ''; renderSettings(); });
  if ($('#st-avatar-del')) $('#st-avatar-del').onclick = () => { s.avatar = ''; save(); MAP.setAvatar(null); renderSettings(); toast('アイコンを外しました'); };
  $('#st-lib').onclick = () => { s.showLib = s.showLib === false; save(); rebuild(); MAP.setStores(STORES); applyMapStates(); updateNear(); refreshHud(); toast(s.showLib ? '図書館を地図に出しました' : '図書館を地図から隠しました'); renderSettings(); };
  $('#st-want').onclick = () => { s.wantAlert = s.wantAlert === false; save(); renderSettings(); };
  $$('#st-want-m button').forEach((b) => b.addEventListener('click', () => { s.wantAlertM = +b.dataset.m; save(); renderSettings(); }));
  $('#st-ghelp').onclick = JU.googleHelp;
  $('#st-gimport').addEventListener('change', async (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) await JU.importGoogleFiles(fs); renderSettings(); });
  $('#st-name').onclick = () => nameModal(renderSettings);
  $('#st-sound').onclick = () => { s.sound = !s.sound; save(); renderSettings(); if (s.sound) sfx.click(); };
  $('#st-trial').onclick = () => { setTrialUI(!POS.fake); renderSettings(); };
  $('#st-export').onclick = () => { const blob = new Blob([exportJSON()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `honya-map-${todayISO()}.json`; document.body.appendChild(a); a.click(); a.remove(); toast('書き出しました', 'ok'); };
  $('#st-import').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const d = parseImport(await f.text()); confirmBox($('#st-area'), `読み込むと、いまの記録（スタンプ${Object.keys(S.stamps).length}・カード${S.cards.length}）は置き換わります。`, () => { replace(d); rebuild(); MAP.setStores(STORES); applyMapStates(); refreshHud(); toast('読み込みました', 'ok'); renderSettings(); }, '置き換える'); } catch (err) { toast('読み込めませんでした（このアプリで書き出したファイルを選んでください）', 'warn'); } e.target.value = ''; });
  $('#st-unhide').onclick = () => { unhideAll(); save(); MAP.setStores(STORES); applyMapStates(); updateNear(); toast('戻しました', 'ok'); renderSettings(); };
  $('#st-clear').onclick = () => confirmBox($('#st-area'), 'この端末の記録（スタンプ・訪問・カード・行きたい・追加した店・ページ）をすべて消します。戻せません。', () => { reset(); rebuild(); MAP.setStores(STORES); applyMapStates(); refreshHud(); toast('消しました'); renderSettings(); });
  $('#st-ink').onclick = devRefillInk;
  $('#st-diag').onclick = async () => { const out = $('#st-diag-out'); const rows = []; rows.push(['位置', navigator.geolocation ? '使える' : '使えない']); rows.push(['カメラ', navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? '使える' : '使えない']); rows.push(['バーコード読み取り（標準）', 'BarcodeDetector' in window ? 'あり' : 'なし（代わりの部品を使います）']); let storage = '?'; try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); storage = '使える'; } catch (e) { storage = '使えない'; } rows.push(['保存', storage]); rows.push(['https', location.protocol === 'https:' ? 'はい' : 'いいえ（位置とカメラにはhttpsが要ります）']); rows.push(['ホーム画面に追加', window.matchMedia('(display-mode: standalone)').matches ? '追加ずみ' : '未追加']);  rows.push(['共有', navigator.share ? '使える' : '使えない（画像は保存になります）']); out.innerHTML = `<div class="status-card">${rows.map(([k, v]) => `<div><b>${k}</b>：${v}</div>`).join('')}</div>`; };
}
export function applyTheme() {
  const t = S.settings.theme; const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'; MAP.setTheme(dark ? 'dark' : 'light');
}

// ---------- 最初の案内 ----------
export function showOnboarding(onDone) {
  const pages = [
    { art: `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="#efe8da"/><circle cx="96" cy="124" r="46" fill="none" stroke="#d9a521" stroke-width="3" stroke-dasharray="6 5"/><circle cx="96" cy="124" r="10" fill="#2b6cb0" stroke="#fff" stroke-width="4"/><image href="${MAP.pinDataURL('lib')}" x="34" y="62" width="40" height="51"/><image href="${MAP.pinDataURL('rare')}" x="136" y="108" width="40" height="51"/><image href="${MAP.pinDataURL('near')}" x="104" y="30" width="52" height="66"/></svg>`, h: '本屋や図書館に近づくと、光る', p: '地図に現在地が出ます。店から120m以内に入ると、ピンが金色の星に変わります。' },
    { art: `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="#efe8da"/><g transform="rotate(-7 100 100)">${stampSVG({ i: 'onboard-sample', n: 'ほんの森書店', k: 0 }, true, 124).replace('<svg ', '<svg x="38" y="38" ')}</g></svg>`, h: 'その店だけのスタンプを押す', p: `スタンプは本屋と図書館で全国 ${STORES.length.toLocaleString()} 種類。周りに同じ種類の場所が少ない「秘境」ほど珍しいスタンプです。押すとインクを1つ使い、時間で回復します。同じ店に通うほど「常連度」が上がります。` },
    { art: `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="86" fill="#eee6d8"/><rect x="62" y="52" width="76" height="100" rx="6" fill="#fffdf8" stroke="#ddd4c6" stroke-width="2"/><rect x="74" y="66" width="52" height="54" rx="3" fill="#d6452b" opacity=".9"/><rect x="74" y="128" width="52" height="5" rx="2" fill="#5f574f"/><rect x="74" y="138" width="34" height="5" rx="2" fill="#8a8178"/></svg>`, h: '本と出会ったら、カードに', p: '買った本の裏のバーコードを読むと、表紙と店と日付が1枚のカードになります。読んだかどうかは問いません。' },
    { art: `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="#efe8da"/><g transform="translate(100 106)"><path d="M-64 -46q32 -14 64 0v88q-32 -14 -64 0z" fill="#fffdf7" stroke="#d6452b" stroke-width="4" stroke-linejoin="round"/><path d="M0 -46q32 -14 64 0v88q-32 -14 -64 0z" fill="#fffdf7" stroke="#d6452b" stroke-width="4" stroke-linejoin="round"/><text x="-32" y="-8" text-anchor="middle" font-size="19" font-weight="900" fill="#d6452b" font-family="Zen Maru Gothic, sans-serif">第1巻</text><path d="M-50 14h36M-50 27h28M14 -16h36M14 -3h36M14 10h28M14 23h32" stroke="#cbbfae" stroke-width="3" stroke-linecap="round"/><path d="M42 -53v32l-7 -6-7 6v-32" fill="#d9a521"/></g></svg>`, h: 'ページがたまると、次の巻へ', p: 'スタンプを押す、本と出会う、歩く（100mで1ページ）。どれもあなたの物語のページになり、ページがたまると巻が進みます。ほかのゲームでいうレベルです。' },
  ];
  let i = 0; const box = $('#onboard-box');
  const draw = () => { const p = pages[i]; const last = i === pages.length - 1;
    box.innerHTML = `<div class="art">${p.art}</div><h2>${esc(p.h)}</h2><p>${esc(p.p)}</p><div class="dotsnav">${pages.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      ${last ? `<div class="field"><label for="ob-name">ハンドルネーム（あとで設定でも変えられます）</label><input type="text" id="ob-name" maxlength="20" placeholder="例：本の虫" autocomplete="nickname"></div><div class="note">位置はこの端末の中で距離を出すためだけに使い、どこにも送りません。記録もこの端末の中だけです。</div><div class="actions"><button class="btn primary wide" id="ob-geo">${icon('locate')}現在地から始める</button><button class="btn wide" id="ob-trial">${icon('foot')}お試し歩きで始める（家で試す）</button><button class="btn ghost wide" id="ob-later">あとで</button></div>` : `<div class="actions"><button class="btn primary wide" id="ob-next">つぎへ</button><button class="btn ghost wide" id="ob-skip">とばす</button></div>`}`;
    if (!last) { $('#ob-next').onclick = () => { i++; draw(); }; $('#ob-skip').onclick = () => { i = pages.length - 1; draw(); }; }
    else { const done = (mode) => { const nm = cleanHandle($('#ob-name') ? $('#ob-name').value : ''); if (nm) { S.settings.handle = nm; save(); } $('#onboard').hidden = true; onDone(mode); }; $('#ob-geo').onclick = () => done('geo'); $('#ob-trial').onclick = () => done('trial'); $('#ob-later').onclick = () => done('later'); } };
  $('#onboard').hidden = false; draw();
}

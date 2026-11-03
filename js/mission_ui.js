// ラリー（view-mission）：イベント・今日と今週のお題・推し店
import { PG, PREFS } from './config.js?v=0.17.2';
import { esc, icon, $, $$, dist, fmtDist, weekKey, todayISO, fmtDate } from './util.js?v=0.17.2';
import { S } from './state.js?v=0.17.2';
import { hasPos, POS } from './position.js?v=0.17.2';
import { BYID, stampSVG, STORES, RALLIES } from './data.js?v=0.17.2';
import * as MAP from './map.js?v=0.17.2';
import * as G from './game.js?v=0.17.2';
import * as E from './events.js?v=0.17.2';
import { switchView, toast, emptyBox } from './ui.js?v=0.17.2';
import { openSheet } from './map_ui.js?v=0.17.2';

// ---------- ラリー（view-mission）：今日・今週のお題、推し店、ご当地ラリー、実績 ----------
// ---------- イベント（ラリーの画面の一番上。設定はサーバーの管理画面から） ----------
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const fmtDT = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
function eventCard(e, kind) {
  const n = E.evCount(e.id), g = e.goal, done = !!(g && n >= g.count);
  const when = kind === 'live' ? `開催中・あと${E.daysLeft(e)}日` : kind === 'soon' ? `はじまるまで あと${E.daysUntil(e)}日` : '終わりました';
  const stamps = Object.keys(((S.evLog || {})[e.id] || {}).s || {}).map((id) => BYID.get(id)).filter(Boolean);
  const sample = { i: 'event-sample-' + e.id, n: e.frame.label || e.name, k: 5 };
  return `<div class="evcard ${kind}" style="--evc:${esc(e.frame.color)}">
    <div class="evtop"><span class="evwhen">${when}</span><span class="muted small">${fmtDT(e.starts)} 〜 ${fmtDT(e.ends)}</span></div>
    <div class="evhead"><div class="evpv">${stampSVG(sample, true, 84, { ev: e.frame })}</div><div class="evtt"><h4>${esc(e.name)}</h4>${e.notice ? `<p class="evnotice">${esc(e.notice)}</p>` : ''}<p class="muted small">${esc(E.targetText(e))}スタンプを押すと、限定の枠${e.frame.label ? `「${esc(e.frame.label)}」` : ''}が付きます。</p></div></div>
    ${e.desc ? `<p class="evdesc">${esc(e.desc)}</p>` : ''}
    ${e.special ? `<div class="evspecial">${stampSVG({ i: 'event-sp-' + e.id, n: e.special.label || '参加店', k: 5 }, true, 58, { ev: e.special })}<span>参加店（${E.EV.permitted.size}店）で押すと、特別な枠${e.special.label ? `「${esc(e.special.label)}」` : ''}になります。地図では輪が付いています。</span></div>` : ''}
    ${g ? `<div class="evgoal ${done ? 'done' : ''}"><div class="h"><b>${done ? `記念の称号「${esc(g.title)}」をもらいました` : `${g.count}軒で、記念の称号「${esc(g.title)}」`}</b><span>${Math.min(n, g.count)}/${g.count}軒</span></div><div class="bar"><i style="width:${Math.min(100, Math.round((n / g.count) * 100))}%"></i></div></div>` : ''}
    ${stamps.length ? `<div class="evstamps">${stamps.slice(0, 12).map((s) => `<button class="evst" data-id="${esc(s.i)}" aria-label="${esc(s.n)}">${stampSVG(s, true, 58, { ev: E.frameIn(e.id, s.i) })}</button>`).join('')}${stamps.length > 12 ? `<span class="muted small">ほか${stamps.length - 12}軒</span>` : ''}</div>` : (kind === 'live' ? '<p class="muted small">お試し歩きで押したスタンプには、枠は付きません。</p>' : '')}
    <div class="actions">${E.narrow(e) && kind !== 'done' ? `<button class="btn" data-evmap="${e.id}">${icon('map')}地図で対象の店を見る</button>` : ''}${kind !== 'soon' ? `<button class="btn" data-evshare="${e.id}">${icon('share')}シェア</button>` : ''}</div>
  </div>`;
}
function renderEvents() {
  const box = $('#event-list'); if (!box) return;
  const live = E.liveEvents(), soon = E.soonEvents(), ended = E.endedEvents();
  const past = Object.entries(S.evLog || {}).filter(([id]) => !E.EV.list.some((e) => String(e.id) === id));
  if (!live.length && !soon.length && !ended.length && !past.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = '<h3>イベント</h3>' + [...live.map((e) => eventCard(e, 'live')), ...soon.map((e) => eventCard(e, 'soon')), ...ended.map((e) => eventCard(e, 'done'))].join('')
    + (past.length ? `<details class="chap evpast"><summary>これまでのイベント（${past.length}）</summary>${past.map(([id, L]) => `<div class="evp"><b>${esc(L.name || 'イベント')}</b><span class="muted small">${Object.keys(L.s || {}).length}軒${(S.evTitles || []).some((t) => String(t.id) === id) ? '・記念の称号' : ''}</span></div>`).join('')}</details>` : '');
  $$('#event-list .evst').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.id)));
  $$('#event-list [data-evmap]').forEach((b) => b.addEventListener('click', () => {
    const e = E.EV.list.find((x) => String(x.id) === b.dataset.evmap); if (!e) return;
    const c = hasPos() ? { lat: POS.lat, lng: POS.lon } : MAP.center();
    let best = null, bd = Infinity; for (const s of STORES) { if (!E.isTarget(e, s)) continue; const d = dist(c.lat, c.lng, s.la, s.lo); if (d < bd) { bd = d; best = s; } }
    switchView('map'); if (best) { MAP.flyTo(best.lo, best.la, 13); toast(`いちばん近い対象の店：${best.n}（${fmtDist(bd)}）`); } else toast('対象の店が見つかりませんでした', 'warn');
  }));
  $$('#event-list [data-evshare]').forEach((b) => b.addEventListener('click', async () => {
    const e = E.EV.list.find((x) => String(x.id) === b.dataset.evshare); if (!e) return;
    const tags = [...new Set(['#本めぐり', ...String(e.hashtag || '').split(/\s+/).filter(Boolean)])].join(' ');
    const text = `${e.name}に参加中。${E.evCount(e.id)}軒の本屋・図書館でスタンプを押しました ${tags}`;
    try { if (navigator.share) { await navigator.share({ text }); G.noteShare('event', '', 'shared'); } else { await navigator.clipboard.writeText(text); toast('文をコピーしました', 'ok'); } } catch (err) { if (!(err && err.name === 'AbortError')) toast('シェアできませんでした', 'warn'); }
  }));
}
export function renderMissions() {
  renderEvents();
  const wk = weekKey(), d = todayISO(); const cw = S.claimedW[wk] || [], cd = S.claimedD[d] || [];
  $('#day-label').textContent = `${fmtDate(d)}`; $('#week-label').textContent = `${wk}・月曜から`;
  const mrow = (m, claimed, xp) => { const done = m.cur >= m.goal; return `<div class="m ${done ? 'done' : ''}"><div class="h"><b>${done ? '✅ ' : ''}${esc(m.name)}</b><span class="muted small">${Math.min(m.cur, m.goal)}/${m.goal}${claimed.includes(m.id) ? `　+${xp}ページ` : ''}</span></div><div class="bar"><i style="width:${Math.min(100, Math.round((m.cur / m.goal) * 100))}%"></i></div><div class="sub">${esc(m.sub)}</div></div>`; };
  $('#daily-list').innerHTML = G.dailyMissions().map((m) => mrow(m, cd, PG.daily)).join('');
  $('#mission-list').innerHTML = G.weeklyMissions().map((m) => mrow(m, cw, PG.weekly)).join('');
  let feats = [...FEAT.entries()].map(([p, id]) => ({ p, s: BYID.get(id) })).filter((x) => x.s);
  if (hasPos()) feats.sort((a, b) => dist(POS.lat, POS.lon, a.s.la, a.s.lo) - dist(POS.lat, POS.lon, b.s.la, b.s.lo)); else feats.sort((a, b) => PREFS.findIndex((x) => x[0] === a.p) - PREFS.findIndex((x) => x[0] === b.p));
  $('#feat-list').innerHTML = feats.slice(0, 6).map(({ p, s }) => `<div class="item" data-id="${esc(s.i)}"><div class="main"><div class="name"><span class="crown">👑</span> ${esc(s.n)}${(S.featDone[wk] || []).includes(s.i) ? ' <span class="badge shu">済</span>' : ''}</div><div class="sub">${esc(p)}　${esc(s.a || '')}</div></div><div class="dist">${hasPos() ? fmtDist(dist(POS.lat, POS.lon, s.la, s.lo)) : ''}</div></div>`).join('') + (feats.length > 6 ? `<div class="hint" style="padding:8px 4px 0">ほか${feats.length - 6}県。地図では紫の輪で出ます。</div>` : '');
  $$('#feat-list .item').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  $('#rally-list').innerHTML = G.rallyProgress().map((r) => `<div class="m ${r.done ? 'done' : ''}"><div class="h"><b>${r.done ? '🏆 ' : ''}${esc(r.name)}</b><span class="muted small">${r.got}/${r.stores.length}</span></div><div class="bar"><i style="width:${Math.round((r.got / r.stores.length) * 100)}%"></i></div><div class="sub">${esc(r.desc)}　称号「${esc(r.title)}」</div><div class="sub" style="margin-top:6px">${r.stores.map((id) => { const s = BYID.get(id); return s ? `<span class="badge ${G.hasStamp(id) ? 'shu' : ''}">${esc(s.n)}</span>` : ''; }).join('')}</div><div class="actions"><button class="btn" data-go="${esc(r.id)}">${icon('map')}地図で見る</button></div></div>`).join('') || emptyBox('flag', 'ラリーのデータがありません。');
  $$('#rally-list [data-go]').forEach((b) => b.addEventListener('click', () => { const r = RALLIES.find((x) => x.id === b.dataset.go); if (r) { switchView('map'); MAP.flyTo(r.lo, r.la, 14.5, { zoom: 14.5 }); } }));
  $('#ach-list').innerHTML = G.achievements().map((a) => `<div class="m ${a.ok ? 'done' : ''}"><div class="h"><b>${a.ok ? '🏅 ' : ''}${esc(a.name)}</b><span class="muted small">${a.cur}/${a.n}</span></div><div class="bar"><i style="width:${Math.round((a.cur / a.n) * 100)}%"></i></div><div class="sub">${esc(a.desc)}</div></div>`).join('');
}

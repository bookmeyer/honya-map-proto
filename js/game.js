// 遊びの仕組み：物語のページと巻・称号・実績・ミッション・ラリー・カード
import { REGULAR, WALK, volOf, TITLES, TITLES_OLD, ACHIEVEMENTS, PG } from './config.js?v=0.35.5';
import { queueMeet, queueMeetAttr } from './events.js?v=0.35.5';
import { todayISO, emit, prefOf, weekKey, weekStartISO } from './util.js?v=0.35.5';
import { S, save } from './state.js?v=0.35.5';
import { BYID, rarityOf, RALLIES, isFeat } from './data.js?v=0.35.5';

// 今日さいごに、射程内で押したスタンプ（お試し歩きは入れない）。店と店のあいだ・読書のはじまりで使う（v0.16.0）
export function lastNearVisitToday() { const today = todayISO(); for (let i = S.visits.length - 1; i >= 0; i--) { const v = S.visits[i]; if (v.d !== today) return null; if (v.near && !v.trial) return v; } return null; }
export const visitsOf = (id) => S.visits.filter((v) => v.s === id);
export const cardsOf = (id) => S.cards.filter((c) => c.s === id);
export const hasStamp = (id) => !!S.stamps[id];
export function stateOf(id) { const n = visitsOf(id).length + cardsOf(id).length; return n === 0 ? 0 : n >= 3 ? 2 : 1; }
// 常連度：その店で射程内スタンプを押した日数 → 段（0=まだ、1=はじめまして … 6=殿堂入り）
export const REGULAR_NAMES = REGULAR.map((r) => r.name);
const pagesToday = () => Math.floor((((S.days || {})[todayISO()] || {}).m || 0) / WALK.pageM);
const pagesTotal = () => Math.floor(Object.values(S.days || {}).reduce((a, r) => a + (r.m || 0), 0) / WALK.pageM);
export const regularDays = (id) => new Set(S.visits.filter((v) => v.s === id && v.near).map((v) => v.d)).size;
export function regularRank(days) { let r = 0; REGULAR.forEach((x, i) => { if (days >= x.n) r = i + 1; }); return r; }
export function regularInfo(id) { const days = regularDays(id); const rank = regularRank(days); const next = REGULAR[rank] || null; const base = rank ? REGULAR[rank - 1].n : 0; return { days, rank, name: rank ? REGULAR[rank - 1].name : '', next, toNext: next ? next.n - days : 0, pct: next ? Math.round(((days - base) / (next.n - base)) * 100) : 100 }; }
// 物語のページ（行動で増えた分＋歩いた分）と、いまの巻
export const storyPages = () => (S.pg || 0) + pagesTotal();
export const volume = () => volOf(storyPages());
export function addPages(n) { const before = volume(); S.pg = (S.pg || 0) + n; const d = todayISO(); S.pgDay = S.pgDay || {}; S.pgDay[d] = (S.pgDay[d] || 0) + n; const after = volume(); save(); emit('pages', { n, before, after }); return { before, after }; }
function bump(kind, n = 1) { const d = todayISO(); S.daily = S.daily || {}; S.daily[d] = S.daily[d] || {}; S.daily[d][kind] = (S.daily[d][kind] || 0) + n; }
const dailyCount = (kind) => ((S.daily || {})[todayISO()] || {})[kind] || 0;
// ---- 集計 ----
export function stats() {
  const ids = Object.keys(S.stamps); const sts = ids.map((id) => BYID.get(id)).filter(Boolean);
  const prefs = new Set(sts.map(prefOf)); const used = sts.filter((s) => s.u).length; const rare = sts.filter((s) => rarityOf(s) === 3).length;
  const visited = new Set([...S.visits.map((v) => v.s), ...S.cards.map((c) => c.s)]);
  const featTotal = Object.values(S.featDone).reduce((a, b) => a + b.length, 0);
  const days = {}; S.visits.filter((v) => v.near).forEach((v) => { (days[v.s] = days[v.s] || new Set()).add(v.d); }); const regMax = Math.max(0, ...Object.values(days).map((x) => x.size)); const regulars = Object.values(days).filter((x) => regularRank(x.size) >= 3).length;
  const look = Object.keys(S.looks || {}).length;
  const mapfix = Object.keys(S.mapFix || {}).length, mapadd = Object.keys(S.mapAdd || {}).length;
  // 読書・かくれ称号の数（v0.34.0）。読書は取り消した（off）ものと1分より短いものは数えない。かくれ称号は、お試し歩きのスタンプは数えない
  const rs = (S.reads || []).filter((r) => r && !r.off && r.min >= 1);
  const books = S.reading || [];
  const real = S.visits.filter((v) => v.near && !v.trial);
  const byDay = {}; real.forEach((v) => { (byDay[v.d] = byDay[v.d] || new Set()).add(v.s); });
  const hashigo = Math.max(0, ...Object.values(byDay).map((x) => x.size));
  const libbook = Object.values(byDay).some((x) => { let l = 0, b = 0; x.forEach((id) => { const s = BYID.get(id); if (s) { if (s.t === 'l') l = 1; else b = 1; } }); return l && b; }) ? 1 : 0;
  const early = real.some((v) => v.t && new Date(v.t).getHours() < 8) ? 1 : 0;
  return { mapfix, mapadd, mapall: mapfix + mapadd, stamps: ids.length, stores: visited.size, cards: S.cards.length, prefs: prefs.size, used, rare, featTotal, feat: featTotal, regMax, regulars, look, pages: pagesTotal(), libs: sts.filter((s) => s.t === 'l').length, rally: Object.keys(S.rallyDone).length, share: S.shareCount || 0, streak: streakWeeks(),
    reads: rs.length, readMin: rs.reduce((a, r) => a + (r.min || 0), 0), moveReads: rs.filter((r) => r.pl && r.pl.k === 'move').length, done: books.filter((b) => b && b.done).length, sato: books.filter((b) => b && b.sato).length, hashigo, libbook, early };
}
export function streakWeeks() {
  const weeks = new Set(Object.values(S.stamps).map((v) => weekKey(new Date(v.d)))); if (!weeks.size) return 0;
  let n = 0; const d = new Date(); const cur = weekKey(d); if (!weeks.has(cur)) d.setDate(d.getDate() - 7); // 今週まだなら先週から数える
  for (let i = 0; i < 200; i++) { if (!weeks.has(weekKey(d))) break; n++; d.setDate(d.getDate() - 7); }
  return n;
}
export function titles() { const st = stats(); const LBL = { stamps: 'スタンプ', prefs: '県', used: '古書店', rare: '秘境スタンプ', mapfix: '地図が直った報告', mapadd: '地図に入った店', mapall: '直した・広げた店', libs: '図書館のスタンプ', cards: 'カード', reads: '読書', moveReads: '移動読書', done: '読み終えた本', sato: '本の里帰り', streak: '週つづけてスタンプ' }; const U = { reads: '回', moveReads: '回', done: '冊', sato: '回', cards: '枚', streak: '' }; return TITLES.map((t) => ({ ...t, ok: (st[t.kind] ?? 0) >= t.n, need: t.need || (t.kind === 'regMax' ? `同じ店に${t.n}日` : t.kind === 'streak' ? `${t.n}週つづけてスタンプ` : `${LBL[t.kind] || ''}${t.n}${U[t.kind] || ''}`) })).concat(RALLIES.map((r) => ({ id: 'r_' + r.id, name: r.title, ok: !!S.rallyDone[r.id], need: r.name }))); }
// 名前の下に出る称号：いちばん最近もらった称号（v0.34.0。前は「一覧で最後のもの」だったので、称号を足すと急に変わった）。もらった日は S.titleAt（端末の中だけ）
export function currentTitle() { const t = titles().filter((x) => x.ok); if (!t.length) return ''; const at = S.titleAt || {}; let best = t[t.length - 1], bt = -1; t.forEach((x, i) => { const v = at[x.id] ?? 0; if (v > bt || (v === bt && i >= t.indexOf(best))) { best = x; bt = v; } }); return best.name; }
// もらった称号に、もらった時を付ける。新しくもらった称号を返す（お知らせ用）
// はじめて（S.titleAt がない人）は、前からある称号に前の順番を引きつぐ（名前の下の称号が変わらないように）。この版で足した称号でもう条件に届いているものは「いまもらった」にする
export function syncTitles() {
  const ok = titles().filter((x) => x.ok); const now = Date.now(); const fresh = [];
  if (!S.titleAt) { S.titleAt = {}; ok.forEach((x) => { const i = TITLES_OLD.indexOf(x.id); if (i >= 0 || x.id.startsWith('r_')) S.titleAt[x.id] = i >= 0 ? i + 1 : 50; }); }
  ok.forEach((x) => { if (S.titleAt[x.id] == null) { S.titleAt[x.id] = now; fresh.push(x); } });
  if (fresh.length) save();
  return fresh;
}
export function achievements() { const st = stats(); return ACHIEVEMENTS.map((a) => { const cur = st[a.kind] ?? 0; return { ...a, cur: Math.min(cur, a.n), ok: cur >= a.n }; }); }
// ---- ミッション ----
export function dailyMissions() {
  return [
    { id: 'd1', name: '今日、スタンプを1つ', sub: '店の射程内でスタンプを押す', cur: dailyCount('stamp'), goal: 1 },
    { id: 'd2', name: '本屋のページを3つ見る', sub: '地図やさがすから、店のページを開く', cur: ((S.daily || {})[todayISO()] || {}).lookIds ? S.daily[todayISO()].lookIds.length : 0, goal: 3 },
    { id: 'd3', name: '行きたい店を1つ', sub: '店のページで☆を付ける', cur: dailyCount('want'), goal: 1 },
    { id: 'd4', name: '今日、10ページ歩く', sub: '1km歩くと10ページ（現在地を追っているあいだと、店と店のあいだ）', cur: pagesToday(), goal: 10 },
  ];
}
export function weeklyMissions() {
  const ws = weekStartISO(); const wk = weekKey();
  const weekStamps = Object.entries(S.stamps).filter(([, v]) => v.d >= ws).map(([id]) => BYID.get(id)).filter(Boolean);
  const prefsBefore = new Set(Object.entries(S.stamps).filter(([, v]) => v.d < ws).map(([id]) => BYID.get(id)).filter(Boolean).map(prefOf));
  const newPrefs = new Set(weekStamps.map(prefOf).filter((p) => !prefsBefore.has(p)));
  const wd = {}; S.visits.filter((v) => v.near && v.d >= ws).forEach((v) => { (wd[v.s] = wd[v.s] || new Set()).add(v.d); }); const weekSameStore = Math.max(0, ...Object.values(wd).map((x) => x.size));
  return [
    { id: 'w1', name: 'スタンプを3つ集める', sub: '今週、射程内で押したスタンプの数', cur: weekStamps.length, goal: 3 },
    { id: 'w2', name: '古書店でスタンプを1つ', sub: '古書店のピンは灰色がかった色', cur: weekStamps.filter((s) => s.u).length, goal: 1 },
    { id: 'w3', name: '初めての県でスタンプを1つ', sub: 'まだスタンプのない県の本屋へ', cur: newPrefs.size, goal: 1 },
    { id: 'w4', name: '本と出会う', sub: '今週、カードを1枚', cur: S.cards.filter((c) => c.d >= ws).length, goal: 1 },
    { id: 'w5', name: '今週の推し店でスタンプを1つ', sub: '紫の輪の店（県ごとに1店）', cur: (S.featDone[wk] || []).length, goal: 1 },
    ...(S.settings.showLib === false ? [] : [{ id: 'w7', name: '図書館でスタンプを1つ', sub: '図書館のピンは緑色', cur: weekStamps.filter((s) => s.t === 'l').length, goal: 1 }]),
    { id: 'w6', name: '同じ店にもう一度', sub: '今週、同じ店で2日スタンプを押す（通う人の味方）', cur: weekSameStore, goal: 2 },
  ];
}
export function checkRewards() {
  const rewards = []; const wk = weekKey(); const d = todayISO();
  S.claimedW[wk] = S.claimedW[wk] || []; S.claimedD[d] = S.claimedD[d] || [];
  for (const m of dailyMissions()) if (m.cur >= m.goal && !S.claimedD[d].includes(m.id)) { S.claimedD[d].push(m.id); addPages(PG.daily); rewards.push(`今日のお題「${m.name}」 +${PG.daily}ページ`); }
  for (const m of weeklyMissions()) if (m.cur >= m.goal && !S.claimedW[wk].includes(m.id)) { S.claimedW[wk].push(m.id); addPages(PG.weekly); rewards.push(`今週のお題「${m.name}」 +${PG.weekly}ページ`); }
  const sk = streakWeeks(); S.streakClaimed = S.streakClaimed || {}; if (sk >= 2 && !S.streakClaimed[wk]) { S.streakClaimed[wk] = sk; addPages(PG.streak); rewards.push(`${sk}週つづけて本屋へ +${PG.streak}ページ`); }
  for (const r of RALLIES) { if (!S.rallyDone[r.id] && r.stores.every((id) => hasStamp(id))) { S.rallyDone[r.id] = d; addPages(PG.rally); rewards.push(`ラリー制覇「${r.name}」 称号「${r.title}」 +${PG.rally}ページ`); } }
  // 古い日の記録は間引く
  if (S.daily) for (const k of Object.keys(S.daily)) if (k < d.slice(0, 7)) delete S.daily[k];
  if (rewards.length) save(); return rewards;
}
export function rallyProgress() { return RALLIES.map((r) => ({ ...r, got: r.stores.filter((id) => hasStamp(id)).length, done: !!S.rallyDone[r.id] })); }
// ---- チェックイン（スタンプ） ----
export function checkin(st, { near, memo, trial }) {
  const today = todayISO(); const stampedBefore = hasStamp(st.i); const visitedToday = visitsOf(st.i).some((v) => v.d === today);
  const feat = isFeat(st.i); const wk = weekKey(); const featGot = (S.featDone[wk] || []).includes(st.i);
  const regBefore = regularRank(regularDays(st.i)); let regUp = 0;
  S.visits.push({ s: st.i, n: st.n, d: today, t: Date.now(), near, memo, trial: trial ? 1 : 0, m: ((S.days || {})[today] || {}).m || 0 }); // m：この時点までに今日歩いた距離（v0.14）
  let gain = 0, isNew = false; const r = rarityOf(st); const extras = [];
  if (near) {
    if (!stampedBefore) { S.stamps[st.i] = { d: today, r, trial: trial ? 1 : 0 }; isNew = true; gain += PG.shuFirst + (r === 3 ? PG.rare3 : r === 2 ? PG.rare2 : 0); bump('stamp'); }
    else gain += visitedToday ? 0 : PG.shuRepeat;
    if (feat && !featGot) { S.featDone[wk] = S.featDone[wk] || []; S.featDone[wk].push(st.i); gain += PG.feat; extras.push(`👑 今週の推し店 +${PG.feat}ページ`); }
    const regAfter = regularRank(regularDays(st.i)); if (regAfter > regBefore && regAfter >= 2) { regUp = regAfter; const x = PG.regular[regAfter - 1] || 0; gain += x; extras.push(`🏮 この店の常連度が「${REGULAR[regAfter - 1].name}」に（来店${regularDays(st.i)}日） +${x}ページ`); }
  } else gain += visitsOf(st.i).length <= 1 ? PG.sumiFirst : (visitedToday ? 0 : PG.sumiRepeat);
  const lv = addPages(gain); save();
  const rewards = [...extras, ...checkRewards()]; lv.after = volume(); // お題の分で巻が上がっても、この画面で知らせる
  emit('records'); if (isNew) emit('stamp-new', { trial: !!trial }); /* 最初のスタンプのあとの声かけ（v0.28.0） */ return { gain, isNew, lv, rewards, r, regUp };
}
export function toggleWant(id) { const i = S.wants.indexOf(id); if (i >= 0) S.wants.splice(i, 1); else { S.wants.push(id); bump('want'); } save(); const rewards = checkRewards(); emit('records'); return { on: i < 0, rewards }; }
// ---- カード（本との出会い） ----
export function cardBonus(st) { const today = todayISO(); const inStore = !!(S.stamps[st.i] && S.stamps[st.i].d === today) || visitsOf(st.i).some((v) => v.d === today && v.near); return { inStore, total: PG.card + (inStore ? PG.cardInStore : 0) }; }
export function noteLook(id) { const st = BYID.get(id); if (!st || st.demo) return []; const d = todayISO(); S.daily = S.daily || {}; S.daily[d] = S.daily[d] || {}; const a = (S.daily[d].lookIds = S.daily[d].lookIds || []); S.looks = S.looks || {}; if (!S.looks[id]) S.looks[id] = d; if (!a.includes(id)) { a.push(id); save(); return checkRewards(); } return []; }
export function makeCard(st, book, why, pub) {
  const { total } = cardBonus(st); const today = todayISO();
  S.cards.push({ id: 'c' + Date.now(), s: st.i, sn: st.n, d: today, t: Date.now(), isbn: book ? book.isbn : '', title: book.title, author: book.author || '', publisher: book.publisher || '', cover: book.cover || '', why, pub: pub ? 1 : 0 });
  if (book && book.isbn && !st.demo && !st.custom) { queueMeet(st.i, String(book.isbn).replace(/[^0-9X]/gi, '').toUpperCase()); queueMeetAttr(book.isbn); } // どの店でどの本に出会ったか（v0.26.0・端末の番号なしで送る）／世代・性別は別に、時間をおいて（v0.29.0。店・日なし）
  bump('card'); const lv = addPages(total); save(); const rewards = checkRewards(); lv.after = volume(); emit('records'); return { total, lv, rewards };
}
export function deleteCard(id) { S.cards = S.cards.filter((x) => x.id !== id); save(); emit('records'); }
export function noteShare(kind = '', sid = '', r = 'shared') { S.shareCount = (S.shareCount || 0) + 1; S.shares = S.shares || []; S.shares.push({ t: Date.now(), d: todayISO(), kind, s: sid, r }); if (S.shares.length > 500) S.shares.splice(0, S.shares.length - 500); save(); checkRewards(); emit('records'); }

// 本屋・図書館・ラリーのデータ。スタンプ（その店だけの絵柄）の見た目もここ
import { DEMO_STORE } from './config.js?v=0.17.1';
import { sleep, $, weekKey, prefOf, hash32, esc, todayISO } from './util.js?v=0.17.1';
import { S } from './state.js?v=0.17.1';

export let STORES = [];
export let RALLIES = [];
export const BYID = new Map();
export const FEAT = new Map(); // 県 → 今週の推し店の id
let baseLoaded = false;
async function fetchJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (e) {}
    await sleep(400 * (i + 1));
  }
  return null;
}
export async function loadAll() {
  const [base, libs, rallies, picks] = await Promise.all([fetchJSON('data/bookstores.json'), fetchJSON('data/libraries.json'), fetchJSON('data/rallies.json'), fetchJSON('data/picks.json', 2)]);
  baseLoaded = Array.isArray(base) && base.length > 0; LIBS = Array.isArray(libs) ? libs : [];
  RALLIES = Array.isArray(rallies) ? rallies : [];
  applyPicks(picks && Array.isArray(picks.picks) ? picks.picks : [], baseLoaded ? base : []);
  rebuild(baseLoaded ? base : []);
  return { ok: baseLoaded, count: STORES.length };
}
let BASE = [], LIBS = [];
// ---- みんなの地図への直し（v0.17.0）：運営が報告を確かめて直した閉店・名前（サーバーの events.php の fixes。events.js が渡す）----
// 閉店した店は地図・さがす・近くから外す。ただしスタンプや来た記録の表示のために BYID には残す（closed: 1）
let FIX = { closed: new Set(), rename: new Map(), key: '' };
export function setFixes(closed, rename) {
  const key = JSON.stringify([closed, [...rename]]); if (key === FIX.key) return false;
  FIX = { closed: new Set(closed), rename, key }; rebuild(); return true;
}
// ---- 書店員さんの1冊（v0.11）。お店に確かめて、許可をいただいた店だけ data/picks.json に書く ----
// 書名・著者・ひとことは誰でも見られる。スタンプの本の印は、その店の射程内で押した人だけ（お試し歩きは入らない。見本の店は入る）
// 手書きのカード（写真）は picks.json にも GitHub にも置かない。サーバーの管理画面から入れ、押した記録がある端末にだけ渡す（v0.16.1。events.js loadCard）
function applyPicks(list, base) {
  const by = new Map(list.filter((p) => p && p.store && p.title).map((p) => [p.store, p]));
  for (const s of [...base, ...LIBS]) { const p = by.get(s.i); if (p) s.rec = { who: p.who || '書店員さん', title: p.title, author: p.author || '', isbn: p.isbn || '', say: p.say || '', shelf: p.shelf || '', d: p.d || '' }; } // photo（写真のアドレス）は読まない（v0.16.1）
}
export const pickOpen = (st) => !!(st && st.rec) && S.visits.some((v) => v.s === st.i && v.near && (st.demo || !v.trial));
export const bookTitle = (t) => `『${String(t || '').replace(/^『/, '').replace(/』$/, '')}』`;
export const isLib = (st) => !!st && st.t === 'l';
export const placeWord = (st) => (isLib(st) ? '図書館' : '店');
export function rebuild(base) {
  if (base) BASE = base;
  const libs = S.settings.showLib === false ? [] : LIBS;
  const all = [DEMO_STORE, ...BASE, ...libs, ...S.custom.map((c) => Object.assign({}, c, { custom: 1 }))].filter((s) => !S.hidden[s.i]);
  // 名前：この端末で直した名前 → 運営が直した名前（「名前を確認ずみ」）→ 地図データの名前
  const named = (s) => { const own = S.renames && S.renames[s.i]; const fx = FIX.rename.get(s.i); return own ? Object.assign({}, s, { n: own.n, fix: 1 }) : fx ? Object.assign({}, s, { n: fx, ov: 1 }) : s; };
  STORES = all.filter((s) => !FIX.closed.has(s.i)).map(named);
  BYID.clear(); STORES.forEach((s) => BYID.set(s.i, s));
  for (const s of all) if (FIX.closed.has(s.i)) BYID.set(s.i, Object.assign(named(s), { closed: 1 })); // 閉店：記録の表示のためだけに残す
  computeFeatured();
}
// 支店名のない店（「TSUTAYA」「未来屋書店」だけの名前）は、今週の推し店に選ばない（どの店か分からないため。v0.13）
const BRAND_ONLY = /^(TSUTAYA|TSUTAYA BOOKSTORE|蔦屋書店|BOOKOFF|ブックオフ|未来屋書店|くまざわ書店|紀伊國屋書店|紀伊国屋書店|今井書店|平安堂|宮脇書店|明屋書店|文教堂|ゲオ|GEO|古本市場|ふるいち|WonderGOO|ヴィレッジヴァンガード|コーチャンフォー|リブロ|三省堂書店|有隣堂|精文館書店|喜久屋書店|ブックファースト|丸善|ジュンク堂書店|明林堂書店|田村書店|啓文堂書店|メロンブックス|とらのあな|BOOKS|Books|本屋|書店|古本屋|古書店)$/i;
export function computeFeatured() {
  const wk = weekKey(); const byPref = {};
  // 今週の推し店は本屋だけ（図書館・見本・自分で足した店は入れない）
  for (const s of STORES) { if (s.demo || s.custom || s.t === 'l' || BRAND_ONLY.test(String(s.n).normalize('NFKC').trim())) continue; const p = prefOf(s); (byPref[p] = byPref[p] || []).push(s); }
  FEAT.clear();
  for (const [p, arr] of Object.entries(byPref)) { arr.sort((a, b) => (a.i < b.i ? -1 : 1)); FEAT.set(p, arr[hash32(wk + '|' + p) % arr.length].i); }
}
export const isFeat = (id) => { for (const v of FEAT.values()) if (v === id) return true; return false; };
export function search(q, limit = 20) {
  const words = q.trim().split(/[\s　]+/).filter(Boolean); if (!words.length) return [];
  return STORES.filter((s) => { const hay = (s.n || '') + ' ' + (s.a || '') + ' ' + prefOf(s); return words.every((w) => hay.includes(w)); }).slice(0, limit);
}
export function addCustom(st) { S.custom.push(st); const full = Object.assign({}, st, { custom: 1 }); STORES.push(full); BYID.set(st.i, full); }
export function hideStore(st) { S.hidden[st.i] = { d: todayISO(), n: st.n }; STORES = STORES.filter((s) => s.i !== st.i); BYID.delete(st.i); computeFeatured(); }
export function unhideAll() { S.hidden = {}; S.renames = {}; rebuild(); }
export function renameStore(st, name) { S.renames[st.i] = { n: name, old: st.n, d: todayISO() }; rebuild(); }
export const DATA_DATE = '2026-10-12';
// ---- レア度（秘境度） ----
export function rarityOf(st) { if (st.demo) return 3; const k = st.k == null ? 3 : st.k; return k === 0 ? 3 : k <= 6 ? 2 : 1; }
export function rarityText(st) { const r = rarityOf(st); if (st.demo) return 'めったにないスタンプ（見本）'; if (st.k == null) return '街のスタンプ'; const w = isLib(st) ? '図書館' : '本屋', u = isLib(st) ? '館' : '店'; return r === 3 ? `秘境スタンプ（周り5kmに${w}なし）` : r === 2 ? `街のスタンプ（周り5kmに${w} ${st.k}${u}）` : `ふつうのスタンプ（周り5kmに${w} ${st.k}${u}）`; }
// ---- スタンプの見た目 ----
// 店ごとに、形（角丸・丸・六角）・地の色（6色）・絵柄（本にまつわる12種）が決まる。白いふち＋墨の輪郭の「シール」（v0.9 ポップ・ラリー）
const INKS = [['#FF6A48', '#1B1B1B'], ['#2F9BFF', '#FFFFFF'], ['#4FC07A', '#1B1B1B'], ['#FFD447', '#1B1B1B'], ['#A86CFF', '#FFFFFF'], ['#FF7AB6', '#1B1B1B']]; // 地の色・絵柄の色
const BURST = '99,50 88.8,66.1 84.7,84.7 66.1,88.8 50,99 33.9,88.8 15.3,84.7 11.2,66.1 1,50 11.2,33.9 15.3,15.3 33.9,11.2 50,1 66.1,11.2 84.7,15.3 88.8,33.9'; // 秘境スタンプの光の輪
const PICTS = [
  '<path d="M4 8q8-4 16 0v24q-8-4-16 0z"/><path d="M20 8q8-4 16 0v24q-8-4-16 0z"/>', // 開いた本
  '<rect x="6" y="25" width="28" height="8" rx="2"/><rect x="9" y="15" width="24" height="8" rx="2"/><rect x="12" y="5" width="20" height="8" rx="2"/>', // 積んだ本
  '<rect x="4" y="4" width="32" height="32" rx="3"/><path d="M11 10v26M18 7v29M25 12v24M31 9v27"/>', // 本棚
  '<path d="M11 4h18v32l-9-7-9 7z"/>', // しおり
  '<circle cx="12" cy="25" r="7"/><circle cx="28" cy="25" r="7"/><path d="M19 25h2M5 24l-2-9M35 24l2-9"/>', // 眼鏡
  '<path d="M14 5h12l5 15H9zM20 20v12M12 34h16"/>', // ランプ
  '<path d="M8 15h22v11a8 8 0 0 1-8 8h-6a8 8 0 0 1-8-8z"/><path d="M30 18h3a4 4 0 0 1 0 8h-3M14 5q2 3 0 6M21 5q2 3 0 6"/>', // コーヒー
  '<path d="M4 20 36 6 26 36l-6-12zM20 24 36 6"/>', // 紙ひこうき
  '<path d="M8 32 30 10l4 4L12 36zM8 32l-1 5 5-1M26 14l4 4"/>', // 鉛筆
  '<path d="M22 6a14 14 0 1 0 12 20A11 11 0 0 1 22 6z"/><path d="M31 7l1.4 3 3.2.4-2.3 2.2.6 3.2-2.9-1.6-2.9 1.6.6-3.2-2.3-2.2 3.2-.4z"/>', // 月と星
  '<path d="M8 32C8 14 20 6 34 6c0 16-10 26-26 26z"/><path d="M8 32c8-8 14-14 22-22"/>', // 葉
  '<path d="M4 22a16 16 0 0 1 32 0zM20 22v10a4 4 0 0 1-8 0M20 6v-2"/>', // 傘
];
// ---- スタンプの帯の名前 ----
// 言葉の途中で切らない（「コーチャンフォー」が「コーチャンフ」にならないように。v0.9.2）。
// 名前の最初のまとまり（空白や「・」「（」の前）を使う。幅9までは1行。長いときは2行にし、
// 「書店」「市立」「図書館」などの前後や、ひらがな・カタカナ・漢字・英字の変わり目のうち、2行の長さがそろうところで分ける
// 幅は全角1。英字は Mochiy Pop P One で測った幅（大文字0.85・小文字0.66・数字0.74）より少し広めに見積もる
const cwOf = (ch) => (/[A-Z]/.test(ch) ? 0.9 : /[a-z]/.test(ch) ? 0.7 : /[0-9]/.test(ch) ? 0.78 : ch === ' ' ? 0.3 : /[!-~]/.test(ch) ? 0.6 : 1);
const widthOf = (s) => { let w = 0; for (const ch of s) w += cwOf(ch); return w; };
const LABEL_STRIP = /(株式会社|有限会社|\(株\)|（株）|\(財\)|（財）|\(社\)|（社）|公益財団法人|一般財団法人|公益社団法人|一般社団法人|財団法人|社団法人|学校法人|特定非営利活動法人|NPO法人)/g;
const LABEL_KEY = /(ブックセンター|ブックストア|ブックス|ライブラリー|センター|イオンモール|モール|タウン|TSUTAYA|BOOKS|Books|ふるいち|書店|書房|書林|書院|文庫|図書館|図書室|図書|協会|市立|町立|村立|区立|県立|都立|府立|道立|堂|屋|館|(?:市|町|村|区)(?![民立内場街役営政]))/g;
const NO_HEAD = 'ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ、。・）」』！？!?の';
const clsOf = (ch) => (/[ぁ-ゖ]/.test(ch) ? 'h' : /[ァ-ヺ]/.test(ch) ? 'k' : /[一-龥々〆]/.test(ch) ? 'c' : /[A-Za-z0-9Ａ-Ｚａ-ｚ０-９]/.test(ch) ? 'a' : 's');
const LINE_MAX = 12;
export function stampLabel(n) {
  let s = String(n).replace(LABEL_STRIP, '').trim().split(/[\s　]+/)[0] || '本';
  const cut = s.search(/[・「『（(;；／/]/); if (cut > 0 && widthOf(s.slice(0, cut)) >= 2) s = s.slice(0, cut);
  const W = widthOf(s); if (W <= 9) return [s];
  const chars = [...s]; const at = (i) => widthOf(chars.slice(0, i).join(''));
  const cand = new Map(); // 分ける位置 → 優先の度合い
  const add = (i, bonus) => { if (i > 0 && i < chars.length && !NO_HEAD.includes(chars[i])) cand.set(i, Math.max(cand.get(i) || 0, bonus)); };
  for (const m of s.matchAll(LABEL_KEY)) { const a = [...s.slice(0, m.index)].length; add(a + [...m[0]].length, 0.6); add(a, 0.3); }
  const cls = []; chars.forEach((ch, i) => { cls[i] = ch === 'ー' && i ? cls[i - 1] : clsOf(ch); });
  chars.forEach((ch, i) => { if ('ケヶノ'.includes(ch) && cls[i - 1] === 'c' && clsOf(chars[i + 1] || '') === 'c') cls[i] = 'c'; }); // 「香里ケ丘」「虎ノ門」は地名のひとまとまり
  for (let i = 1; i < chars.length; i++) if ((cls[i] !== cls[i - 1] && cls[i] !== 's') || (/[a-z]/.test(chars[i - 1]) && /[A-Z]/.test(chars[i]))) add(i, 0.3); // 「VillageVangard」の大文字の前も
  let best = -1, bestS = Infinity;
  for (const [i, bonus] of cand) { const a = at(i); if (a > LINE_MAX || W - a > LINE_MAX) continue; const sc = Math.abs(a - W / 2) - bonus; if (sc < bestS || (sc === bestS && i > best)) { bestS = sc; best = i; } }
  if (best < 0) { // 切れ目がなければ、真ん中に近いところ
    const idx = []; for (let i = 1; i < chars.length; i++) idx.push(i);
    idx.sort((p, q) => Math.abs(at(p) - W / 2) - Math.abs(at(q) - W / 2) || p - q);
    const mid = idx.find((i) => !NO_HEAD.includes(chars[i])) || Math.ceil(chars.length / 2);
    if (Math.max(at(mid), W - at(mid)) <= LINE_MAX) best = mid;
    else { for (const [i] of cand) if (at(i) <= LINE_MAX && i > best) best = i; if (best < 0) best = mid; } // 2行にも収まらないときは、1行目を切れ目まで（2行目は「…」で終える）
  }
  const clip = (t) => { if (widthOf(t) <= LINE_MAX) return t; let out = '', w = 0; for (const ch of t) { if (w + cwOf(ch) > LINE_MAX - 1) break; out += ch; w += cwOf(ch); } return out + '…'; };
  return [clip(chars.slice(0, best).join('')), clip(chars.slice(best).join(''))];
}
const hsl = (h, s, l) => `hsl(${h} ${Math.max(0, Math.min(100, s))}% ${Math.max(0, Math.min(100, l))}%)`;
export function stampInk(st) { const h = hash32(st.i); const [main, pic] = INKS[(h >>> 16) % INKS.length]; return { main, dark: '#1B1B1B', light: '#FFFFFF', pic }; }
export function stampSVG(st, collected, size = 96, opts = {}) {
  const h = hash32(st.i); const shape = h % 3; const pict = PICTS[(h >>> 8) % PICTS.length]; const [main, picCol] = INKS[(h >>> 16) % INKS.length]; const r = rarityOf(st); const rank = opts.rank || 0;
  const id = 'k' + h.toString(36) + (collected ? 'c' : 'u') + (opts.sfx || '');
  const EDGE = '#1B1B1B'; const fill = collected ? main : '#ECE6DA', pic = collected ? picCol : '#BDB5A8', edge = collected ? EDGE : '#A69E91', nameCol = collected ? EDGE : '#A69E91';
  const outer = shape === 0 ? '<rect x="8" y="8" width="84" height="84" rx="22"/>' : shape === 1 ? '<circle cx="50" cy="50" r="42"/>' : '<path d="M50 7L87 28v44L50 93 13 72V28z"/>';
  const lines = stampLabel(st.n); const lw = lines.map(widthOf); const two = lines.length > 1;
  const fs = two ? Math.max(7.5, Math.min(10.5, 66 / Math.max(...lw))) : Math.max(8.4, Math.min(13, 66 / lw[0]));
  const FONT = `font-size="${+fs.toFixed(2)}" font-family="'Mochiy Pop P One','Zen Maru Gothic','Hiragino Sans',sans-serif" fill="${nameCol}"`;
  const squeeze = (w) => (w * fs > 68 ? ' textLength="66" lengthAdjust="spacingAndGlyphs"' : ''); // 帯からはみ出しそうなときだけ横に詰める
  const label = two
    ? `<rect x="13" y="58" width="74" height="29" rx="11" fill="#FFFFFF" stroke="${edge}" stroke-width="1.5"/><text x="50" y="65.6" text-anchor="middle" dominant-baseline="central" ${FONT}${squeeze(lw[0])}>${esc(lines[0])}</text><text x="50" y="79.4" text-anchor="middle" dominant-baseline="central" ${FONT}${squeeze(lw[1])}>${esc(lines[1])}</text>`
    : `<rect x="13" y="63" width="74" height="19" rx="9.5" fill="#FFFFFF" stroke="${edge}" stroke-width="1.5"/><text x="50" y="72.5" text-anchor="middle" dominant-baseline="central" ${FONT}${squeeze(lw[0])}>${esc(lines[0])}</text>`;
  // 秘境（★3）は檸檬の光の輪、街（★2）は白い二重のふち
  const ring = !collected ? '' : r === 3 ? `<polygon points="${BURST}" fill="#FFD447" stroke="${EDGE}" stroke-width="1.5" stroke-linejoin="round"/>` : r === 2 ? `<g transform="translate(50 50) scale(1.1) translate(-50 -50)" fill="#FFFFFF" stroke="${EDGE}" stroke-width="1.5">${outer}</g>` : '';
  const star = (x, y, s, f) => `<path transform="translate(${x} ${y}) scale(${s})" fill="${f}" stroke="${EDGE}" stroke-width="1.4" stroke-linejoin="round" d="M0-9l2.6 5.4 6 .8-4.4 4.2 1.1 5.9L0 4.5l-5.3 2.8 1.1-5.9-4.4-4.2 6-.8z"/>`;
  const crown = (x, y, s, f) => `<g transform="translate(${x} ${y}) scale(${s})"><path fill="${f}" stroke="${EDGE}" stroke-width="1.4" stroke-linejoin="round" d="M-9 6l-3-11 6 4 6-9 6 9 6-4-3 11z"/></g>`;
  const marks = collected ? (rank >= 4 ? crown(78, 15, 0.85, '#FFD447') : rank >= 3 ? crown(78, 15, 0.72, '#FFFFFF') : rank >= 2 ? star(79, 15, 0.6, '#FFFFFF') : '') : '';
  // 書店員さんの1冊の店で、射程内で押した人だけ：左上に本の印（v0.11）
  const pkMark = collected && st.rec && pickOpen(st) ? `<g transform="translate(21 15)"><circle r="8.6" fill="#FFFFFF" stroke="${EDGE}" stroke-width="1.4"/><path d="M-5.6-3.4q2.8-1.5 5.6 0v7q-2.8-1.5-5.6 0zM0-3.4q2.8-1.5 5.6 0v7q-2.8-1.5-5.6 0z" fill="#FF6A48" stroke="${EDGE}" stroke-width="1" stroke-linejoin="round"/></g>` : '';
  // イベントの限定の枠（v0.10）：外側に色の帯、上に言葉のリボン。枠があるときは中身を少し小さくする
  const ef = collected && opts.ev && /^#[0-9A-Fa-f]{6}$/.test(opts.ev.color || '') ? opts.ev : null;
  const evBand = ef ? `<g fill="none" stroke="${EDGE}" stroke-width="17" stroke-linejoin="round">${outer}</g><g fill="none" stroke="${ef.color}" stroke-width="14" stroke-linejoin="round">${outer}</g>` : '';
  const evLabel = ef && ef.label ? (() => { const lw = Math.min(76, Math.max(30, widthOf(ef.label) * 8.6 + 14)); return `<rect x="${50 - lw / 2}" y="0.8" width="${lw}" height="15" rx="7.5" fill="${ef.color}" stroke="${EDGE}" stroke-width="1.5"/><text x="50" y="8.4" text-anchor="middle" dominant-baseline="central" font-size="8.4" font-family="'Mochiy Pop P One','Zen Maru Gothic','Hiragino Sans',sans-serif" fill="${EDGE}">${esc(ef.label)}</text>`; })() : '';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-label="${esc(st.n)}のスタンプ"><defs><clipPath id="c${id}">${outer}</clipPath></defs>${ef ? '<g transform="translate(50 52) scale(.86) translate(-50 -50)">' : ''}${ring}${evBand}<g fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linejoin="round">${outer}</g><g fill="${fill}" stroke="${edge}" stroke-width="2.5" stroke-linejoin="round"${collected ? '' : ' stroke-dasharray="5 3"'}>${outer}</g><ellipse cx="38" cy="22" rx="22" ry="9" fill="#fff" opacity="${collected ? '.22' : '.3'}" clip-path="url(#c${id})"/><g transform="translate(30 ${two ? 13 : 15})" fill="none" stroke="${pic}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${pict}</g>${label}${marks}${pkMark}${ef ? '</g>' : ''}${evLabel}</svg>`;
}
// ---- 本（openBD） ----
const bookCache = new Map();
const fromOpenbd = (isbn, s) => ({ isbn, title: s.title || '', author: cleanAuthor(s.author || ''), publisher: s.publisher || '', pubdate: s.pubdate || '', cover: s.cover || '' });
export async function lookupIsbn(isbn) {
  if (bookCache.has(isbn)) return bookCache.get(isbn);
  try {
    const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`); const j = await r.json(); const s = j && j[0] && j[0].summary; if (!s) { bookCache.set(isbn, null); return null; }
    const b = fromOpenbd(isbn, s); bookCache.set(isbn, b); return b;
  } catch (e) { return null; }
}
// 表紙をまとめて（openBD に1回で聞く）。見つかった本は覚えておき、選んだときにそのまま使う
export async function coversOf(isbns) {
  const need = [...new Set(isbns.filter((i) => i && !bookCache.has(i)))].slice(0, 50);
  if (need.length) { try { const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${need.join(',')}`); const j = await r.json(); need.forEach((i, k) => { const s = Array.isArray(j) && j[k] && j[k].summary; bookCache.set(i, s ? fromOpenbd(i, s) : null); }); } catch (e) {} }
  return new Map(isbns.map((i) => [i, (bookCache.get(i) || {}).cover || '']));
}
// ---- 書名でさがす（v0.16.2）：国立国会図書館サーチ ----
// 国立国会図書館の蔵書（dpid=iss-ndl-opac）だけを使う：CC BY 4.0 で、会社で使っても申請は要らない。出典は「このアプリについて」とさがした画面に
// 送るのは、さがす言葉だけ。返ってくるのは書名の順なので、ここで近いものを上にする（同じ書名 → 書名のはじめ → 言葉が書名に入っている → 著者・出版社に入っている → 新しい）
const NDL_API = 'https://ndlsearch.ndl.go.jp/api/opensearch';
const nz = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s・･、。，,.:;!?！？"'“”‘’「」『』()（）\[\]［］【】〈〉《》\-‐‑–—―~〜]/g, '');
export function toIsbn13(s) {
  const d = String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (/^97[89]\d{10}$/.test(d)) return d;
  if (!/^\d{9}[\dX]$/.test(d)) return '';
  const b = '978' + d.slice(0, 9); let sum = 0; for (let i = 0; i < 12; i++) sum += +b[i] * (i % 2 ? 3 : 1);
  return b + ((10 - (sum % 10)) % 10);
}
function ndlName(s) { // 「宮島, 未奈, 1983-」→「宮島未奈」、「Rowling, J. K, 1965-」→「J. K Rowling」
  const p = String(s || '').split(/,\s*/).map((x) => x.trim()).filter((x) => x && !/^(生没年不詳|\d{3,4}\??-?(\d{3,4}\??)?)$/.test(x));
  if (p.length < 2) return p.join('');
  return /[^\x00-\x7F]/.test(p[0]) ? p[0] + p[1] : `${p[1]} ${p[0]}`;
}
async function ndlQuery(params, ms = 12000) { // { total（あてはまる数）, items（cnt まで） }
  const u = new URL(NDL_API); Object.entries(Object.assign({ dpid: 'iss-ndl-opac', mediatype: 'books', cnt: '20' }, params)).forEach(([k, v]) => u.searchParams.set(k, v));
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(u.toString(), { signal: ctl.signal }); if (!r.ok) throw new Error('http ' + r.status);
    const doc = new DOMParser().parseFromString(await r.text(), 'application/xml');
    const total = +((doc.getElementsByTagName('openSearch:totalResults')[0] || {}).textContent || 0);
    const items = [...doc.getElementsByTagName('item')].map((it) => {
      const one = (n) => { const e = it.getElementsByTagName(n)[0]; return e ? e.textContent.trim() : ''; };
      const isbn = [...it.getElementsByTagName('dc:identifier')].filter((e) => e.getAttribute('xsi:type') === 'dcndl:ISBN').map((e) => toIsbn13(e.textContent)).find(Boolean) || '';
      const title = one('dc:title') || one('title'); const vol = one('dcndl:volume');
      const year = +(((one('dcterms:issued') || one('dc:date')).match(/\d{4}/) || [0])[0]);
      const author = [...new Set([...it.getElementsByTagName('dc:creator')].map((e) => ndlName(e.textContent)).filter(Boolean))].slice(0, 3).join('、');
      return { isbn, title: vol && !title.includes(vol) ? `${title} ${vol}` : title, base: title.split(' : ')[0], author, publisher: one('dc:publisher'), year };
    }).filter((b) => b.title);
    return { total, items };
  } finally { clearTimeout(tm); }
}
// ISBN から本の情報：openBD → なければ国立国会図書館サーチ（バーコードで読んだのに名前が出ない、を減らす）
export async function lookupBook(isbn) {
  const b = await lookupIsbn(isbn); if (b) return b;
  try { const r = (await ndlQuery({ isbn, cnt: '1' })).items[0]; if (r) { const nb = { isbn, title: r.title, author: r.author, publisher: r.publisher, pubdate: r.year ? String(r.year) : '', cover: '' }; bookCache.set(isbn, nb); return nb; } } catch (e) {}
  return null;
}
// 近い順に12冊（同じ書名 → 書名のはじめ → 言葉が書名に入っている → 著者・出版社に入っている → ISBN がある → 新しい）
function rankBooks(list, q) {
  const qn = nz(q), words = q.split(' ').map(nz).filter(Boolean); const seen = new Set(); const items = [];
  for (const b of list) {
    const k = b.isbn || `${nz(b.title)}|${nz(b.author)}|${b.year}`; if (seen.has(k)) continue; seen.add(k);
    const t = nz(b.title), tb = nz(b.base), hay = t + nz(b.author) + nz(b.publisher);
    const inT = words.filter((w) => t.includes(w)).length, inAll = words.filter((w) => hay.includes(w)).length;
    if (!inAll) continue; // 中身の説明にだけ言葉があった本は出さない
    items.push(Object.assign({}, b, { full: inAll === words.length, score: (tb === qn || t === qn ? 1000 : tb.startsWith(qn) ? 600 : t.includes(qn) ? 400 : 0) + (inT === words.length ? 200 : inAll === words.length ? 150 + inT * 20 : inAll * 10) + (b.isbn ? 40 : 0) + Math.max(0, Math.min(30, b.year - 1995)) }));
  }
  return items.sort((a, b) => b.score - a.score || b.year - a.year).slice(0, 12);
}
// 書名・著者名でさがす。国立国会図書館サーチは同時に何本も聞くと順番待ちで遅くなるので、1本ずつ聞き、
// 言葉が全部、書名か著者に入っている本が見つかったところでやめる（途中の結果は onPart で先に見せる）
//  ①書名 →（言葉が2つ以上なら）②「書名＋著者」③「著者＋書名」 → ④著者 → ⑤どこかに入っている
//  ①で書名に入っている本が多すぎるときは、その中の最近4年も見て終わり
//  待つのは全体で20秒まで。断られた（混んでいる）・時間切れで1冊もないときは「見つからない」ではなく ok:false（もう一度さがしてもらう）
export async function searchBooks(text, onPart) {
  const q = String(text || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 80);
  const isbn = /^[\d\s-]+[\dXx]?$/.test(q) ? toIsbn13(q) : '';
  if (isbn) { const b = await lookupBook(isbn); return { ok: true, isbn: true, items: b ? [b] : [] }; }
  const ws = q.split(' '); const got = []; let failed = 0; const until = Date.now() + 20000;
  const ask = async (a) => { const left = until - Date.now(); if (left < 1500) { failed++; return null; } try { const r = await ndlQuery(a, Math.min(12000, left)); got.push(...r.items); return r; } catch (e) { failed++; return null; } };
  const plan = [{ title: q }];
  if (ws.length > 1) plan.push({ title: ws.slice(0, -1).join(' '), creator: ws[ws.length - 1] }, { creator: ws[0], title: ws.slice(1).join(' ') });
  plan.push({ creator: q }, { any: q, cnt: '30' });
  for (let i = 0; i < plan.length; i++) {
    const r = await ask(plan[i]); const ranked = rankBooks(got, q); const full = ranked.some((b) => b.full);
    if (i === 0 && r && full && r.total > r.items.length) { if (onPart) onPart(ranked, true); await ask({ title: q, from: String(new Date().getFullYear() - 4) }); break; }
    if (full) break;
    if (ranked.length && onPart) onPart(ranked, true);
  }
  const items = rankBooks(got, q);
  return items.length || !failed ? { ok: true, items } : { ok: false, items: [] };
}
function cleanAuthor(a) { return String(a).split(/\s+/).map((t) => t.replace(/,?\s*\d{4}-?(\d{4})?/g, '').replace(/,/g, '').trim()).filter(Boolean).join('、'); }

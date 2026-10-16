// チェーン公式店舗一覧の読み取りで使う小道具（CommonJS）。各チェーンの部品（tools/chains/*.js）から使う
const UA = 'honya-map-chaincheck/0.1 (+https://bookmeyer.github.io/honya-map-proto/; monthly check of our own store list)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ページを文字列で取る。文字コードは応答ヘッダ→<meta>→指定の順で決める（Shift_JIS・EUC-JP も可）。取ったあと少し待つ（礼儀）
async function get(url, opts = {}) {
  const res = await fetch(url, { headers: Object.assign({ 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'ja,en;q=0.5' }, opts.headers || {}), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || '';
  let enc = opts.encoding || (ct.match(/charset=([\w-]+)/i) || [])[1];
  if (!enc) { const head = buf.slice(0, 6000).toString('latin1'); const m = head.match(/charset=["']?([\w-]+)/i); if (m) enc = m[1]; }
  enc = String(enc || 'utf-8').toLowerCase();
  if (['shift-jis', 'shift_jis', 'x-sjis', 'sjis', 'windows-31j', 'ms932', 'cp932'].includes(enc)) enc = 'shift_jis';
  if (['euc-jp', 'eucjp', 'x-euc-jp'].includes(enc)) enc = 'euc-jp';
  let text; try { text = new TextDecoder(enc).decode(buf); } catch (e) { text = buf.toString('utf8'); }
  await sleep(opts.delay == null ? 700 : opts.delay);
  return text;
}
async function json(url, opts = {}) { return JSON.parse(await get(url, Object.assign({}, opts, { headers: Object.assign({ Accept: 'application/json,*/*;q=0.8' }, opts.headers || {}) }))); }
async function post(url, body, opts = {}) {
  const res = await fetch(url, { method: 'POST', headers: Object.assign({ 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json,text/html;q=0.9,*/*;q=0.8' }, opts.headers || {}), body });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const text = await res.text(); await sleep(opts.delay == null ? 700 : opts.delay); return text;
}

// HTML → 文字だけ（タグを外し、実体参照を戻し、空白を整える）
function strip(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|dt|dd|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
    .replace(/[ \t　]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}
// 名前の正規化：全角→半角、空白なし、長音・中黒をそろえる、会社の肩書きを外す、小文字
function norm(s) { return String(s || '').normalize('NFKC').replace(/[\s　]+/g, '').replace(/[‐‑‒–—―ー－~〜]/g, 'ー').replace(/[・･]/g, '').replace(/株式会社|有限会社|\(株\)|（株）/g, '').replace(/[()（）\[\]【】「」『』]/g, '').toLowerCase(); }
// 住所の正規化（番地の表記ゆれを少し吸収）
function normAddr(s) { return String(s || '').normalize('NFKC').replace(/〒\s*\d{3}-?\d{4}/g, '').replace(/[\s　]+/g, '').replace(/丁目/g, '-').replace(/番地?/g, '-').replace(/号/g, '').replace(/-+$/g, '').replace(/ー/g, '-'); }
// 住所から都道府県
const PREF_RE = /(北海道|東京都|京都府|大阪府|[^\s\d]{2,3}県)/;
function prefOfAddress(a) { const m = String(a || '').normalize('NFKC').match(PREF_RE); return m ? m[1] : ''; }
// 店名から支店の部分（「紀伊國屋書店 新宿本店」→「新宿本」）。ブランド名と「書店」「店」などを外す
function branchOf(name, brandRe) {
  let s = String(name || '').normalize('NFKC');
  if (brandRe) s = s.replace(new RegExp(brandRe.source, brandRe.flags.replace('g', '') + 'g'), ' ');
  s = s.replace(/書店|ブックセンター|ブックストア|ブックス|BOOKSTORE|BOOK\s*STORE|BOOKS|Books|books|TSUTAYA|蔦屋|BOOKOFF|BOOK\s*OFF|ブックオフ/g, ' ');
  s = norm(s).replace(/店$/, '');
  return s;
}
// 正規表現で全部拾う（m → 好きな形に）
function all(re, text, fn) { const out = []; const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let m; while ((m = r.exec(text))) out.push(fn ? fn(m) : m); return out; }
// 重複（同じ名前＋同じ住所）を除く
function uniq(list) { const seen = new Set(); return list.filter((x) => { const k = norm(x.name) + '|' + normAddr(x.address); if (seen.has(k)) return false; seen.add(k); return true; }); }

module.exports = { UA, get, json, post, strip, norm, normAddr, prefOfAddress, branchOf, all, uniq, sleep };

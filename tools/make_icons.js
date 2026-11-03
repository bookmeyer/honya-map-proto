// アイコンの絵（SVG）を作る道具（v0.16.0）。いまのアイコン「本の中の地図」（大きさ大・ひらく角度150°・檸檬の地・朱の表紙）
// 使い方：node tools/make_icons.js → tools/icon/icon.svg（ふつう・iPhone・タブの印）と tools/icon/icon-maskable.svg（Android の丸く切る用。絵を0.77倍にして、安全な範囲＝半径40%の内側に）
// PNG（icon-192/512・apple-touch-icon 180・icon-maskable-512）は、この SVG をブラウザで開いて書き出す（字は使っていないので、どのブラウザでも同じ絵）。変えたら manifest・index.html・sw.js のアイコンの ?v= を上げる
// 机に開いて置いた本を、ななめ上から見た形で描く。w：ページの幅、ang：2枚のページのあいだの角度（180＝平ら）。地図はページごとに、ゆがめてのせる
const fs = require('fs'); const path = require('path');
const E = '#1B1B1B', SHU = '#FF6A48', GOLD = '#FFD447', SORA = '#2F9BFF', MIDORI = '#4FC07A', W = '#FFFFFF';
const r1 = (n) => Math.round(n * 10) / 10;
const pin = (x, y, r) => `M${r1(x)} ${r1(y + 2.15 * r)}C${r1(x - 0.35 * r)} ${r1(y + 1.55 * r)} ${r1(x - r)} ${r1(y + 0.95 * r)} ${r1(x - r)} ${r1(y)}A${r1(r)} ${r1(r)} 0 0 1 ${r1(x + r)} ${r1(y)}C${r1(x + r)} ${r1(y + 0.95 * r)} ${r1(x + 0.35 * r)} ${r1(y + 1.55 * r)} ${r1(x)} ${r1(y + 2.15 * r)}Z`;
const MAP = `<path d="M96 214C170 250 220 176 286 256S382 300 424 276" stroke="${SORA}" stroke-width="22" stroke-linecap="round" fill="none"/>
<ellipse cx="172" cy="306" rx="30" ry="19" fill="${MIDORI}"/><ellipse cx="356" cy="196" rx="24" ry="15" fill="${MIDORI}"/>
<path d="M92 330L424 296M196 140L206 400M326 150L318 400" stroke="#E9DCC3" stroke-width="10" stroke-linecap="round"/>
<path d="M166 240C210 214 262 286 322 252" stroke="${SHU}" stroke-width="8" stroke-linecap="round" stroke-dasharray="1 15" fill="none"/>
<circle cx="164" cy="240" r="11" fill="${SHU}" stroke="${E}" stroke-width="5"/>`;
const BETA = (66 * Math.PI) / 180; // 見下ろす角度
// pal：色（bg 地・inner 内側の丸〈null で出さない〉・cover 表紙）
function make(w, ang, id, pal = {}) {
  const z = w / 151, g = 15.3 * z, gam = (((180 - ang) / 2) * Math.PI) / 180;
  const Wd = w * Math.cos(gam), rise = w * Math.sin(gam) * Math.cos(BETA), H = 1.33 * w * Math.sin(BETA), bulge = 39 * z * (0.55 + 0.9 * Math.sin(gam)), coverDy = 16 * z;
  const top = -H / 2 - rise - bulge * 0.55, bot = H / 2 + coverDy; const cx = 256, cy = 262 - (top + bot) / 2;
  const pts = (s) => ({ St: [cx + s * g, cy - H / 2], Ct: [cx + s * (g + 0.47 * Wd), cy - H / 2 - rise * 0.5 - bulge], Ot: [cx + s * (g + Wd), cy - H / 2 - rise], Ob: [cx + s * (g + Wd), cy + H / 2 - rise], Cb: [cx + s * (g + 0.47 * Wd), cy + H / 2 - rise * 0.5 - bulge * 0.9], Sb: [cx + s * g, cy + H / 2] });
  const pg = (s, dy = 0) => { const p = pts(s); const f = (q) => `${r1(q[0])} ${r1(q[1] + dy)}`; return `M${f(p.St)}Q${f(p.Ct)} ${f(p.Ot)}L${f(p.Ob)}Q${f(p.Cb)} ${f(p.Sb)}Z`; };
  // もとの平らな地図（ページの形 k=17）→ このページ への変形（ページごと）
  const mat = (s) => { const St0 = [256 + s * 15.3, 198.8], p = pts(s); const a = Wd / 130.9, b = (s * (-rise + (H * 34) / 183.6)) / 130.9, d = H / 183.6; return { a, b, d, e: p.St[0] - a * St0[0], f: p.St[1] - b * St0[0] - d * St0[1] }; };
  const tf = (m, x, y) => [m.a * x + m.e, m.b * x + m.d * y + m.f];
  const ow = r1(12 * Math.sqrt(z)), st = ` stroke="${E}" stroke-width="${ow}" stroke-linejoin="round"`;
  let body = `<path d="${pg(-1, coverDy)}${pg(1, coverDy)}" fill="${pal.cover || SHU}"${st}/>`, defs = '';
  for (const s of [-1, 1]) { const m = mat(s); defs += `<clipPath id="${id}${s < 0 ? 'l' : 'r'}"><path d="${pg(s)}"/></clipPath>`; body += `<path d="${pg(s)}" fill="${W}"/><g clip-path="url(#${id}${s < 0 ? 'l' : 'r'})"><g transform="matrix(${r1(m.a * 1000) / 1000} ${r1(m.b * 1000) / 1000} 0 ${r1(m.d * 1000) / 1000} ${r1(m.e)} ${r1(m.f)})">${MAP}</g></g>`; }
  body += `<path d="${pg(-1)}${pg(1)}" fill="none"${st}/>`;
  const tip = tf(mat(1), 338, 272), pr = 27 * z;
  body += `<path d="${pin(tip[0], tip[1] - 2.15 * pr, pr)}" fill="${SHU}"${st.replace(`"${ow}"`, `"${r1(7 * Math.sqrt(z))}"`)}/><circle cx="${r1(tip[0])}" cy="${r1(tip[1] - 2.15 * pr)}" r="${r1(pr / 3)}" fill="${W}" stroke="${E}" stroke-width="${r1(4 * Math.sqrt(z))}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${defs}</defs><rect width="512" height="512" fill="${pal.bg || GOLD}"/>${pal.inner === null ? '' : `<circle cx="256" cy="256" r="200" fill="${pal.inner || '#FFE07A'}"/>`}${body}</svg>`;
}
const PAL = { bg: GOLD, inner: '#FFE07A', cover: SHU }; // 檸檬の地・朱の表紙（11/3 夜 ぶっくまさん「アイコンは青じゃないですね。やっぱり」→ 12案の「1 檸檬」。その前は空色）
const full = make(184, 150, 'm', PAL);
const BG = `<circle cx="256" cy="256" r="200" fill="${PAL.inner}"/>`;
const mask = full.replace(BG, `<g transform="translate(256 256) scale(.77) translate(-256 -256)">${BG}`).replace('</svg>', '</g></svg>');
const dir = path.join(__dirname, 'icon'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon.svg'), full); fs.writeFileSync(path.join(dir, 'icon-maskable.svg'), mask);
console.log('作った：tools/icon/icon.svg・tools/icon/icon-maskable.svg');

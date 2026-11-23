// 9つの質問（プロフィール）を、1画面1問・ボタンを押すだけで答える（v0.33.0）
// 11/20 ぶっくまさん「プロフィール登録まで行く人が3割くらいです。原因は？」→「かならず答えてほしい」→「スタンプを押した日の次の日にするのは？」→「はい、お願いします」
// ・はじめの設定は、アイコンと名前だけ。9問は「いま答える（30秒ほど）」か「あとで答える」
// ・「あとで」の人には、最初のスタンプを押した日の次の日以降に開いたとき（スタンプがなくても、開いた日が3日目になったとき）、答えるまで進めない画面を出す
// ・お店の近く（射程の中）で開いたときは出さない（出先で入れる手間をかけない）。お店から離れて開いたときに出す
// 9問の中身・答えのコードは、これまでと同じ（config.js の PROFILE_Q。前に集まった答えとそのまま合わせて数えられる）
import { PROFILE_Q, PREFS } from './config.js?v=0.36.5';
import { $, esc, todayISO } from './util.js?v=0.36.5';
import { S, save } from './state.js?v=0.36.5';
import * as E from './events.js?v=0.36.5';
import { toast } from './ui.js?v=0.36.5';
import { profileComplete, STAT_P } from './profile_ui.js?v=0.36.5';

// 都道府県は、地方を押してから県を押す（47の長い一覧から探さなくてよいように）。PREFS は JIS の順（0＝北海道）
const REGIONS = [['北海道・東北', 0, 6], ['関東', 7, 13], ['中部', 14, 22], ['近畿', 23, 29], ['中国・四国', 30, 38], ['九州・沖縄', 39, 46]];
const prefCode = (i) => String(i + 1).padStart(2, '0');
const regionOf = (code) => { const i = Number(code) - 1; return REGIONS.findIndex(([, a, b]) => i >= a && i <= b); };

// ---- 開いた日を数える（端末の中だけ。送らない）----
export function countDay() { const t = todayISO(); if (S.settings.dayLast === t) return; S.settings.dayLast = t; S.settings.dayN = (S.settings.dayN || 0) + 1; save(); }
// 答えないと進めない画面を出す日か：最初のスタンプ（お試し歩きはのぞく）の次の日以降、または開いた日が3日目
export function profileDue() {
  if (profileComplete(S.profile)) return false;
  const t = todayISO();
  const first = Object.values(S.stamps || {}).filter((x) => x && !x.trial && x.d).map((x) => x.d).sort()[0];
  if (first && first < t) return true;
  return (S.settings.dayN || 0) >= 3;
}

const STAT_SHORT = `<div class="pf-send qz-note"><b>名前（ハンドルネーム）以外の答えは、統計データとして使います。ひとりひとりの答えは出しません。</b><details><summary>くわしく</summary>${STAT_P}</details></div>`;
const ART = `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" fill="#FBEFD6" stroke="#1B1B1B" stroke-width="2.5"/><rect x="58" y="44" width="84" height="116" rx="10" fill="#FFFFFF" stroke="#1B1B1B" stroke-width="2.5"/><rect x="80" y="36" width="40" height="16" rx="6" fill="#FFD447" stroke="#1B1B1B" stroke-width="2.5"/>${[72, 98, 124].map((y, k) => `<rect x="70" y="${y}" width="14" height="14" rx="4" fill="${k < 2 ? '#FF6A48' : '#FFFFFF'}" stroke="#1B1B1B" stroke-width="2"/>${k < 2 ? `<path d="M73 ${y + 7}l3 3 5-6" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` : ''}<rect x="92" y="${y + 4}" width="${[38, 30, 34][k]}" height="6" rx="3" fill="#D9CDB4"/>`).join('')}</svg>`;

// ---- 答えから作る、物語のプロローグ（v0.33.0。11/20 ぶっくまさん「答えると物語がはじまる的な感じにすると答えてくれるのでは？」）----
// シェアしても困らないように、世代・性別・都道府県・知ったきっかけは文に入れない（好きな本・買う冊数・本屋に行く回数・選ぶきっかけだけ）
const G_W = { lit: '小説', mys: 'ミステリー・SF', ess: 'エッセイ', biz: 'ビジネス書', hum: '人文書', his: '歴史の本', sci: '科学の本', life: '暮らしの本', kid: '絵本や児童書', comic: 'マンガ', poem: '詩や短歌' };
const BUY_W = { m0: '本を買うのは月に1冊より少なく', m1: '月に1冊くらい本を買い', m2: '月に2〜3冊の本を買い', m4: '月に4〜5冊の本を買い', m6: '月に6〜9冊の本を買い', m10: '月に10冊以上の本を買い' };
const FREQ_W = { w: '本屋さんには週に1回以上行く', m2: '本屋さんには月に2〜3回行く', m1: '本屋さんには月に1回くらい行く', q: '本屋さんには2〜3か月に1回くらい行く', r: '本屋さんには、ほとんど行かない' };
const WHY_W = { shelf: '本屋さんの棚やPOP', sns: 'SNS', media: '書評やテレビ・ラジオ', friend: '友だちや家族のすすめ', award: '本の賞', author: '好きな著者' };
export function prologueLines(a = (S.profile && S.profile.a) || {}, handle = S.settings.handle || '') {
  const h = handle ? `「${handle}」さん` : 'あなた';
  const g = (a.genres || []).map((k) => G_W[k]).filter(Boolean);
  const gs = g.length > 2 ? `${g[0]}や${g[1]}など、いろいろな本` : g.join('と');
  const why = (a.why || []).map((k) => WHY_W[k]).filter(Boolean);
  const out = [];
  if (gs) out.push(`${h}は、${gs}が好きな人。`);
  if (BUY_W[a.buy] && FREQ_W[a.freq]) out.push(`${BUY_W[a.buy]}、${FREQ_W[a.freq]}。`);
  if (why.length) out.push(`本を選ぶきっかけは、${why[0]}${why.length > 1 ? 'など' : ''}。`);
  out.push(a.freq === 'r' ? `そんな${h}が、本屋さんをめぐる旅に出る。` : `そんな${h}の、本屋さんをめぐる旅が、ここから始まる。`);
  return out;
}
export function prologueHTML(lines = prologueLines()) {
  return `<div class="story prologue"><div class="ch-sub">本めぐり　${S.settings.handle ? esc(S.settings.handle) + 'の物語' : 'あなたの物語'}</div><div class="ch-title">プロローグ</div><div class="story-body">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div></div>`;
}

// ---- 9問に入る前の画面 ----
// mandatory：答えないと進めない（「あとで」なし）。onDone：答え終わった／onLater：あとで
export function showProfileAsk({ mandatory = false, onDone, onLater } = {}) {
  if ($('#pfask')) return;
  const box = document.createElement('div'); box.id = 'pfask'; box.className = 'onboard pfask';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', '9つの質問');
  const draw = () => {
    box.innerHTML = `<div class="onboard-box">
      <div class="ob-catch"><b>物語のはじまり</b>${mandatory ? '本めぐりを続ける前に' : 'ボタンを押すだけ・30秒ほど'}</div>
      <div class="art gate-art">${ART}</div>
      <h2 class="gate-h">9つの質問に答えると、あなたの物語が始まります</h2>
      <p>答えから、物語の最初のページ（プロローグ）ができます。ボタンを押すだけで、30秒ほどで終わります。</p>
      ${STAT_SHORT}
      <div class="actions gate-actions"><button class="btn primary wide" id="pa-go">答える（30秒ほど）</button>${mandatory ? '' : '<button class="btn ghost wide" id="pa-later">あとで答える</button>'}</div>
      ${mandatory ? '' : '<p class="muted small qz-later">「あとで」のときは、はじめてスタンプを押した次の日に、もう一度お願いします。そのときに、プロローグができます。</p>'}
    </div>`;
    $('#pa-go').onclick = () => openQuiz(box, { mandatory, onBack: draw, onDone: () => { box.remove(); if (onDone) onDone(); } });
    if ($('#pa-later')) $('#pa-later').onclick = () => { S.settings.pfLater = todayISO(); save(); box.remove(); if (onLater) onLater(); };
  };
  document.body.appendChild(box); draw();
}

// ---- 1画面1問 ----
function openQuiz(box, { mandatory, onBack, onDone }) {
  const a = JSON.parse(JSON.stringify((S.profile && S.profile.a) || {})); // 前に答えたものがあれば、選んだ状態から
  let i = 0, region = -1;
  const N = PROFILE_Q.length;
  const go = (k) => { i = k; region = -1; draw(); };
  const draw = () => {
    const q = PROFILE_Q[i];
    let body = '', sub = 'いちばん近いものを1つ';
    if (q.max) {
      sub = 'あてはまるものを、いくつでも';
      const cur = a[q.k] || [];
      body = `<div class="qz-opts multi">${q.o.map(([v, t]) => `<button type="button" class="qz-opt${cur.includes(v) ? ' on' : ''}" data-v="${v}" aria-pressed="${cur.includes(v)}">${esc(t)}</button>`).join('')}</div>
        <div class="qz-foot"><button class="btn primary wide" id="qz-next"${cur.length ? '' : ' disabled'}>${i === N - 1 ? '答え終わる' : 'つぎへ'}</button></div>`;
    } else if (q.pref) {
      if (region < 0 && a.pref) region = regionOf(a.pref);
      if (region < 0) { sub = 'まず、地方を選んでください'; body = `<div class="qz-opts">${REGIONS.map(([n], r) => `<button type="button" class="qz-opt" data-r="${r}">${n}</button>`).join('')}</div>`; }
      else {
        const [rn, s0, s1] = REGIONS[region]; sub = `${rn}の中から1つ`;
        const list = []; for (let k = s0; k <= s1; k++) list.push(k);
        body = `<div class="qz-opts grid">${list.map((k) => `<button type="button" class="qz-opt${a.pref === prefCode(k) ? ' on' : ''}" data-v="${prefCode(k)}">${PREFS[k][0]}</button>`).join('')}</div><p class="qz-re"><button type="button" class="linkbtn" id="qz-region">ほかの地方を選ぶ</button></p>`;
      }
    } else {
      body = `<div class="qz-opts">${q.o.map(([v, t]) => `<button type="button" class="qz-opt${a[q.k] === v ? ' on' : ''}" data-v="${v}">${esc(t)}</button>`).join('')}</div>`;
    }
    const canBack = i > 0 || region >= 0 || !mandatory;
    box.innerHTML = `<div class="onboard-box qz-box">
      <div class="qz-top">${canBack ? '<button type="button" class="qz-back" id="qz-back">‹ もどる</button>' : '<span></span>'}<span class="qz-count"><b>${i + 1}</b>／${N}</span></div>
      <div class="qz-bar" aria-hidden="true"><i style="width:${Math.round(((i) / N) * 100)}%"></i></div>
      <h2 class="qz-q">${esc(q.t.replace(/（いくつでも）/, ''))}</h2><p class="qz-sub">${sub}</p>
      ${body}
    </div>`;
    if ($('#qz-back')) $('#qz-back').onclick = () => { if (q.pref && region >= 0 && !a.pref) { region = -1; draw(); } else if (i > 0) go(i - 1); else if (onBack) onBack(); };
    if ($('#qz-region')) $('#qz-region').onclick = () => { region = -1; delete a.pref; draw(); };
    box.querySelectorAll('.qz-opt[data-r]').forEach((b) => { b.onclick = () => { region = Number(b.dataset.r); draw(); }; });
    box.querySelectorAll('.qz-opt[data-v]').forEach((b) => {
      b.onclick = () => {
        if (q.max) {
          const cur = new Set(a[q.k] || []); const v = b.dataset.v;
          if (cur.has(v)) cur.delete(v); else cur.add(v);
          a[q.k] = q.o.map(([x]) => x).filter((x) => cur.has(x));
          b.classList.toggle('on', cur.has(v)); b.setAttribute('aria-pressed', String(cur.has(v)));
          $('#qz-next').disabled = !cur.size; return;
        }
        a[q.k] = b.dataset.v; box.querySelectorAll('.qz-opt').forEach((x) => x.classList.toggle('on', x === b));
        setTimeout(next, 220); // 押したのが見えてから、次の問いへ
      };
    });
    if ($('#qz-next')) $('#qz-next').onclick = next;
  };
  const next = () => { if (i < N - 1) go(i + 1); else finish(); };
  const finish = () => {
    if (!profileComplete({ a })) { const k = PROFILE_Q.findIndex((q) => (q.max ? !(a[q.k] || []).length : !a[q.k])); if (k >= 0) { go(k); return; } }
    S.profile = { a, d: todayISO(), send: true }; delete S.settings.pfLater; save(); E.queueProfile('put');
    // 答え終わったら、できたプロローグを見せる（めぐり帳の「物語」のいちばん最初にも入る）
    box.innerHTML = `<div class="onboard-box qz-box qz-pro">
      <div class="ob-catch"><b>プロローグができました</b>ありがとうございました</div>
      ${prologueHTML(prologueLines(a))}
      <p class="muted small qz-pro-note">めぐり帳の「物語」の、いちばん最初に入りました。</p>
      <div class="actions gate-actions"><button class="btn primary wide" id="qz-start">物語を始める</button></div>
    </div>`;
    $('#qz-start').onclick = () => { if (onDone) onDone(); };
  };
  draw();
}

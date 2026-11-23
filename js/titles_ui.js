// 称号の一覧と、もらい方（v0.33.2）
// 11/21 ぶっくまさん「称号の意味やどんな種類があるのかわからないという声がありました」
// めぐり帳の「称号「○○」」と、称号の並びの「称号の一覧」から開く。種類ごとに、もらったもの・まだのもの（あといくつ）を全部見せる
import { esc } from './util.js?v=0.36.5';
import { S } from './state.js?v=0.36.5';
import * as G from './game.js?v=0.36.5';
import { openModal, closeModal } from './ui.js?v=0.36.5';

// 種類（kind）ごとのまとまり。unit：「あと○○」の単位
const GROUPS = [
  { kinds: ['stamps'], h: 'スタンプを押した店の数', how: '本屋・図書館でスタンプを押すと増えます（同じ店は1つと数えます）', unit: '店' },
  { kinds: ['prefs'], h: 'スタンプを押した都道府県の数', how: 'ちがう都道府県の店でスタンプを押すと増えます', unit: '県' },
  { kinds: ['used', 'rare', 'feat'], h: '本屋の種類', how: '古書店や、まわりに本屋が少ない「秘境」（★★★）の店、今週の推し店でスタンプを押すと増えます', unit: { used: '店', rare: '店', feat: '回' } },
  { kinds: ['regMax', 'regulars'], h: '同じ店に通う', how: '同じ店で、ちがう日にスタンプを押すと増えます（1日1回）。同じ店に5日通うと、その店の「常連」です', unit: { regMax: '日', regulars: '店' } },
  { kinds: ['libs'], h: '図書館', how: '図書館でスタンプを押すと増えます', unit: '館' },
  { kinds: ['cards'], h: '本との出会い', how: '店のページの「本と出会った」で、本のカードを作ると増えます', unit: '枚' },
  { kinds: ['reads', 'readMin', 'moveReads', 'done', 'sato'], h: '読書', how: '地図の「ここから読む」で読書の時間を記録したり、本を読み終えたり、本の里帰りをしたりすると、もらえます', unit: { reads: '回', readMin: '分', moveReads: '回', done: '冊', sato: '回' } },
  { kinds: ['streak', 'pages'], h: '続ける・歩く', how: '毎週スタンプを押したり、歩いたり（100mで1ページ）すると、もらえます', unit: { streak: '週', pages: 'ページ' } },
  { kinds: ['mapfix', 'mapadd', 'mapall'], h: 'みんなの地図をよくする', how: '閉店・名前のまちがい・地図にない本屋を知らせて、運営が直すともらえます', unit: '店' },
  { kinds: ['look', 'rally', 'share'], h: 'そのほか', how: '本屋のページを見たり、ご当地ラリーをめぐったり、シェアしたりすると、もらえます', unit: { look: '店', rally: 'つ', share: '回' } },
  { kinds: ['early', 'hashigo', 'libbook'], h: 'かくれ称号', how: 'もらうまで、名前も条件もひみつです', unit: '', hidden: 1 },
];

export function openTitles() {
  const all = G.titles(); const st = G.stats(); const cur = G.currentTitle();
  const row = (t, unit0) => {
    if (t.ok) return `<li class="ti ok"><span class="ti-n">🏅 ${esc(t.name)}</span><span class="ti-c">${esc(t.need)}</span></li>`;
    if (t.hidden) return '<li class="ti"><span class="ti-n">？？？（ひみつ）</span><span class="ti-c">もらうとわかります</span></li>'; // かくれ称号（v0.34.0）
    const unit = unit0 && typeof unit0 === 'object' ? (unit0[t.kind] || '') : (unit0 || '');
    const left = t.kind ? Math.max(0, t.n - (st[t.kind] ?? 0)) : 0;
    return `<li class="ti"><span class="ti-n">${esc(t.name)}</span><span class="ti-c">${esc(t.need)}${left ? `　<b>あと${left}${unit}</b>` : ''}</span></li>`;
  };
  const used = new Set();
  let body = GROUPS.map((g) => {
    const list = all.filter((t) => g.kinds.includes(t.kind)).sort((a, b) => (g.kinds.indexOf(a.kind) - g.kinds.indexOf(b.kind)) || (a.n - b.n)); list.forEach((t) => used.add(t.id)); // 種類ごと・少ない順（v0.34.0）
    if (!list.length) return '';
    const got = list.filter((t) => t.ok).length;
    return `<section class="ti-g"><h3>${esc(g.h)}<small>${got}／${list.length}</small></h3><p class="muted small">${esc(g.how)}</p><ul class="ti-l">${list.map((t) => row(t, g.unit)).join('')}</ul></section>`;
  }).join('');
  const rally = all.filter((t) => !used.has(t.id));
  if (rally.length) body += `<section class="ti-g"><h3>ご当地ラリー<small>${rally.filter((t) => t.ok).length}／${rally.length}</small></h3><p class="muted small">ラリーの店をすべてめぐると、そのラリーの称号がもらえます（「ラリー」のタブから）</p><ul class="ti-l">${rally.map((t) => row(t, '')).join('')}</ul></section>`;
  const ev = S.evTitles || [];
  body += `<section class="ti-g"><h3>イベント<small>${ev.length}</small></h3><p class="muted small">期間かぎりのイベント（フェアめぐりなど）で、決められた店をめぐるともらえます。イベントが終わっても残ります</p>${ev.length ? `<ul class="ti-l">${ev.map((t) => `<li class="ti ok"><span class="ti-n">🏅 ${esc(t.name)}</span><span class="ti-c">${esc(t.d || '')}</span></li>`).join('')}</ul>` : '<p class="muted small">まだありません</p>'}</section>`;
  const gotN = all.filter((t) => t.ok).length + ev.length;
  openModal(`<h2>称号</h2>
    <p>称号は、本めぐりでの歩みにつく呼び名です。スタンプを押した店の数や、通った日数などに応じて、もらえます。もらった称号は、めぐり帳に🏅で並びます。</p>
    <p class="hint">いまの称号：<b>「${esc(cur || '本屋あるき見習い')}」</b>（めぐり帳の名前の下に出る称号）　もらった称号 ${gotN}こ</p>
    <div class="ti-all">${body}</div>
    <div class="actions"><button class="btn primary wide" id="ti-close">閉じる</button></div>`);
  document.getElementById('ti-close').onclick = closeModal;
}

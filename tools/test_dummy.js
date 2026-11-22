// テスト版だけの「ダミーデータ」（v0.35.2〜。11/22 ぶっくまさん「テスト環境でダミーデータを確認したいです」）
//   テスト版を ?dummy=1 で開くと、店の情報をテスト用サーバーではなく data/dummy_shops.json から読み、
//   X の投稿は本物の X ではなく js/dummy_widgets.js（見本の投稿）で出す。?dummy=0 で元にもどる（このタブのあいだ覚える）
//   載せる先は、実在しない「【見本】架空の本屋」（demo1・東京駅のそば）だけ。本物の店には何も足さない
//   本番には入らない（tools/deploy_test.js が、テスト版を作るときだけ足す）
const FLAG = `(() => { try { const q = location.search; if (/[?&]dummy=1/.test(q)) sessionStorage.setItem('meguri_dummy', '1'); if (/[?&]dummy=0/.test(q)) sessionStorage.removeItem('meguri_dummy'); return sessionStorage.getItem('meguri_dummy') === '1'; } catch (e) { return false; } })()`;

const posts = [
  { x: '9001', name: '冬に読みたい、あたたかい本', to: '2026-12-20', text: '2階文芸コーナーで「冬に読みたい、あたたかい本」フェアはじまりました☕ スタッフの手書きPOPつきです。', bg: 'linear-gradient(135deg,#C9A27A 0 18%,#8E6E4F 18% 22%,#E8D6B8 22% 40%,#B5523B 40% 46%,#F3E3C3 46% 62%,#5F7F63 62% 68%,#EAD9B5 68% 100%)', t: '午前10:12 · 2026年11月22日' },
  { x: '9002', name: 'サイン本、入荷しました', to: '2026-12-19', text: '「サイン本、入荷しました」📚 先着順です。お取り置きはできません。', bg: 'linear-gradient(160deg,#2E4A62 0 30%,#F4EBDD 30% 55%,#D98C5F 55% 70%,#F4EBDD 70% 100%)', t: '午後3:40 · 2026年11月21日' },
  { x: '9003', name: 'Xの投稿', to: '2026-12-18', text: '入口の平台を、冬の絵本に入れかえました⛄ 小さなお子さんと一緒にどうぞ。', bg: 'linear-gradient(120deg,#FFFFFF 0 20%,#9CC3E6 20% 45%,#F7E1A0 45% 70%,#E9A8A0 70% 100%)', t: '午前11:05 · 2026年11月20日' },
  { x: '9004', name: '店長の今年の10冊', to: '2026-12-17', text: '「店長の今年の10冊」の棚ができました。1冊ずつ短いコメントを付けています。', bg: 'linear-gradient(135deg,#3C3C3C 0 25%,#E5D3B3 25% 60%,#A44A3F 60% 75%,#E5D3B3 75% 100%)', t: '午後6:20 · 2026年11月19日' },
  { x: '9005', name: '読書会のお知らせ', to: '2026-12-16', text: '「読書会のお知らせ」12/14(土) 14時〜 店内のカフェで。課題本は店頭にあります。', bg: 'linear-gradient(135deg,#6B8F71 0 35%,#F2E8CF 35% 100%)', t: '午後1:00 · 2026年11月18日' },
  { x: '9006', name: '年末年始の営業のお知らせ', to: '2026-12-15', text: '「年末年始の営業のお知らせ」12/31は18時まで、1/1はお休みです。', bg: 'linear-gradient(135deg,#C1121F 0 30%,#FFF4E0 30% 100%)', t: '午前9:30 · 2026年10月30日' },
];
const fairs = posts.map((p, i) => ({ id: 9100 + i, name: p.name, from: i === 5 ? '2026-10-30' : '2026-11-' + (22 - i), to: p.to, place: '', say: '', pics: [], at: '2026-11-' + (22 - i), x: p.x, xu: 'honmeguri_mihon' }));
fairs.splice(3, 0, { id: 9099, name: 'はじめての短歌フェア', from: '2026-11-10', to: '2026-12-10', place: '1階 詩歌の棚', say: '歌人の手書きの色紙も飾っています（見本）', pics: [], at: '2026-11-10' });
const shopsJSON = JSON.stringify({ ok: true, shops: { demo1: { fairs, sns: [{ k: 'x', url: 'https://x.com/' }], up: '2026-11-22' } }, confirmed: [], recent: [], at: '2026-11-22T00:00:00+09:00' }, null, 1);

const MOCK = Object.fromEntries(posts.map((p) => [p.x, { text: p.text, bg: p.bg, t: p.t }]));
const widgetsJS = `// テスト版だけの見本の X（本物の X には読みに行かない）
(function () {
  var M = ${JSON.stringify(MOCK)};
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  window.twttr = { ready: function (f) { f(window.twttr); }, widgets: { createTweet: function (id, el, o) {
    var m = M[id]; if (!m) return Promise.resolve(undefined);
    var dark = o && o.theme === 'dark';
    var d = document.createElement('div');
    d.style.cssText = 'border:1px solid ' + (dark ? '#38444D' : '#CFD9DE') + ';border-radius:14px;background:' + (dark ? '#15202B' : '#fff') + ';padding:12px;font-family:system-ui,sans-serif;color:' + (dark ? '#F7F9F9' : '#0F1419') + ';text-align:left;margin:4px 0';
    d.innerHTML = '<div style="display:flex;gap:8px;align-items:center"><div style="width:38px;height:38px;border-radius:50%;background:#F2C14E;color:#1B1B1B;display:flex;align-items:center;justify-content:center;font-weight:800">見</div><div><div style="font-weight:700;font-size:15px">【見本】架空の本屋</div><div style="color:#536471;font-size:13px">@honmeguri_mihon</div></div><div style="margin-left:auto;font-weight:900;font-size:20px">𝕏</div></div>'
      + '<div style="font-size:15px;line-height:1.5;margin:8px 0">' + esc(m.text) + ' <span style="color:#1D9BF0">#本めぐり</span></div>'
      + '<div style="height:180px;border-radius:12px;background:' + m.bg + '"></div>'
      + '<div style="color:#536471;font-size:12.5px;margin-top:6px">' + esc(m.t) + ' · ♡ 24</div>'
      + '<div style="color:#C1121F;font-size:11px;font-weight:700;margin-top:4px">見本（テスト版のダミーデータ。本物の X の投稿ではありません）</div>';
    el.appendChild(d); return Promise.resolve(d);
  } } };
})();
`;

/** js/shops.js：?dummy=1 のときは data/dummy_shops.json を読む */
function patchShops(s) {
  const a = "new URL('shops.php', apiBase()).toString()";
  if (s.split(a).length !== 2) throw new Error('shops.js の書きかえ先が見つかりません（test_dummy.js を見直してください）');
  return s.replace(a, `(TEST_DUMMY ? './data/dummy_shops.json' : ${a})`) + `\n// テスト版だけ：ダミーデータ（tools/test_dummy.js）\nvar TEST_DUMMY = ${FLAG};\n`;
}
/** js/xembed.js：?dummy=1 のときは見本の X を読む */
function patchXembed(s) {
  const a = "const WIDGETS = 'https://platform.twitter.com/widgets.js';";
  if (s.split(a).length !== 2) throw new Error('xembed.js の書きかえ先が見つかりません（test_dummy.js を見直してください）');
  return s.replace(a, `const WIDGETS = ${FLAG} ? './js/dummy_widgets.js' : 'https://platform.twitter.com/widgets.js'; // テスト版だけ：ダミーデータ`);
}
module.exports = { shopsJSON, widgetsJS, patchShops, patchXembed, FILES: ['data/dummy_shops.json', 'js/dummy_widgets.js'] };

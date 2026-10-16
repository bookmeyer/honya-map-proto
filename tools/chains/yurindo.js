// 有隣堂：店舗一覧ページ（/store/）に全店が <div class="store-post"> で入っている（店名・取扱のアイコン・詳細ページへのリンク。住所は無い）。
// 住所と座標は各店の詳細ページ（約45枚）から取る：住所は「住所」の見出しの下、座標は Google マップ埋め込みの !2d経度!3d緯度。
// 取扱アイコンの alt に「本」も「医学書」も無い店（文具だけの店など）は書店ではないので除く
const lib = require('./_lib');
module.exports = {
  id: 'yurindo',
  name: '有隣堂',
  brand: /有隣堂/,
  source: 'https://www.yurindo.co.jp/store/',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const blocks = html.split('<div class="store-post">').slice(1);
    const stores = [];
    const seen = new Set();
    for (const b of blocks) {
      let branch = lib.strip((b.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || '').replace(/\n/g, ' ');
      branch = branch.replace(/^\s*\d{1,2}\/\d{1,2}\s*\([^)]*\)\s*OPEN\s*[–\-ー—]\s*/i, '').replace(/^\s*(NEW|OPEN)\s*[–\-ー—:：]\s*/i, '').trim(); // 「11/5(木)OPEN – 」のような注記を外す
      if (!branch) continue;
      const head = b.slice(0, b.indexOf('store-post__info') > 0 ? b.indexOf('store-post__info') : b.length);
      const cats = lib.all(/alt="([^"]*)"/g, head, (m) => m[1].trim()).filter(Boolean);
      if (cats.length && !cats.some((c) => /本|医学書/.test(c))) continue; // 文具・雑貨だけの店は除く
      const url = (b.match(/href="(https:\/\/www\.yurindo\.co\.jp\/store\/[^"]+)"/) || [])[1] || '';
      const key = url || branch;
      if (seen.has(key)) continue;
      seen.add(key);
      stores.push({ name: `有隣堂 ${branch}`, address: '', url });
    }
    if (stores.length < 20) throw new Error(`店舗が少なすぎる（${stores.length}件）。ページの作りが変わったかもしれない`);
    // 詳細ページから住所と座標
    for (const s of stores) {
      if (!s.url) continue;
      let page = '';
      try { page = await lib.get(s.url); } catch (e) { continue; }
      const m = page.match(/住所<\/h4>\s*<div>([\s\S]*?)<\/div>/);
      if (m) s.address = lib.strip(m[1]).replace(/〒\s*\d{3}-?\d{4}/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      const g = page.match(/!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/); // Google マップ埋め込み（中心＝店の位置）
      if (g) { const lon = +g[1], lat = +g[2]; if (lat > 20 && lat < 50 && lon > 120 && lon < 150) { s.lat = lat; s.lon = lon; } }
    }
    return lib.uniq(stores);
  },
};

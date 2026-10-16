// 明屋書店：店舗一覧ページ（1枚）に、地域ごとの <table summary="四国"> … の行で全店が入っている（直営＋フランチャイズ）。
// 行＝ <tr onclick="…shopdetail?id=NN"> 店名／〒＋住所／営業時間／取扱商品のアイコン。座標は無い。
// 店名は支店名だけ（「川東店」）なので「明屋書店 」を前に足す。同社の別屋号（らくだ書店・カルコス・金龍堂・あおい書店・鎌倉文庫・ブックスユートピア・イケヤ・キダブン）はそのまま。
// 書籍アイコンの無い店（アクセア＝印刷店）は除く
const lib = require('./_lib');
const OTHER_BRAND = /^(らくだ書店|鎌倉文庫|あおい書店|カルコス|ブックスユートピア|金龍堂|イケヤ|キダブン)|書店|書房|文庫|ブックス|BOOKS/i;
module.exports = {
  id: 'haruya',
  name: '明屋書店',
  brand: /明屋|Haruya|らくだ書店|カルコス|金龍堂/i,
  source: 'https://www.haruya.co.jp/shop',
  complete: true,
  async fetch() {
    const html = await lib.get(this.source);
    const rows = lib.all(/<tr onclick="javascript:location\.href='([^']+)';">([\s\S]*?)<\/tr>/g, html, (m) => ({ url: m[1], inner: m[2] }));
    const list = [];
    for (const r of rows) {
      const tds = lib.all(/<td[^>]*>([\s\S]*?)<\/td>/g, r.inner, (m) => m[1]);
      if (tds.length < 4) continue;
      const branch = lib.strip(tds[0]).replace(/\s+/g, ' ').trim();
      if (!branch || /閉店/.test(branch)) continue;
      const alts = lib.all(/alt="([^"]*)"/g, tds[3], (m) => m[1]);
      if (!alts.some((a) => /書籍/.test(a))) continue; // 書籍を扱わない店（印刷店など）は除く
      const address = lib.strip((tds[1].match(/<div>([\s\S]*?)<\/div>/) || [])[1] || lib.strip(tds[1]).replace(/^〒[\d-]+\s*/, '')).split('\n')[0].trim();
      const name = /明屋|Haruya/i.test(branch) || OTHER_BRAND.test(branch) ? branch : `明屋書店 ${branch}`;
      list.push({ name, address, url: new URL(r.url, this.source).href });
    }
    if (list.length < 20) throw new Error(`店舗が少なすぎる（${list.length}件）。ページの作りが変わったかもしれない`);
    return lib.uniq(list);
  },
};
